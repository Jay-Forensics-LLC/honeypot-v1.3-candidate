import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { after, test } from 'node:test';

// Exercise the real endpoint, authorization middleware and IP helper. The SDK
// and clock are synthetic; the conditional write models, but does not prove,
// backend atomicity. No provider package is loaded or listener opened.
let fixture;
const handlers = [];
const RealDate = globalThis.Date;
const originalDeno = globalThis.Deno;
const originalFetch = globalThis.fetch;
const originalFactory = globalThis.__syntheticApiKeyExpiryClient;
const NOW = RealDate.parse('2026-11-04T12:00:00.000Z');
const iso = time => new RealDate(time).toISOString();
let clock = NOW;
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
};
globalThis.Deno = { serve(handler) { handlers.push(handler); } };
globalThis.__syntheticApiKeyExpiryClient = () => fixture.client;
globalThis.fetch = async () => {
  fixture.unexpected.push('network request');
  throw new Error('Network is forbidden in this synthetic test');
};
const sdkUrl = 'data:text/javascript,' + encodeURIComponent(
  'export const createClientFromRequest = () => globalThis.__syntheticApiKeyExpiryClient();'
);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'npm:@base44/sdk@0.8.6' || specifier === 'npm:@base44/sdk@0.8.30') {
      return { url: sdkUrl, shortCircuit: true };
    }
    if (/^(npm:|https?:)/.test(specifier)) throw new Error('Unexpected provider import');
    return nextResolve(specifier, context);
  }
});
after(() => {
  hooks.deregister();
  globalThis.Date = RealDate;
  globalThis.Deno = originalDeno;
  globalThis.fetch = originalFetch;
  if (originalFactory === undefined) delete globalThis.__syntheticApiKeyExpiryClient;
  else globalThis.__syntheticApiKeyExpiryClient = originalFactory;
});
await import('../apiCasesRead.ts');
assert.equal(handlers.length, 1, 'The real API endpoint must register exactly one handler');
const handler = handlers[0];
const secret = 'synthetic-api-expiry-key';
const keyHash = createHash('sha256').update(secret).digest('hex');

function setup(options = {}) {
  clock = NOW;
  const state = {
    key: { id: 'synthetic-key-a', organization_id: 'org-a', case_id: 'case-a', status: 'active',
      scopes: ['cases:read'], ip_allowlist: ['192.0.2.1'], key_hash_sha256: keyHash, ...options.key },
    rateLimit: { id: 'synthetic-bucket-a', api_key_id: 'synthetic-key-a', bucket: {
      capacity: 2, tokens: 1, refill_per_sec: 0, last_refill_at: iso(NOW)
    } },
    cases: [
      { id: 'case-a', organization_id: 'org-a', title: 'Permitted synthetic case' },
      { id: 'case-b', organization_id: 'org-a', title: 'Another synthetic case' },
      { id: 'case-c', organization_id: 'org-b', title: 'Other organization' }
    ]
  };
  const active = fixture = {
    state, before: structuredClone(state), keyReads: [], bucketReads: [], conditionalAttempts: [],
    conditionalWrites: [], keyUpdates: [], caseQueries: [], usage: [], unexpected: []
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
    ApiKey: {
      async filter(query) {
        active.keyReads.push(structuredClone(query));
        if (options.afterKeyReadTime !== undefined) clock = options.afterKeyReadTime;
        return query.key_hash_sha256 === keyHash ? [state.key] : [];
      },
      async update(id, value) {
        active.keyUpdates.push({ id, value: structuredClone(value) });
        assert.equal(id, state.key.id);
        assert.deepEqual(Object.keys(value), ['last_used_at']);
        Object.assign(state.key, value);
        return structuredClone(state.key);
      }
    },
    ApiKeyRateLimitState: {
      async filter(query) {
        active.bucketReads.push(structuredClone(query));
        return query.api_key_id === state.key.id ? [structuredClone(state.rateLimit)] : [];
      },
      async updateMany(query, data) {
        active.conditionalAttempts.push({ query: structuredClone(query), data: structuredClone(data) });
        assert.deepEqual(Object.keys(query).sort(),
          ['id', 'api_key_id', 'bucket.tokens', 'bucket.last_refill_at'].sort());
        assert.deepEqual(Object.keys(data), ['$set']);
        assert.deepEqual(Object.keys(data.$set).sort(), ['bucket.tokens', 'bucket.last_refill_at'].sort());
        const bucket = state.rateLimit.bucket;
        if (query.id !== state.rateLimit.id || query.api_key_id !== state.key.id ||
          query['bucket.tokens'] !== bucket.tokens || query['bucket.last_refill_at'] !== bucket.last_refill_at) {
          return { success: true, updated: 0, has_more: false };
        }
        // Synchronous compare-and-write is the synthetic backend contract.
        bucket.tokens = data.$set['bucket.tokens'];
        bucket.last_refill_at = data.$set['bucket.last_refill_at'];
        active.conditionalWrites.push(structuredClone(data));
        return { success: true, updated: 1, has_more: false };
      }
    },
    ApiKeyUsageLog: { async create(record) {
      active.usage.push(structuredClone(record));
      return { id: `synthetic-usage-${active.usage.length}` };
    } },
    Case: { async filter(query) {
      active.caseQueries.push(structuredClone(query));
      return state.cases.filter(row => Object.entries(query).every(([key, value]) => row[key] === value));
    } }
  });
  const functions = new Proxy({}, { get(_target, name) { return forbidden('function.' + String(name)); } });
  const integrations = entities('integration');
  active.client = {
    auth: { me: forbidden('auth.me') }, entities: entities('user'), functions, integrations,
    asServiceRole: { entities: serviceEntities, functions, integrations }
  };
}

async function request() {
  const response = await handler(new Request('https://synthetic.invalid/api/v1/cases', {
    headers: { Authorization: `Bearer ${secret}` }
  }), { remoteAddr: { transport: 'tcp', hostname: '192.0.2.1', port: 12345 } });
  return { status: response.status, body: await response.json() };
}

function refused(result, authResult = 'expired', detail = 'API key expired') {
  assert.equal(result.status, 401, 'An unusable expiry must refuse access');
  assert.equal(result.body.status, 401);
  assert.equal(result.body.title, 'Unauthorized');
  assert.equal(result.body.detail, detail);
  assert.equal(Object.hasOwn(result.body, 'cases'), false);
  assert.deepEqual(fixture.keyReads, [{ key_hash_sha256: keyHash }]);
  assert.deepEqual(fixture.bucketReads, [], 'Expiry refusal must precede rate-limit state access');
  assert.deepEqual(fixture.conditionalAttempts, []);
  assert.deepEqual(fixture.conditionalWrites, []);
  assert.deepEqual(fixture.keyUpdates, []);
  assert.deepEqual(fixture.caseQueries, []);
  assert.deepEqual(fixture.state, fixture.before, 'Key, bucket and cases must remain unchanged');
  assert.equal(fixture.usage.length, 1);
  assert.equal(fixture.usage[0].auth_result, authResult);
  assert.equal(fixture.usage[0].status_code, 401);
  assert.equal(fixture.usage[0].scope_checked, 'cases:read');
  assert.deepEqual(fixture.unexpected, []);
}

function allowed(result) {
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.cases.map(row => row.id), ['case-a']);
  assert.deepEqual(fixture.keyReads, [{ key_hash_sha256: keyHash }]);
  assert.deepEqual(fixture.bucketReads, [{ api_key_id: 'synthetic-key-a' }]);
  assert.equal(fixture.conditionalAttempts.length, 1);
  assert.equal(fixture.conditionalWrites.length, 1);
  assert.deepEqual(fixture.caseQueries, [{ organization_id: 'org-a', id: 'case-a' }]);
  assert.deepEqual(fixture.keyUpdates, [{ id: 'synthetic-key-a', value: { last_used_at: iso(clock) } }]);
  assert.deepEqual(fixture.state.key, { ...fixture.before.key, last_used_at: iso(clock) });
  assert.equal(fixture.state.rateLimit.bucket.tokens, 0);
  assert.equal(fixture.state.rateLimit.bucket.last_refill_at, iso(clock));
  assert.deepEqual(fixture.state.cases, fixture.before.cases);
  assert.equal(fixture.usage.length, 1);
  assert.equal(fixture.usage[0].auth_result, 'ok');
  assert.equal(fixture.usage[0].rate_limit_action, 'allowed');
  assert.equal(fixture.usage[0].status_code, 200);
  assert.deepEqual(fixture.unexpected, []);
}

test('unparseable stored expiry strings refuse access before rate limiting or case reads', async () => {
  for (const expires_at of ['not-a-date', '2026-13-40T25:61:00Z', 'NaN']) {
    setup({ key: { expires_at } });
    refused(await request());
  }
});

test('empty and whitespace stored expiry strings do not become non-expiring keys', async () => {
  for (const expires_at of ['', ' ', '\t']) {
    setup({ key: { expires_at } });
    refused(await request());
  }
});

test('present non-string expiry values are refused without date coercion', async () => {
  for (const expires_at of [NOW + 60000, [iso(NOW + 60000)], {}, [], true]) {
    setup({ key: { expires_at } });
    refused(await request());
  }
});

test('false and zero stored expiry values do not disable expiration checking', async () => {
  for (const expires_at of [false, 0]) {
    setup({ key: { expires_at } });
    refused(await request());
  }
});

test('expiry exactly equal to the current instant is refused in UTC and explicit offsets', async () => {
  for (const expires_at of [iso(NOW), '2026-11-04T07:00:00.000-05:00']) {
    setup({ key: { expires_at } });
    refused(await request());
  }
});

test('parseable future string expiry preserves authorized scoped reads', async () => {
  for (const expires_at of [iso(NOW + 1), iso(NOW + 60000), '2026-11-04T07:01:00.000-05:00']) {
    setup({ key: { expires_at } });
    allowed(await request());
  }
});

test('null and absent expiry retain the existing non-expiring key contract', async () => {
  for (const key of [{ expires_at: null }, {}, { expires_at: undefined }]) {
    setup({ key });
    allowed(await request());
  }
});

test('past string expiry retains its refusal without changing protected state', async () => {
  for (const expires_at of [iso(NOW - 1), '2000-01-01T00:00:00Z', '2026-11-04T06:59:59.999-05:00']) {
    setup({ key: { expires_at } });
    refused(await request());
  }
});

test('expiry is checked against time after the awaited API-key lookup', async () => {
  setup({ key: { expires_at: iso(NOW + 1000) }, afterKeyReadTime: NOW + 2000 });
  refused(await request());
});

test('revoked and disabled keys retain their prior refusal classifications', async () => {
  for (const status of ['revoked', 'disabled']) {
    setup({ key: { status, expires_at: 'not-a-date' } });
    refused(await request(), status, `API key ${status}`);
  }
});
