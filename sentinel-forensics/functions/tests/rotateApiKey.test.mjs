import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { after, test } from 'node:test';

// Run the real rotation handler with a synthetic SDK and fixed clock. This
// checks organization scope, not provider behavior or multi-write atomicity.
let fixture;
const handlers = [];
const RealDate = globalThis.Date;
const originalDeno = globalThis.Deno;
const originalFetch = globalThis.fetch;
const originalFactory = globalThis.__syntheticRotateApiKeyClient;
const NOW = RealDate.parse('2026-11-04T12:00:00.000Z');
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return NOW; }
};
globalThis.Deno = { serve(handler) { handlers.push(handler); } };
globalThis.__syntheticRotateApiKeyClient = () => fixture.client;
globalThis.fetch = async () => {
  fixture.unexpected.push('network request');
  throw new Error('Network is forbidden in this synthetic test');
};
const sdkUrl = 'data:text/javascript,' + encodeURIComponent(
  'export const createClientFromRequest = () => globalThis.__syntheticRotateApiKeyClient();'
);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'npm:@base44/sdk@0.8.6') return { url: sdkUrl, shortCircuit: true };
    if (/^(npm:|https?:)/.test(specifier)) throw new Error('Unexpected provider import');
    return nextResolve(specifier, context);
  }
});
after(() => {
  hooks.deregister();
  globalThis.Date = RealDate;
  globalThis.Deno = originalDeno;
  globalThis.fetch = originalFetch;
  if (originalFactory === undefined) delete globalThis.__syntheticRotateApiKeyClient;
  else globalThis.__syntheticRotateApiKeyClient = originalFactory;
});
await import('../rotateApiKey.ts');
assert.equal(handlers.length, 1, 'The real rotation endpoint must register exactly one handler');
const handler = handlers[0];
const admin = { id: 'synthetic-admin-a', role: 'admin', organization_id: 'org-a' };

function setup(options = {}) {
  const own = {
    id: 'key-a', organization_id: 'org-a', case_id: 'case-a', schema_version: '1.0.0',
    name: 'Synthetic key', status: 'active', scopes: ['cases:read', 'evidence:read'],
    rate_limit: { requests_per_minute: 60, burst: 2 }, ip_allowlist: ['192.0.2.1'],
    expires_at: '2030-01-01T00:00:00.000Z', created_by_user_id: 'synthetic-admin-a',
    notes: 'Synthetic fixture only', key_prefix: 'synthetic-prefix-a',
    key_hash_sha256: createHash('sha256').update('synthetic-old-secret').digest('hex')
  };
  const keys = [own,
    { ...structuredClone(own), id: 'key-other', case_id: 'case-other' },
    { ...structuredClone(own), id: 'key-foreign', organization_id: 'org-b', case_id: 'case-b' }
  ];
  const state = { keys, buckets: keys.map(key => ({
    id: 'bucket-' + key.id, organization_id: key.organization_id, api_key_id: key.id,
    schema_version: '1.0.0', bucket: { capacity: 2, tokens: 1, refill_per_sec: 1,
      last_refill_at: new RealDate(NOW).toISOString() }
  })) };
  const active = fixture = {
    state, before: structuredClone(state), authCalls: 0, lookups: [], updateAttempts: [],
    updates: [], creations: [], bucketCreations: [], unexpected: []
  };
  const forbidden = name => async () => {
    active.unexpected.push(name);
    throw new Error('Unexpected backend operation: ' + name);
  };
  const entities = (scope, allowed = {}) => new Proxy({}, {
    get(_target, entity) {
      return new Proxy({}, { get(_entity, method) {
        return allowed[entity]?.[method] || forbidden(`${scope}.${String(entity)}.${String(method)}`);
      } });
    }
  });
  const serviceEntities = entities('service', {
    ApiKey: {
      async filter(query) {
        active.lookups.push(structuredClone(query));
        if (options.lookupError) throw new Error('Synthetic key lookup failure');
        if (options.lookup) return structuredClone(options.lookup(state.keys));
        return structuredClone(state.keys.filter(key =>
          Object.entries(query).every(([name, value]) => key[name] === value)));
      },
      async update(id, value) {
        active.updateAttempts.push({ id, value: structuredClone(value) });
        if (options.revokeError) throw new Error('Synthetic revoke failure before write');
        assert.deepEqual(value, { status: 'revoked' });
        const key = state.keys.find(row => row.id === id);
        assert.ok(key, 'The requested synthetic key must exist');
        Object.assign(key, value);
        active.updates.push({ id, value: structuredClone(value) });
        return structuredClone(key);
      },
      async create(value) {
        active.creations.push(structuredClone(value));
        const key = { ...structuredClone(value), id: 'synthetic-new-key-' + active.creations.length };
        state.keys.push(key);
        return structuredClone(key);
      }
    },
    ApiKeyRateLimitState: { async create(value) {
      active.bucketCreations.push(structuredClone(value));
      const bucket = { ...structuredClone(value), id: 'synthetic-new-bucket-' + active.bucketCreations.length };
      state.buckets.push(bucket);
      return structuredClone(bucket);
    } }
  });
  const functions = new Proxy({}, { get(_target, name) { return forbidden('function.' + String(name)); } });
  const integrations = entities('integration');
  active.client = {
    auth: { async me() {
      active.authCalls++;
      return structuredClone(Object.hasOwn(options, 'user') ? options.user : admin);
    } },
    entities: entities('user'), functions, integrations,
    asServiceRole: { entities: serviceEntities, functions, integrations }
  };
}

async function request(body = { apiKeyId: 'key-a' }) {
  const response = await handler(new Request('https://synthetic.invalid/rotateApiKey', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }));
  return { status: response.status, body: await response.json() };
}

function refused(result, status, lookups, updateAttempts = 0) {
  assert.equal(result.status, status);
  assert.equal(Object.hasOwn(result.body, 'secretKey'), false);
  assert.equal(Object.hasOwn(result.body, 'newApiKeyId'), false);
  assert.equal(fixture.authCalls, 1);
  assert.equal(fixture.lookups.length, lookups);
  assert.equal(fixture.updateAttempts.length, updateAttempts);
  assert.deepEqual(fixture.updates, []);
  assert.deepEqual(fixture.creations, []);
  assert.deepEqual(fixture.bucketCreations, []);
  assert.deepEqual(fixture.state, fixture.before, 'Refusal must preserve every existing key and bucket');
  assert.deepEqual(fixture.unexpected, []);
}

function rotated(result) {
  assert.equal(result.status, 200);
  assert.equal(fixture.authCalls, 1);
  assert.equal(fixture.lookups.length, 1);
  assert.equal(fixture.lookups[0].id, 'key-a');
  assert.deepEqual(fixture.updates, [{ id: 'key-a', value: { status: 'revoked' } }]);
  assert.equal(fixture.updateAttempts.length, 1);
  assert.equal(fixture.creations.length, 1);
  assert.equal(fixture.bucketCreations.length, 1);
  assert.match(result.body.secretKey, /^sfk_live_[A-Za-z0-9_-]{43}$/);
  const old = fixture.before.keys[0];
  const created = fixture.creations[0];
  assert.deepEqual(created, {
    organization_id: 'org-a', case_id: old.case_id, schema_version: '1.0.0',
    name: old.name + ' (rotated)', key_prefix: result.body.secretKey.substring(0, 20),
    key_hash_sha256: createHash('sha256').update(result.body.secretKey).digest('hex'),
    status: 'active', scopes: old.scopes, rate_limit: old.rate_limit,
    ip_allowlist: old.ip_allowlist, expires_at: old.expires_at,
    created_by_user_id: admin.id, notes: old.notes
  });
  assert.deepEqual(result.body, {
    oldKeyId: 'key-a', newApiKeyId: 'synthetic-new-key-1', name: created.name,
    keyPrefix: created.key_prefix, scopes: old.scopes, rateLimit: old.rate_limit,
    expiresAt: old.expires_at, secretKey: result.body.secretKey
  });
  assert.deepEqual(fixture.bucketCreations[0], {
    organization_id: 'org-a', api_key_id: 'synthetic-new-key-1', schema_version: '1.0.0',
    bucket: { capacity: old.rate_limit.burst, tokens: old.rate_limit.burst,
      refill_per_sec: old.rate_limit.requests_per_minute / 60,
      last_refill_at: new RealDate(NOW).toISOString() }
  });
  assert.deepEqual(fixture.state.keys.slice(0, 3),
    fixture.before.keys.map(key => key.id === 'key-a' ? { ...key, status: 'revoked' } : key));
  assert.deepEqual(fixture.state.buckets.slice(0, 3), fixture.before.buckets);
  assert.equal(fixture.state.keys.length, 4);
  assert.equal(fixture.state.buckets.length, 4);
  assert.equal(Object.hasOwn(fixture.state.keys[3], 'secretKey'), false);
  assert.deepEqual(fixture.unexpected, []);
}

test('an administrator cannot rotate another organization key or receive a replacement secret', async () => {
  setup();
  refused(await request({ apiKeyId: 'key-foreign' }), 404, 1);
  assert.deepEqual(fixture.lookups, [{ id: 'key-foreign', organization_id: 'org-a' }]);
});

test('missing or malformed authenticated organization context is refused before lookup', async () => {
  for (const organization_id of [undefined, null, '', ' ', {}, [], 42, false]) {
    setup({ user: { ...admin, organization_id } });
    refused(await request(), 403, 0);
  }
});

test('operator objects and other non-string key identifiers are refused before lookup', async () => {
  for (const apiKeyId of [{ $ne: null }, ['key-a'], 42, true]) {
    setup();
    refused(await request({ apiKeyId }), 400, 0);
  }
});

test('whitespace-only key identifiers are refused before lookup', async () => {
  for (const apiKeyId of [' ', '\t', '\n']) {
    setup();
    refused(await request({ apiKeyId }), 400, 0);
  }
});

test('a returned key with the requested ID but a different organization is refused before writes', async () => {
  setup({ lookup: keys => [{ ...keys[0], organization_id: 'org-b' }] });
  refused(await request(), 404, 1);
  assert.deepEqual(fixture.lookups, [{ id: 'key-a', organization_id: 'org-a' }]);
});

test('a returned key in the correct organization but with another ID is refused before writes', async () => {
  setup({ lookup: keys => [keys[1]] });
  refused(await request(), 404, 1);
});

test('ambiguous or malformed lookup results cannot select a key for rotation', async () => {
  for (const lookup of [keys => [keys[0], keys[0]], () => null, () => undefined,
    keys => ({ 0: keys[0], length: 1 }), () => ({}), () => 'unexpected', () => [null], () => [42]]) {
    setup({ lookup });
    refused(await request(), 404, 1);
  }
});

test('unauthenticated and non-admin callers retain their refusal before entity access', async () => {
  for (const user of [null, { ...admin, role: 'viewer' }, { ...admin, role: 'investigator' }]) {
    setup({ user });
    refused(await request(), 403, 0);
  }
});

test('missing and empty key identifiers retain their refusal before lookup', async () => {
  for (const body of [{}, { apiKeyId: null }, { apiKeyId: '' }, { apiKeyId: false }, { apiKeyId: 0 }]) {
    setup();
    refused(await request(body), 400, 0);
  }
});

test('an unknown key retains its not-found response without mutation or disclosure', async () => {
  setup();
  refused(await request({ apiKeyId: 'key-missing' }), 404, 1);
  assert.equal(fixture.lookups[0].id, 'key-missing');
});

test('same-organization rotation preserves configuration and returns the matching replacement secret', async () => {
  setup();
  rotated(await request());
});

test('request-body organization and configuration fields cannot override authenticated rotation scope', async () => {
  setup();
  rotated(await request({ apiKeyId: 'key-a', organization_id: 'org-b', organizationId: 'org-b',
    caseId: 'case-b', scopes: ['admin:all'], expiresAt: null }));
});

test('a failed lookup returns an error without any key or bucket mutation', async () => {
  setup({ lookupError: true });
  refused(await request(), 500, 1);
});

test('a revoke failure before its write cannot issue a replacement key or secret', async () => {
  setup({ revokeError: true });
  refused(await request(), 500, 1, 1);
});
