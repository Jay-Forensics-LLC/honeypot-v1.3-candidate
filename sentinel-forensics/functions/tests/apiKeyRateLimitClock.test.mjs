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
const originalFactory = globalThis.__syntheticApiKeyClockClient;
const NOW = RealDate.parse('2026-11-04T12:00:00.000Z');
const iso = time => new RealDate(time).toISOString();
let clock = NOW;
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
};
globalThis.Deno = { serve(handler) { handlers.push(handler); } };
globalThis.__syntheticApiKeyClockClient = () => fixture.client;
globalThis.fetch = async () => {
  fixture.unexpected.push('network request');
  throw new Error('Network is forbidden in this synthetic test');
};
const sdkUrl = 'data:text/javascript,' + encodeURIComponent(
  'export const createClientFromRequest = () => globalThis.__syntheticApiKeyClockClient();'
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
  if (originalFactory === undefined) delete globalThis.__syntheticApiKeyClockClient;
  else globalThis.__syntheticApiKeyClockClient = originalFactory;
});
await import('../apiCasesRead.ts');
assert.equal(handlers.length, 1, 'The real API endpoint must register exactly one handler');
const handler = handlers[0];
const secret = 'synthetic-api-clock-key';
const keyHash = createHash('sha256').update(secret).digest('hex');

function setup(options = {}) {
  clock = NOW;
  const state = {
    key: { id: 'synthetic-key-a', organization_id: 'org-a', case_id: 'case-a', status: 'active',
      scopes: ['cases:read'], ip_allowlist: ['192.0.2.1'], key_hash_sha256: keyHash },
    rateLimit: { id: 'synthetic-bucket-a', api_key_id: 'synthetic-key-a', bucket: {
      capacity: 2, tokens: 1, refill_per_sec: 1, last_refill_at: iso(NOW), ...options.bucket
    } },
    cases: [
      { id: 'case-a', organization_id: 'org-a', title: 'Permitted synthetic case' },
      { id: 'case-b', organization_id: 'org-a', title: 'Another synthetic case' },
      { id: 'case-c', organization_id: 'org-b', title: 'Other organization' }
    ]
  };
  const active = fixture = {
    state, before: structuredClone(state), keyReads: [], bucketReads: [], conditionalAttempts: [],
    conditionalWrites: [], keyUpdates: [], caseQueries: [], usage: [], unexpected: [], externalWrites: 0
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
        if (options.afterReadTime !== undefined) clock = options.afterReadTime;
        return query.api_key_id === state.key.id ? [structuredClone(state.rateLimit)] : [];
      },
      async updateMany(query, data) {
        active.conditionalAttempts.push({ query: structuredClone(query), data: structuredClone(data) });
        assert.deepEqual(Object.keys(query).sort(),
          ['id', 'api_key_id', 'bucket.tokens', 'bucket.last_refill_at'].sort());
        assert.deepEqual(Object.keys(data), ['$set']);
        assert.deepEqual(Object.keys(data.$set).sort(), ['bucket.tokens', 'bucket.last_refill_at'].sort());
        if (options.futureOnFirstConflict && active.conditionalAttempts.length === 1) {
          // A concurrent writer moves the stored timestamp ahead before its
          // update wins. The losing request must recheck time on its next read.
          state.rateLimit.bucket.last_refill_at = iso(NOW + 1000);
          active.externalWrites++;
          return { success: true, updated: 0, has_more: false };
        }
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

function unavailable(result, expectedState = fixture.before, expectedAttempts = 0) {
  assert.equal(result.status, 503, 'Unusable refill time must refuse access as unavailable');
  assert.equal(result.body.status, 503);
  assert.equal(result.body.title, 'Service Unavailable');
  assert.equal(result.body.detail, 'Service unavailable');
  assert.equal(Object.hasOwn(result.body, 'cases'), false);
  assert.deepEqual(fixture.state, expectedState, 'The endpoint must preserve the bucket, key and cases on refusal');
  assert.equal(fixture.conditionalAttempts.length, expectedAttempts);
  assert.deepEqual(fixture.conditionalWrites, []);
  assert.deepEqual(fixture.caseQueries, []);
  assert.deepEqual(fixture.keyUpdates, []);
  assert.equal(fixture.usage.length, 1);
  assert.equal(fixture.usage[0].auth_result, 'rate_limit_unavailable');
  assert.equal(fixture.usage[0].rate_limit_action, 'unavailable');
  assert.equal(fixture.usage[0].status_code, 503);
  assert.deepEqual(fixture.unexpected, []);
}

function allowed(result, expectedTokens) {
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.cases.map(row => row.id), ['case-a']);
  assert.deepEqual(fixture.caseQueries, [{ organization_id: 'org-a', id: 'case-a' }]);
  assert.deepEqual(fixture.keyUpdates, [{ id: 'synthetic-key-a', value: { last_used_at: iso(clock) } }]);
  assert.equal(fixture.conditionalWrites.length, 1);
  assert.equal(fixture.state.rateLimit.bucket.tokens, expectedTokens);
  assert.equal(fixture.state.rateLimit.bucket.last_refill_at, iso(clock));
  assert.deepEqual(fixture.state.cases, fixture.before.cases);
  assert.equal(fixture.usage.at(-1).auth_result, 'ok');
  assert.equal(fixture.usage.at(-1).rate_limit_action, 'allowed');
  assert.equal(fixture.usage.at(-1).status_code, 200);
  assert.deepEqual(fixture.unexpected, []);
}

test('a future refill timestamp refuses a positive balance without rewriting the bucket', async () => {
  for (const ahead of [1, 1000, 60000]) {
    setup({ bucket: { last_refill_at: iso(NOW + ahead) } });
    unavailable(await request());
    assert.deepEqual(fixture.bucketReads, [{ api_key_id: 'synthetic-key-a' }]);
  }
});

test('an exhausted future bucket is unavailable rather than ordinary throttling', async () => {
  setup({ bucket: { tokens: 0, last_refill_at: iso(NOW + 1000) } });
  unavailable(await request());
  assert.equal(fixture.bucketReads.length, 1);
});

test('a future timestamp introduced by a conditional-update conflict is rechecked before another write', async () => {
  setup({ futureOnFirstConflict: true });
  const expected = structuredClone(fixture.before);
  expected.rateLimit.bucket.last_refill_at = iso(NOW + 1000);
  unavailable(await request(), expected, 1);
  assert.equal(fixture.bucketReads.length, 2);
  assert.equal(fixture.externalWrites, 1);
});

test('a clock rollback during the awaited lookup cannot rewind the stored refill time', async () => {
  setup({ afterReadTime: NOW - 1000 });
  unavailable(await request());
  assert.equal(fixture.bucketReads.length, 1);
});

test('a refused future bucket becomes usable when the clock reaches its preserved timestamp', async () => {
  setup({ bucket: { last_refill_at: iso(NOW + 1000) } });
  unavailable(await request());
  clock = NOW + 1000;
  allowed(await request(), 0);
  assert.equal(fixture.bucketReads.length, 2);
  assert.equal(fixture.usage.length, 2);
  assert.equal(fixture.usage[0].status_code, 503);
});

test('a timestamp equal to now in UTC or an explicit offset permits one conditional spend', async () => {
  for (const last_refill_at of [iso(NOW), '2026-11-04T07:00:00.000-05:00']) {
    setup({ bucket: { last_refill_at, refill_per_sec: 0 } });
    allowed(await request(), 0);
    assert.equal(fixture.conditionalAttempts.length, 1);
    assert.deepEqual(fixture.conditionalAttempts[0].query, {
      id: 'synthetic-bucket-a', api_key_id: 'synthetic-key-a',
      'bucket.tokens': 1, 'bucket.last_refill_at': last_refill_at
    });
  }
});

test('legitimate elapsed time still refills a fractional balance before one spend', async () => {
  setup({ bucket: { tokens: 0.25, refill_per_sec: 0.75, last_refill_at: iso(NOW - 1000) } });
  allowed(await request(), 0);
  assert.equal(fixture.conditionalAttempts.length, 1);
});

test('legitimate refill remains capped at the bucket capacity', async () => {
  setup({ bucket: { tokens: 1, capacity: 2, refill_per_sec: 1, last_refill_at: iso(NOW - 10000) } });
  allowed(await request(), 1);
  assert.equal(fixture.conditionalAttempts.length, 1);
});

test('an ordinary exhausted bucket retains HTTP 429 and does not attempt a write', async () => {
  setup({ bucket: { tokens: 0, refill_per_sec: 0 } });
  const result = await request();
  assert.equal(result.status, 429);
  assert.equal(result.body.status, 429);
  assert.equal(fixture.usage[0].auth_result, 'ok');
  assert.equal(fixture.usage[0].rate_limit_action, 'throttled');
  assert.deepEqual(fixture.conditionalAttempts, []);
  assert.deepEqual(fixture.caseQueries, []);
  assert.deepEqual(fixture.keyUpdates, []);
  assert.deepEqual(fixture.state, fixture.before);
  assert.deepEqual(fixture.unexpected, []);
});

test('missing, non-string and unparseable refill timestamps remain unavailable without mutation', async () => {
  for (const last_refill_at of [undefined, null, {}, NOW, '', '  ', 'invalid']) {
    setup({ bucket: { last_refill_at } });
    unavailable(await request());
    assert.equal(fixture.bucketReads.length, 1);
  }
});
