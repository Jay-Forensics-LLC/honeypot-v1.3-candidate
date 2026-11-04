import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { after, test } from 'node:test';

// Load the actual endpoint and its real input validator. Only the SDK boundary
// and clock are synthetic; these tests do not qualify provider authorization.
let fixture;
const handlers = [];
const RealDate = globalThis.Date;
const originalDeno = globalThis.Deno;
const originalFetch = globalThis.fetch;
const originalFactory = globalThis.__syntheticGuardianClient;
const NOW = RealDate.parse('2026-11-04T12:00:00.000Z');
let clock = NOW;
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
};
globalThis.Deno = { serve(handler) { handlers.push(handler); } };
globalThis.__syntheticGuardianClient = () => fixture.client;
globalThis.fetch = async () => {
  fixture.unexpected.push('network request');
  throw new Error('Network is forbidden in this synthetic test');
};
const sdkUrl = 'data:text/javascript,' + encodeURIComponent(
  'export const createClientFromRequest = () => globalThis.__syntheticGuardianClient();'
);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'npm:@base44/sdk@0.7.1') return { url: sdkUrl, shortCircuit: true };
    if (/^(npm:|https?:)/.test(specifier)) throw new Error('Unexpected provider import');
    return nextResolve(specifier, context);
  }
});
after(() => {
  hooks.deregister();
  globalThis.Date = RealDate;
  globalThis.Deno = originalDeno;
  globalThis.fetch = originalFetch;
  if (originalFactory === undefined) delete globalThis.__syntheticGuardianClient;
  else globalThis.__syntheticGuardianClient = originalFactory;
});
await import('../verifyGuardianToken.ts');
assert.equal(handlers.length, 1, 'The real endpoint must register exactly one handler');
const handler = handlers[0];
const capability = { token: 'synthetic-capability-a', case_id: 'synthetic-case-a' };

function token(overrides = {}) {
  return {
    id: 'synthetic-token-a', token_hash: capability.token, case_id: capability.case_id,
    revoked: false, created_by: 'owner@synthetic.invalid',
    expires_at: '2026-11-04T13:00:00.000Z', ...overrides
  };
}

function setup(options = {}) {
  clock = NOW;
  const state = { tokens: options.tokens || [token()] };
  const active = fixture = {
    state, before: structuredClone(state), queries: [], auditAttempts: [], audits: [], unexpected: []
  };
  const forbidden = name => async () => {
    active.unexpected.push(name);
    throw new Error('Unexpected backend operation: ' + name);
  };
  const entities = (scope, allowed = {}) => new Proxy({}, {
    get(_target, entity) {
      return new Proxy({}, {
        get(_entity, method) {
          return allowed[entity]?.[method] || forbidden(`${scope}.${String(entity)}.${String(method)}`);
        }
      });
    }
  });
  const serviceEntities = entities('service', {
    GuardianAccessToken: { async filter(query) {
      active.queries.push(structuredClone(query));
      if (options.lookupFails) throw new Error('Synthetic token lookup failure');
      if (options.afterLookupTime !== undefined) clock = options.afterLookupTime;
      // Return fixture objects directly so unexpected token mutation is observable.
      return state.tokens.filter(row => Object.entries(query).every(([key, value]) => row[key] === value));
    } },
    AuditLog: { async create(record) {
      active.auditAttempts.push(structuredClone(record));
      if (options.auditFails) throw new Error('Synthetic audit failure');
      active.audits.push(structuredClone(record));
      return { id: 'synthetic-audit-a' };
    } }
  });
  const functions = new Proxy({}, { get(_target, name) { return forbidden('function.' + String(name)); } });
  const integrations = entities('integration');
  active.client = {
    auth: { me: forbidden('auth.me') }, entities: entities('user'), functions, integrations,
    asServiceRole: { entities: serviceEntities, functions, integrations }
  };
}

async function request(body = capability, raw = false) {
  const response = await handler(new Request('https://synthetic.invalid/verifyGuardianToken', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: raw ? body : JSON.stringify(body)
  }));
  return { status: response.status, body: await response.json() };
}

function preserved() {
  assert.deepEqual(fixture.state, fixture.before, 'Stored token records must remain unchanged');
  assert.deepEqual(fixture.unexpected, [], 'No unrelated entity, function, integration or network call is allowed');
}

function exactLookup(body = capability) {
  assert.deepEqual(fixture.queries, [{ token_hash: body.token, case_id: body.case_id, revoked: false }]);
}

function refused(result, reason) {
  assert.equal(result.status, 200);
  assert.equal(result.body.valid, false, 'Unconfirmed or expired capability must not grant access');
  if (reason !== undefined) assert.equal(result.body.reason, reason);
  assert.deepEqual(fixture.auditAttempts, [], 'Rejected capability must not attempt a successful-access audit');
  assert.deepEqual(fixture.audits, []);
  preserved();
}

test('a missing stored expiry is refused before any successful-access audit', async () => {
  const record = token();
  delete record.expires_at;
  setup({ tokens: [record] });
  refused(await request(), 'Token expired');
  exactLookup();
});

test('empty, unparseable and out-of-range stored expiry strings are refused', async () => {
  for (const expires_at of ['', '   ', 'not-a-timestamp', '2026-13-04T12:00:00Z', '+999999-01-01T00:00:00Z']) {
    setup({ tokens: [token({ expires_at })] });
    refused(await request(), 'Token expired');
    exactLookup();
  }
});

test('non-string expiry values cannot be coerced into a future expiry', async () => {
  for (const expires_at of [['2026-11-04T13:00:00.000Z'], NOW + 3600000, {}, null, true, false]) {
    setup({ tokens: [token({ expires_at })] });
    refused(await request(), 'Token expired');
    exactLookup();
  }
});

test('the exact expiry instant is already expired', async () => {
  setup({ tokens: [token({ expires_at: '2026-11-04T12:00:00.000Z' })] });
  refused(await request(), 'Token expired');
  exactLookup();
});

test('past UTC and offset expiry instants remain refused without record changes', async () => {
  for (const expires_at of ['2026-11-04T11:59:59.999Z', '2026-11-04T06:59:59.999-05:00']) {
    setup({ tokens: [token({ expires_at })] });
    refused(await request(), 'Token expired');
    exactLookup();
  }
});

test('future UTC and offset expiry instants retain the exact capability and one successful audit', async () => {
  for (const expires_at of ['2026-11-04T12:00:00.001Z', '2026-11-04T13:00:00Z', '2026-11-04T08:00:00-05:00']) {
    setup({ tokens: [token({ expires_at })] });
    const result = await request();
    assert.deepEqual(result, { status: 200, body: { valid: true } });
    exactLookup();
    assert.deepEqual(fixture.audits, [{
      event_type: 'guardian_access', severity: 'info',
      description: `Guardian accessed case ${capability.case_id}`,
      user_id: 'owner@synthetic.invalid', timestamp: '2026-11-04T12:00:00.000Z', success: true,
      metadata: { case_id: capability.case_id, token_id: 'synthetic-token-a' }
    }]);
    assert.deepEqual(fixture.auditAttempts, fixture.audits);
    preserved();
  }
});

test('expiry is checked after a token lookup that crosses the expiration time', async () => {
  setup({ tokens: [token({ expires_at: '2026-11-04T12:00:00.001Z' })], afterLookupTime: NOW + 2 });
  refused(await request(), 'Token expired');
  exactLookup();
});

test('the real input validator rejects malformed capability values before entity lookup', async () => {
  for (const body of [null, [], {}, { ...capability, token: { $ne: null } },
    { ...capability, token: [capability.token] }, { ...capability, token: '' },
    { ...capability, case_id: { $ne: null } }, { ...capability, case_id: [capability.case_id] },
    { ...capability, case_id: 123 }, { ...capability, case_id: '   ' }]) {
    setup();
    refused(await request(body), 'Missing parameters');
    assert.deepEqual(fixture.queries, []);
  }
});

test('unknown, mismatched and revoked capabilities never produce a successful-access audit', async () => {
  const cases = [
    { tokens: [], body: capability },
    { tokens: [token()], body: { ...capability, token: 'synthetic-other-capability' } },
    { tokens: [token()], body: { ...capability, case_id: 'synthetic-other-case' } },
    { tokens: [token({ revoked: true })], body: capability }
  ];
  for (const item of cases) {
    setup({ tokens: item.tokens });
    refused(await request(item.body), 'Invalid token');
    exactLookup(item.body);
  }
});

test('a failed lookup refuses access without an audit or retry', async () => {
  setup({ lookupFails: true });
  refused(await request());
  exactLookup();
});

test('a failed audit leaves access unconfirmed and does not retry or mutate the token', async () => {
  setup({ auditFails: true });
  const result = await request();
  assert.equal(result.status, 200);
  assert.equal(result.body.valid, false);
  exactLookup();
  assert.equal(fixture.auditAttempts.length, 1);
  assert.deepEqual(fixture.audits, []);
  preserved();
});

test('malformed request JSON refuses access before token lookup', async () => {
  setup();
  refused(await request('{', true));
  assert.deepEqual(fixture.queries, []);
});
