import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { after, test } from 'node:test';

// Import both real handlers without rewriting their source or opening a listener.
// Only SDK clients and synthetic file reads are substituted. The invocation bridge
// models a raw response envelope; it does not prove SDK auth propagation or delivery.
let fixture;
const handlers = [];
const originalDeno = globalThis.Deno;
const originalFetch = globalThis.fetch;
const originalClientFactory = globalThis.__syntheticIntegrityNotificationClient;
globalThis.Deno = { serve(callback) { handlers.push(callback); } };
globalThis.__syntheticIntegrityNotificationClient = version =>
  version === '0.8.6' ? fixture.monitorClient : fixture.notificationClient;
globalThis.fetch = async (input, options) => {
  const url = input instanceof Request ? input.url : String(input);
  const method = options?.method || (input instanceof Request ? input.method : 'GET');
  if (method !== 'GET' || !Object.hasOwn(fixture.state.rawFiles, url)) {
    fixture.unexpected.push('Unexpected network request');
    throw new Error('Network forbidden outside synthetic evidence reads');
  }
  fixture.fetches.push(url);
  return new Response(Uint8Array.from(fixture.state.rawFiles[url]), {
    status: fixture.fileStatus
  });
};
const sdkUrls = new Map(['0.8.6', '0.8.4'].map(version => [
  `npm:@base44/sdk@${version}`,
  'data:text/javascript,' + encodeURIComponent(
    `export const createClientFromRequest = () => globalThis.__syntheticIntegrityNotificationClient('${version}');`
  )
]));
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (sdkUrls.has(specifier)) return { url: sdkUrls.get(specifier), shortCircuit: true };
    if (/^(npm:|https?:)/.test(specifier)) throw new Error('Unexpected provider import');
    return nextResolve(specifier, context);
  }
});
after(() => {
  hooks.deregister();
  globalThis.Deno = originalDeno;
  globalThis.fetch = originalFetch;
  if (originalClientFactory === undefined) delete globalThis.__syntheticIntegrityNotificationClient;
  else globalThis.__syntheticIntegrityNotificationClient = originalClientFactory;
});
await import('../monitorEvidenceIntegrity.ts');
assert.equal(handlers.length, 1, 'The real monitor must register exactly one handler');
const monitorHandler = handlers[0];
await import('../sendNotification.ts');
assert.equal(handlers.length, 2, 'The real notification producer must register exactly one handler');
const notificationHandler = handlers[1];

const rawBytes = [0, 1, 2, 3, 65, 66, 67, 255];
const computedHash = createHash('sha256').update(Uint8Array.from(rawBytes)).digest('hex');
const monitorUser = { email: 'reviewer@synthetic.invalid', role: 'admin', organization_id: 'org-a' };
const collector = 'collector@synthetic.invalid';
const REAL_PRODUCER = Symbol('real notification producer');
const REJECT_INVOCATION = Symbol('rejected notification invocation');

function evidence(index = 1, overrides = {}) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    organization_id: 'org-a', case_id: 'case-a', title: `Synthetic evidence ${index}`,
    collected_by: collector, file_url: `https://synthetic.invalid/evidence-${index}`,
    file_hash_sha256: 'f'.repeat(64),
    chain_of_custody: [{ action: 'collected', actor: collector, timestamp: '2026-11-04T12:00:00Z' }],
    ...overrides
  };
}

function setup(options = {}) {
  const items = options.items || [evidence()];
  const state = {
    evidence: items,
    rawFiles: Object.fromEntries(items.map(item => [item.file_url, [...rawBytes]])),
    caseRecord: { id: 'case-a', organization_id: 'org-a', evidence_count: items.length }
  };
  const active = fixture = {
    state, before: structuredClone(state), unexpected: [], fetches: [], reads: [],
    fileStatus: options.fileStatus || 200, invocations: [], producerResponses: [],
    checks: [], monitorAudits: [], recipientLookups: [], notificationAttempts: [],
    notifications: [], notificationAuditAttempts: [], notificationAudits: []
  };
  const unexpected = name => async () => {
    active.unexpected.push(name);
    throw new Error(`Unexpected backend operation: ${name}`);
  };
  const entities = (scope, allowed) => new Proxy({}, {
    get(_target, entity) {
      return new Proxy({}, {
        get(_entity, method) {
          return allowed[entity]?.[method] || unexpected(`${scope}.${String(entity)}.${String(method)}`);
        }
      });
    }
  });
  const monitorEntities = entities('monitor', {
    EvidenceV2: { async filter(query) {
      active.reads.push(structuredClone(query));
      // Return the actual fixture objects so direct evidence/custody mutations are detectable.
      return state.evidence.filter(item => Object.entries(query).every(([key, value]) => item[key] === value));
    } },
    EvidenceIntegrityCheck: { async create(record) {
      active.checks.push(structuredClone(record));
      return { id: `synthetic-check-${active.checks.length}` };
    } },
    AuditLog: { async create(record) {
      active.monitorAudits.push(structuredClone(record));
      return { id: `synthetic-monitor-audit-${active.monitorAudits.length}` };
    } }
  });
  const notificationEntities = entities('notification', {
    User: { async filter(query) {
      active.recipientLookups.push(structuredClone(query));
      return options.recipients || [{ email: query.email, organization_id: query.organization_id }];
    } },
    Notification: { async create(record) {
      active.notificationAttempts.push(structuredClone(record));
      if (options.notificationCreateFails) throw new Error('Synthetic notification creation failure');
      const created = { ...structuredClone(record), id: `synthetic-notification-${active.notifications.length + 1}` };
      active.notifications.push(created);
      return created;
    } },
    AuditLog: { async create(record) {
      active.notificationAuditAttempts.push(structuredClone(record));
      if (options.notificationAuditFails) throw new Error('Synthetic notification audit failure');
      active.notificationAudits.push(structuredClone(record));
      return { id: `synthetic-notification-audit-${active.notificationAudits.length}` };
    } }
  });
  const functions = { async invoke(name, payload) {
    active.invocations.push({ name, payload: structuredClone(payload) });
    if (name !== 'sendNotification') return unexpected('Unexpected function invocation')();
    const outcome = options.outcomes ? options.outcomes[active.invocations.length - 1] : REAL_PRODUCER;
    if (outcome === REJECT_INVOCATION) throw new Error('Synthetic invocation rejection');
    if (outcome !== REAL_PRODUCER) return outcome;
    const response = await notificationHandler(new Request('https://synthetic.invalid/sendNotification', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
    }));
    const result = { status: response.status, data: await response.json() };
    active.producerResponses.push(structuredClone(result));
    if (response.status < 200 || response.status >= 300) {
      const error = new Error('Synthetic invocation received an unsuccessful producer response');
      error.response = result;
      throw error;
    }
    return result;
  } };
  const integrations = { Core: new Proxy({}, { get(_target, name) {
    return unexpected(`Storage integration.${String(name)}`);
  } }) };
  active.monitorClient = {
    auth: { async me() { return monitorUser; } }, entities: monitorEntities, functions, integrations,
    asServiceRole: { entities: monitorEntities, functions, integrations }
  };
  const producerFunctions = { invoke: unexpected('Notification producer function invocation') };
  active.notificationClient = {
    auth: { async me() {
      return Object.hasOwn(options, 'notificationUser') ? options.notificationUser : monitorUser;
    } },
    entities: notificationEntities, functions: producerFunctions, integrations,
    asServiceRole: { entities: notificationEntities, functions: producerFunctions, integrations }
  };
}

async function request(body = { mode: 'single', evidence_id: fixture.state.evidence[0].id }) {
  const response = await monitorHandler(new Request('https://synthetic.invalid/monitorEvidenceIntegrity', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  }));
  return { response, body: await response.json() };
}

function preserved() {
  assert.deepEqual(fixture.state, fixture.before, 'Evidence bytes, metadata, custody and case count must remain intact');
  assert.deepEqual(fixture.unexpected, [], 'No deletion, update or unexpected backend/network attempt is permitted');
}

function scanResult(result, passed, failed, errors) {
  assert.equal(result.response.status, 200);
  assert.equal(result.body.success, true);
  const checked = passed + failed + errors;
  assert.deepEqual({ checked: result.body.checked, passed: result.body.passed,
    failed: result.body.failed, errors: result.body.errors, drift: result.body.drift_detected_count },
  { checked, passed, failed, errors, drift: failed });
  assert.equal(fixture.checks.length, checked);
  assert.equal(result.body.results.length, checked);
  assert.equal(fixture.monitorAudits.length, 1);
  const audit = fixture.monitorAudits[0];
  assert.equal(audit.event_type, 'integrity_check_completed');
  assert.deepEqual({ checked: audit.metadata.total_checked, passed: audit.metadata.passed,
    failed: audit.metadata.failed, errors: audit.metadata.errors }, { checked, passed, failed, errors });
  preserved();
}

function singleMismatch(result, alertSent) {
  scanResult(result, 0, 1, 0);
  assert.equal(fixture.invocations.length, 1, 'A notification must be attempted exactly once');
  const check = fixture.checks[0];
  assert.equal(check.status, 'fail');
  assert.equal(check.drift_detected, true);
  assert.equal(check.alert_sent, alertSent);
  assert.equal(check.original_hash, fixture.state.evidence[0].file_hash_sha256);
  assert.equal(check.computed_hash, computedHash);
  assert.equal(check.error_message, null, 'Notification failure must not replace the observed hash mismatch');
  assert.equal(result.body.results[0].status, 'fail');
}

test('the real producer confirms the collector and high severity before an alert is recorded as sent', async () => {
  setup();
  const result = await request();
  assert.equal(fixture.invocations[0].payload.userEmail, collector);
  assert.equal(fixture.invocations[0].payload.severity, 'high');
  assert.deepEqual(fixture.recipientLookups, [{ email: collector, organization_id: 'org-a' }]);
  assert.equal(fixture.producerResponses[0].status, 200);
  assert.equal(fixture.producerResponses[0].data.success, true);
  assert.equal(fixture.producerResponses[0].data.notificationId, 'synthetic-notification-1');
  assert.equal(fixture.notifications.length, 1);
  assert.equal(fixture.notifications[0].user_email, collector);
  assert.equal(fixture.notifications[0].severity, 'high');
  assert.equal(fixture.notifications[0].type, 'security_alert');
  assert.equal(fixture.notificationAudits.length, 1);
  singleMismatch(result, true);
});

test('a missing collector falls back to the authenticated user through the real producer', async () => {
  setup({ items: [evidence(1, { collected_by: undefined })] });
  const result = await request();
  assert.equal(fixture.invocations[0].payload.userEmail, monitorUser.email);
  assert.equal(fixture.notifications.length, 1);
  assert.equal(fixture.notifications[0].user_email, monitorUser.email);
  singleMismatch(result, true);
});

test('a rejected invocation leaves the mismatch intact and its notification unconfirmed', async () => {
  setup({ outcomes: [REJECT_INVOCATION] });
  const result = await request();
  singleMismatch(result, false);
  assert.equal(fixture.producerResponses.length, 0);
  assert.equal(fixture.notifications.length, 0);
});

test('resolved incomplete or contradictory responses never confirm a notification', async () => {
  const acknowledged = { success: true, notificationId: 'synthetic-acknowledgment' };
  const cases = [
    ['undefined response', undefined], ['null response', null], ['empty response', {}],
    ['body without envelope', acknowledged], ['missing body', { status: 200 }],
    ['null body', { status: 200, data: null }],
    ...[false, 'true', 1, undefined].map(success =>
      [`non-boolean success ${String(success)}`, { status: 200, data: { ...acknowledged, success } }]),
    ...[undefined, '', '   ', 7, {}].map(notificationId =>
      [`invalid identifier ${JSON.stringify(notificationId)}`, { status: 200, data: { ...acknowledged, notificationId } }]),
    ...[undefined, '200', 199, 300, 401, 403, 404, 500, 200.5].map(status =>
      [`invalid status ${String(status)}`, { status, data: acknowledged }])
  ];
  for (const [label, outcome] of cases) {
    setup({ outcomes: [outcome] });
    const result = await request();
    assert.equal(fixture.checks[0]?.alert_sent, false, label);
    singleMismatch(result, false);
    assert.equal(fixture.notifications.length, 0, label);
  }
});

test('a real producer organization refusal is not recorded as a successful alert', async () => {
  setup({ notificationUser: { email: monitorUser.email } });
  const result = await request();
  assert.equal(fixture.producerResponses[0].status, 403);
  assert.equal(fixture.recipientLookups.length, 0);
  assert.equal(fixture.notifications.length, 0);
  singleMismatch(result, false);
});

test('a real producer recipient-scope refusal is not recorded as a successful alert', async () => {
  setup({ recipients: [{ email: collector, organization_id: 'org-other' }] });
  const result = await request();
  assert.equal(fixture.producerResponses[0].status, 404);
  assert.equal(fixture.recipientLookups.length, 1);
  assert.equal(fixture.notifications.length, 0);
  singleMismatch(result, false);
});

test('a real producer notification creation failure leaves the alert unconfirmed', async () => {
  setup({ notificationCreateFails: true });
  const result = await request();
  assert.equal(fixture.producerResponses[0].status, 500);
  assert.equal(fixture.notificationAttempts.length, 1);
  assert.equal(fixture.notifications.length, 0);
  assert.equal(fixture.notificationAuditAttempts.length, 0);
  singleMismatch(result, false);
});

test('creation followed by a real producer audit failure remains unconfirmed without a retry', async () => {
  setup({ notificationAuditFails: true });
  const result = await request();
  assert.equal(fixture.producerResponses[0].status, 500);
  assert.equal(fixture.notificationAttempts.length, 1);
  assert.equal(fixture.notifications.length, 1, 'Unconfirmed does not mean notification creation did not occur');
  assert.equal(fixture.notificationAuditAttempts.length, 1);
  assert.equal(fixture.notificationAudits.length, 0);
  singleMismatch(result, false);
});

test('matching hashes and inaccessible files do not attempt drift notifications', async () => {
  for (const accessible of [true, false]) {
    setup(accessible ? { items: [evidence(1, { file_hash_sha256: computedHash })] } : { fileStatus: 503 });
    const result = await request();
    scanResult(result, accessible ? 1 : 0, 0, accessible ? 0 : 1);
    assert.equal(fixture.checks[0].status, accessible ? 'pass' : 'error');
    assert.equal(fixture.checks[0].drift_detected, false);
    assert.equal(fixture.checks[0].alert_sent, false);
    assert.equal(fixture.invocations.length, 0);
    assert.equal(fixture.notifications.length, 0);
  }
});

test('each evidence item keeps its own confirmed or unconfirmed notification outcome', async () => {
  setup({
    items: [evidence(1), evidence(2), evidence(3, { file_hash_sha256: computedHash })],
    outcomes: [REAL_PRODUCER, REJECT_INVOCATION]
  });
  const result = await request({ mode: 'all' });
  scanResult(result, 1, 2, 0);
  assert.deepEqual(fixture.checks.map(check => check.status), ['fail', 'fail', 'pass']);
  assert.deepEqual(fixture.checks.map(check => check.drift_detected), [true, true, false]);
  assert.deepEqual(fixture.checks.map(check => check.alert_sent), [true, false, false]);
  assert.equal(fixture.invocations.length, 2);
  assert.equal(fixture.notifications.length, 1);
  assert.equal(fixture.notificationAudits.length, 1);
});
