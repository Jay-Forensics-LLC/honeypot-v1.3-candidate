import assert from 'node:assert/strict';
import test from 'node:test';
import { getTrustedClientIp, isClientIpAllowed, normalizeIpAddress } from '../helpers/apiKeyIp.ts';

const connection = hostname => ({ remoteAddr: { transport: 'tcp', hostname, port: 12345 } });

test('normalizes IPv6 and IPv4-mapped IPv6 without broadening addresses', () => {
  assert.equal(normalizeIpAddress('2001:0DB8:0000:0000:0000:0000:0000:0001'), '2001:db8::1');
  assert.equal(normalizeIpAddress('::ffff:192.0.2.1'), '192.0.2.1');
  assert.equal(normalizeIpAddress('0:0:0:0:0:FFFF:c000:201'), '192.0.2.1');
  assert.equal(normalizeIpAddress('::192.0.2.1'), '::c000:201');
});

test('permits exact normalized addresses and denies prefix collisions', () => {
  assert.equal(isClientIpAllowed('192.0.2.1', ['192.0.2.1']), true);
  assert.equal(isClientIpAllowed('::ffff:c000:201', ['192.0.2.1']), true);
  assert.equal(isClientIpAllowed('192.0.2.1', ['::ffff:192.0.2.1']), true);
  assert.equal(isClientIpAllowed('2001:db8::1', ['2001:0DB8:0:0:0:0:0:1']), true);
  for (const denied of ['192.0.2.10', '192.0.2.123', '198.51.100.1', '::ffff:192.0.2.10']) {
    assert.equal(isClientIpAllowed(denied, ['192.0.2.1']), false, denied);
  }
  assert.equal(isClientIpAllowed('2001:db8::10', ['2001:db8::1']), false);
  assert.equal(isClientIpAllowed('::192.0.2.1', ['192.0.2.1']), false);
});

test('rejects ambiguous literals and unsupported CIDRs in either side of a policy', () => {
  for (const bad of ['', '192.0.2', '192.0.002.1', '3221225985', '0xc0000201',
    '192.0.2.1:443', '[2001:db8::1]', 'fe80::1%eth0', '192.0.2.1/32', '2001:db8::/32',
    '192.0.2.1, 198.51.100.1', 'for=192.0.2.1', ' 192.0.2.1', '192.0.2.1\n',
    'localhost', 'unknown', '999.0.2.1', '2001:::1', null, 123, {}]) {
    assert.equal(normalizeIpAddress(bad), null, String(bad));
    assert.equal(isClientIpAllowed(bad, ['192.0.2.1']), false, String(bad));
    assert.equal(isClientIpAllowed('192.0.2.1', ['192.0.2.1', bad]), false, String(bad));
  }
});

test('only absent or empty-array policies mean unrestricted', () => {
  for (const policy of [undefined, null, []]) assert.equal(isClientIpAllowed(null, policy), true);
  for (const policy of ['', '192.0.2.1', {}, 0, false]) {
    assert.equal(isClientIpAllowed('192.0.2.1', policy), false);
  }
});

test('client identity requires runtime TCP connection metadata', () => {
  const req = new Request('https://synthetic.invalid/api/v1/cases');
  assert.equal(getTrustedClientIp(req, connection('192.0.2.1')), '192.0.2.1');
  assert.equal(getTrustedClientIp(req, connection('2001:0DB8::1')), '2001:db8::1');
  for (const info of [undefined, {}, { remoteAddr: { transport: 'unix', hostname: '192.0.2.1' } },
    connection('192.0.2.1:443'), connection('unknown')]) {
    assert.equal(getTrustedClientIp(req, info), null);
  }
});

test('all forwarding headers are untrusted, including malformed and empty values', () => {
  const headers = [
    ['x-forwarded-for', '192.0.2.1'],
    ['x-forwarded-for', '192.0.2.1, 198.51.100.2'],
    ['x-forwarded-for', 'garbage,,192.0.2.1'],
    ['x-forwarded-for', ''],
    ['x-real-ip', '192.0.2.1'],
    ['forwarded', 'for="[2001:db8::1]:443";proto=https'],
    ['forwarded', 'for="unterminated'],
    ['cf-connecting-ip', '192.0.2.1'],
    ['true-client-ip', '192.0.2.1'],
    ['fastly-client-ip', '192.0.2.1'],
    ['x-client-ip', '192.0.2.1'],
    ['x-cluster-client-ip', '192.0.2.1'],
    ['x-original-forwarded-for', '192.0.2.1']
  ];
  for (const [name, value] of headers) {
    const req = new Request('https://synthetic.invalid/', { headers: { [name]: value } });
    assert.equal(getTrustedClientIp(req, connection('192.0.2.1')), null, `${name}: ${value}`);
  }
  const duplicate = new Headers([['x-forwarded-for', '192.0.2.1'], ['x-forwarded-for', '198.51.100.1']]);
  assert.equal(getTrustedClientIp(new Request('https://synthetic.invalid/', { headers: duplicate }),
    connection('192.0.2.1')), null);
});
