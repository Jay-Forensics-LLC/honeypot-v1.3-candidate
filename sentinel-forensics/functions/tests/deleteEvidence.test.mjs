import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { after, test } from 'node:test';

// Load the real endpoint, RBAC and validator. Replace only the provider SDK.
// Deno.serve captures the handler without opening a listener; fixtures are synthetic.
let fixture;
const handlers = [];
const originalDeno = globalThis.Deno;
const originalFetch = globalThis.fetch;
globalThis.Deno = { serve(callback) { handlers.push(callback); } };
globalThis.fetch = () => { throw new Error('Network forbidden in evidence-deletion tests'); };
globalThis.__syntheticEvidenceDeletionClient = () => fixture.client;
const sdk = 'data:text/javascript,export const createClientFromRequest = () => globalThis.__syntheticEvidenceDeletionClient();';
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'npm:@base44/sdk@0.8.4') return { url: sdk, shortCircuit: true };
    if (/^(npm:|https?:)/.test(specifier)) throw new Error('Unexpected provider import');
    return nextResolve(specifier, context);
  }
});
after(() => {
  hooks.deregister();
  globalThis.Deno = originalDeno;
  globalThis.fetch = originalFetch;
  delete globalThis.__syntheticEvidenceDeletionClient;
});
await import('../deleteEvidence.ts');
assert.equal(handlers.length, 1, 'Only the endpoint may register a request handler');
const handler = handlers[0];
const evidenceId = '00000000-0000-4000-8000-000000000001';

function setup(options = {}) {
  const state = {
    evidence: {
      id: evidenceId,
      organization_id: 'org-a',
      case_id: 'case-a',
      title: 'Synthetic retained evidence',
      legal_hold: false,
      file_url: 'https://synthetic.invalid/retained-evidence',
      file_hash_sha256: 'a'.repeat(64),
      chain_of_custody: [
        { action: 'collected', actor: 'collector@synthetic.invalid', timestamp: '2026-11-04T12:00:00Z' },
        { action: 'reviewed', actor: 'reviewer@synthetic.invalid', timestamp: '2026-11-04T12:01:00Z' }
      ],
      ...options.evidence
    },
    caseRecord: { id: 'case-a', organization_id: 'org-a', evidence_count: 1 },
    rawFile: [0, 1, 2, 3],
    audit: []
  };
  if (options.missing) state.evidence = null;
  fixture = { state, before: structuredClone(state), reads: [], unexpected: [], authReads: 0 };
  const unexpected = name => async () => {
    fixture.unexpected.push(name);
    throw new Error(`Unexpected backend operation: ${name}`);
  };
  const entities = new Proxy({}, {
    get(_target, entity) {
      return new Proxy({}, {
        get(_entity, method) {
          if (entity === 'EvidenceV2' && method === 'get') {
            return async id => {
              fixture.reads.push(id);
              if (options.readFails) throw new Error('Synthetic backend read failure');
              return state.evidence;
            };
          }
          return unexpected(`${String(entity)}.${String(method)}`);
        }
      });
    }
  });
  const functions = { invoke: unexpected('functions.invoke') };
  const integrations = { Core: { DeletePrivateFile: unexpected('DeletePrivateFile') } };
  fixture.client = {
    auth: { async me() {
      fixture.authReads++;
      if (options.authFails) throw new Error('Synthetic authentication failure');
      if (Object.hasOwn(options, 'user')) return options.user;
      return { email: 'admin@synthetic.invalid', role: 'admin', organization_id: 'org-a' };
    } },
    entities,
    functions,
    integrations,
    asServiceRole: { entities, functions, integrations }
  };
}

async function request(body = { evidence_id: evidenceId }) {
  const response = await handler(new Request('https://synthetic.invalid/deleteEvidence', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }));
  return { response, body: await response.json() };
}

function preserved() {
  assert.deepEqual(fixture.state, fixture.before, 'Full evidence, custody, file, case count and audit must remain intact');
  assert.deepEqual(fixture.unexpected, [], 'No audit, storage mutation, case access or other backend operation is permitted');
}

test('authorized deletion is refused without changing evidence, custody or case state', async () => {
  setup();
  const { response, body } = await request();
  assert.equal(response.status, 403);
  assert.equal(body.success, false);
  assert.equal(body.code, 'EVIDENCE_DELETION_DISABLED');
  assert.deepEqual(fixture.reads, [evidenceId]);
  assert.equal(fixture.authReads, 1);
  preserved();
});

test('retries and force or audit-bypass flags cannot enable permanent deletion', async () => {
  setup();
  for (let attempt = 0; attempt < 2; attempt++) {
    const { response, body } = await request({
      evidence_id: evidenceId, force: true, permanent: true, skip_audit: true,
      reason: 'Synthetic authorized retirement request'
    });
    assert.equal(response.status, 403);
    assert.equal(body.code, 'EVIDENCE_DELETION_DISABLED');
    preserved();
  }
  assert.deepEqual(fixture.reads, [evidenceId, evidenceId]);
});

test('real RBAC rejects unauthenticated and non-admin users before evidence lookup', async () => {
  for (const options of [
    { user: null },
    { authFails: true },
    { user: { role: 'analyst', organization_id: 'org-a' } }
  ]) {
    setup(options);
    const { response, body } = await request();
    assert.equal(response.status, 403);
    assert.equal(body.code, 'FORBIDDEN');
    assert.equal(fixture.authReads, 1);
    assert.deepEqual(fixture.reads, []);
    preserved();
  }
});

test('missing or malformed organization context is refused before evidence lookup', async () => {
  for (const organization_id of [undefined, null, '', ' ', {}, 42]) {
    setup({ user: { role: 'admin', organization_id } });
    const { response, body } = await request();
    assert.equal(response.status, 403);
    assert.equal(body.code, 'FORBIDDEN');
    assert.deepEqual(fixture.reads, []);
    preserved();
  }
});

test('the real validator rejects malformed requests before evidence lookup', async () => {
  for (const value of [null, [], {}, { evidence_id: [] }, { evidence_id: 42 },
    { evidence_id: '' }, { evidence_id: 'not-a-uuid' }]) {
    setup();
    const { response, body } = await request(value);
    assert.equal(response.status, 400);
    assert.equal(body.code, 'INVALID_INPUT');
    assert.deepEqual(fixture.reads, []);
    preserved();
  }
  setup();
  const response = await handler(new Request('https://synthetic.invalid/deleteEvidence', {
    method: 'POST', body: '{'
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(fixture.reads, []);
  preserved();
});

test('missing evidence retains its distinct not-found response', async () => {
  setup({ missing: true });
  const { response, body } = await request();
  assert.equal(response.status, 404);
  assert.equal(body.code, 'NOT_FOUND');
  assert.deepEqual(fixture.reads, [evidenceId]);
  preserved();
});

test('cross-organization evidence is refused before legal-hold details are considered', async () => {
  setup({ evidence: { organization_id: 'org-b', legal_hold: true,
    legal_hold_metadata: { note: 'Synthetic restricted hold details' } } });
  const { response, body } = await request();
  assert.equal(response.status, 403);
  assert.equal(body.code, 'FORBIDDEN');
  assert.equal(JSON.stringify(body).includes('Synthetic restricted hold details'), false);
  preserved();
});

test('same-organization legal holds retain their distinct refusal', async () => {
  setup({ evidence: { legal_hold: true } });
  const { response, body } = await request();
  assert.equal(response.status, 403);
  assert.equal(body.code, 'LEGAL_HOLD');
  preserved();
});

test('a failed evidence lookup returns an error without a completed-deletion event', async () => {
  setup({ readFails: true });
  const { response, body } = await request();
  assert.equal(response.status, 500);
  assert.equal(body.success, false);
  assert.equal(body.code, 'INTERNAL_ERROR');
  assert.deepEqual(fixture.reads, [evidenceId]);
  preserved();
});
