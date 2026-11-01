import { isIP } from 'node:net';

// Exact literals only: no CIDRs, ports, brackets, zones, whitespace or hostnames.
export function normalizeIpAddress(value) {
  if (typeof value !== 'string' || value.length > 45 || /[\s%]/u.test(value)) return null;
  const family = isIP(value);
  if (family === 4) return value;
  if (family !== 6) return null;

  const normalized = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  // Treat IPv4-mapped IPv6 as the same address, including its hexadecimal form.
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalized);
  if (mapped) {
    const high = parseInt(mapped[1], 16);
    const low = parseInt(mapped[2], 16);
    return [high >> 8, high & 255, low >> 8, low & 255].join('.');
  }
  return normalized;
}

// No proxy boundary has been established for this retained application.
// Never derive client identity from HTTP headers, even alongside a valid peer.
const FORWARDED_ADDRESS_HEADERS = [
  'forwarded', 'x-forwarded-for', 'x-real-ip', 'cf-connecting-ip',
  'true-client-ip', 'fastly-client-ip', 'x-client-ip', 'x-cluster-client-ip',
  'x-original-forwarded-for'
];

export function getTrustedClientIp(req, connectionInfo) {
  if (FORWARDED_ADDRESS_HEADERS.some(name => req.headers.has(name))) return null;
  const peer = connectionInfo?.remoteAddr;
  if (peer?.transport !== 'tcp') return null;
  return normalizeIpAddress(peer.hostname);
}

export function isClientIpAllowed(clientIp, allowlist) {
  if (allowlist === null || allowlist === undefined) return true;
  if (!Array.isArray(allowlist)) return false;
  if (allowlist.length === 0) return true;

  const normalizedClient = normalizeIpAddress(clientIp);
  const addresses = allowlist.map(normalizeIpAddress);
  // An invalid entry invalidates the policy, even if another entry matches.
  return normalizedClient !== null && addresses.every(ip => ip !== null)
    && addresses.includes(normalizedClient);
}
