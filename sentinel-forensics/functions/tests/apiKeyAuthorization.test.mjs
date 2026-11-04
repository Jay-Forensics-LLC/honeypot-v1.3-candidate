import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { after, test } from 'node:test';

// Import the real endpoint and middleware, replacing only the provider SDK.
// No provider package is loaded and Deno.serve captures a handler without binding.
let handler;
let fixture;
const originalDeno = globalThis.Deno;
const originalFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error('Network forbidden in synthetic authorization tests'); };
globalThis.Deno = { serve(callback) { handler = callback; } };
globalThis.__syntheticApiKeyClient = () => fixture.client;
const sdk = 'data:text/javascript,export const createClientFromRequest = () => globalThis.__syntheticApiKeyClient();';
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'npm:@base44/sdk@0.8.6') return { url: sdk, shortCircuit: true };
    if (/^(npm:|https?:)/.test(specifier)) throw new Error('Unexpected provider import');
    return nextResolve(specifier, context);
  }
});
await import('../apiCasesRead.ts');
after(() => {
  hooks.deregister();
  globalThis.Deno = originalDeno;
  globalThis.fetch = originalFetch;
  delete globalThis.__syntheticApiKeyClient;
});

const secret = 'synthetic-api-key-for-offline-tests';
const keyHash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))).toString('hex');
const records = [
  { id: 'case-a', organization_id: 'org-a', title: 'Permitted case' },
  { id: 'case-b', organization_id: 'org-a', title: 'Other case' },
  { id: 'case-c', organization_id: 'org-b', title: 'Other organization' }
];

function setup(overrides = {}) {
  const key = { id: 'key-a', organization_id: 'org-a', case_id: 'case-a', status: 'active',
    scopes: ['cases:read'], ip_allowlist: ['192.0.2.1'], key_hash_sha256: keyHash, ...overrides };
  fixture = { key, queries: [], usage: [], updates: [], rateChecks: 0 };
  fixture.client = { asServiceRole: { entities: {
    ApiKey: {
      async filter(query) { return query.key_hash_sha256 === keyHash ? [key] : []; },
      async update(id, value) { fixture.updates.push({ id, value }); }
    },
    ApiKeyRateLimitState: { async filter() { fixture.rateChecks++; return []; } },
    ApiKeyUsageLog: { async create(value) { fixture.usage.push(value); } },
    Case: { async filter(query) {
      fixture.queries.push(query);
      return records.filter(row => Object.entries(query).every(([field, value]) => row[field] === value));
    } }
  } } };
}

async function request({ ip = '192.0.2.1', headers = {}, noPeer = false,
  token = secret, query = '' } = {}) {
  const response = await handler(new Request(`https://synthetic.invalid/api/v1/cases${query}`, {
    headers: { Authorization: `Bearer ${token}`, ...headers }
  }), noPeer ? undefined : { remoteAddr: { transport: 'tcp', hostname: ip, port: 12345 } });
  return { response, body: await response.json() };
}

test('real middleware and endpoint return the authorized Case.id within its organization', async () => {
  setup();
  const { response, body } = await request({ query: '?case_id=case-b&organization_id=org-b' });
  assert.equal(response.status, 200);
  assert.deepEqual(body.cases.map(c => c.id), ['case-a']);
  assert.deepEqual(fixture.queries, [{ organization_id: 'org-a', id: 'case-a' }]);
  assert.equal(fixture.usage.at(-1).client_ip, '192.0.2.1');
  assert.equal(fixture.updates.length, 1);
});

test('unrestricted case scope still excludes other organizations', async () => {
  for (const case_id of [null, undefined]) {
    setup({ case_id });
    const { body } = await request();
    assert.deepEqual(body.cases.map(c => c.id), ['case-a', 'case-b']);
    assert.deepEqual(fixture.queries, [{ organization_id: 'org-a' }]);
  }
});

test('a case ID in another organization never escapes the key organization', async () => {
  setup({ case_id: 'case-c' });
  const { response, body } = await request();
  assert.equal(response.status, 200);
  assert.deepEqual(body.cases, []);
  assert.deepEqual(fixture.queries, [{ organization_id: 'org-a', id: 'case-c' }]);
});

test('malformed organization and case scopes fail before querying cases', async () => {
  for (const invalid of [undefined, null, '', ' ', 123, {}]) {
    setup({ organization_id: invalid });
    assert.equal((await request()).response.status, 403);
    assert.deepEqual(fixture.queries, []);
  }
  for (const invalid of ['', ' ', 123, {}]) {
    setup({ case_id: invalid });
    assert.equal((await request()).response.status, 403);
    assert.deepEqual(fixture.queries, []);
  }
});

test('prefix collisions and denied addresses cannot reach case reads or key updates', async () => {
  for (const ip of ['192.0.2.10', '192.0.2.123', '198.51.100.1', '192.0.2.1:443']) {
    setup();
    assert.equal((await request({ ip })).response.status, 401);
    assert.deepEqual(fixture.queries, []);
    assert.deepEqual(fixture.updates, []);
    assert.equal(fixture.rateChecks, 0);
    assert.equal(fixture.usage.at(-1).auth_result, 'ip_denied');
  }
});

test('normalized IPv6 and IPv4-mapped peers pass the actual authorization path', async () => {
  setup({ ip_allowlist: ['2001:0DB8:0:0:0:0:0:1'] });
  assert.equal((await request({ ip: '2001:db8::1' })).response.status, 200);
  setup();
  assert.equal((await request({ ip: '::ffff:c000:201' })).response.status, 200);
  assert.equal(fixture.usage.at(-1).client_ip, '192.0.2.1');
});

test('forwarded, duplicate, malformed and missing client identities fail closed', async () => {
  for (const headers of [
    { 'x-forwarded-for': '192.0.2.1' },
    { 'x-forwarded-for': '192.0.2.1, 198.51.100.1' },
    { 'x-forwarded-for': 'garbage,,192.0.2.1' },
    { 'x-forwarded-for': '' },
    { 'forwarded': 'for="unterminated' },
    { 'x-real-ip': '192.0.2.1' },
    { 'x-forwarded-for': '192.0.2.1', 'x-real-ip': '198.51.100.1' }
  ]) {
    setup();
    assert.equal((await request({ headers })).response.status, 401);
    assert.deepEqual(fixture.queries, []);
    assert.equal(fixture.usage.at(-1).client_ip, 'unknown');
  }
  setup();
  assert.equal((await request({ noPeer: true })).response.status, 401);
  assert.deepEqual(fixture.queries, []);
});

test('malformed IP policies cannot silently become unrestricted', async () => {
  for (const ip_allowlist of ['', {}, '192.0.2.1', ['192.0.2.1', ''], ['192.0.2.1/32']]) {
    setup({ ip_allowlist });
    assert.equal((await request()).response.status, 401);
    assert.deepEqual(fixture.queries, []);
  }
});

test('keys without an IP policy do not use forwarding headers as trusted log data', async () => {
  for (const ip_allowlist of [null, undefined, []]) {
    setup({ ip_allowlist });
    assert.equal((await request({ noPeer: true, headers: { 'x-forwarded-for': '192.0.2.1' } })).response.status, 200);
    assert.equal(fixture.usage.at(-1).client_ip, 'unknown');
  }
});

test('prior revocation, disabled, expiry, scope and secret checks remain enforced', async () => {
  for (const overrides of [{ status: 'revoked' }, { status: 'disabled' },
    { expires_at: '2000-01-01T00:00:00Z' }, { scopes: [] }]) {
    setup(overrides);
    assert.equal((await request()).response.status, 401);
    assert.deepEqual(fixture.queries, []);
    assert.deepEqual(fixture.updates, []);
  }
  setup();
  assert.equal((await request({ token: 'wrong-synthetic-key' })).response.status, 401);
  assert.deepEqual(fixture.queries, []);
});

test('rate-limit database read failure denies access', async () => {
  setup();

  fixture.client.asServiceRole.entities.ApiKeyRateLimitState.filter =
    async () => {
      throw new Error('Synthetic rate-limit database read failure');
    };

  const { response } = await request();

  assert.equal(response.status, 503);
  assert.equal(fixture.usage.at(-1).rate_limit_action, 'unavailable');
  assert.deepEqual(fixture.queries, []);
  assert.deepEqual(fixture.updates, []);
});

test('rate-limit token update failure denies access', async () => {
  setup();

  const state = {
    id: 'synthetic-bucket',
    bucket: {
      capacity: 5,
      tokens: 5,
      refill_per_sec: 1,
      last_refill_at: new Date().toISOString()
    }
  };

  fixture.client.asServiceRole.entities.ApiKeyRateLimitState.filter =
    async () => [state];

  fixture.client.asServiceRole.entities.ApiKeyRateLimitState.update =
    async () => {
      throw new Error('Synthetic token update failure');
    };

  const { response } = await request();

  assert.equal(response.status, 503);
  assert.equal(fixture.usage.at(-1).rate_limit_action, 'unavailable');
  assert.deepEqual(fixture.queries, []);
  assert.deepEqual(fixture.updates, []);
});

test('exhausted rate-limit bucket returns HTTP 429', async () => {
  setup();

  fixture.client.asServiceRole.entities.ApiKeyRateLimitState.filter =
    async () => [{
      id: 'synthetic-exhausted-bucket',
      bucket: {
        capacity: 1,
        tokens: 0,
        refill_per_sec: 0,
        last_refill_at: new Date().toISOString()
      }
    }];

  const { response, body } = await request();

  assert.equal(response.status, 429);
  assert.equal(body.status, 429);
  assert.deepEqual(fixture.queries, []);
  assert.equal(fixture.usage.at(-1).rate_limit_action, 'throttled');
});
