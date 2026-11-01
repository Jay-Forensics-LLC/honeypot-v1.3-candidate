# Retained API-key authorization

This is source-only hardening of the legacy Base44/Deno application. HoneyTrace's
local dashboard does not start these functions. Synthetic tests do not qualify
a live provider deployment or its ingress configuration.

## Client address contract

`apiCasesRead.ts` passes the runtime-supplied `Deno.serve` connection information
to the verifier. Only a TCP peer's literal `remoteAddr.hostname` is accepted.
HTTP headers, URL parameters and request bodies cannot supply that information.

There is no established proxy trust boundary in this source. Any standard
forwarding/client-address header recognized by `helpers/apiKeyIp.ts` makes the
client address unavailable, even if its value looks valid or matches the peer.
Missing connection metadata also makes it unavailable. A nonempty IP policy then
fails closed. The audit log records `unknown`, never a spoofable header value.

This direct-connection contract must not be treated as provider ingress
qualification. If a provider hides connection metadata or forwards requests,
IP-restricted keys remain denied until a separately reviewed ingress adapter
establishes the actual client identity. Do not allowlist a shared ingress or
proxy address as a substitute for its clients. A future proxy adapter must
authenticate the immediate peer and document header stripping/overwriting,
accepted syntax and multi-hop handling; an environment switch alone is not proof
that arbitrary forwarding headers are trustworthy.

Allowlist entries are exact IPv4 or IPv6 literals. IPv6 is normalized, and
IPv4-mapped IPv6 is equivalent to its IPv4 address. IPv4-compatible IPv6 is not
conflated with IPv4. CIDRs are intentionally unsupported. Prefixes, CIDRs, ports,
brackets, scope zones, whitespace, noncanonical IPv4, malformed entries and
non-array policies are denied. One invalid entry invalidates the entire policy.
Only `null`, `undefined`, or an empty array mean no IP restriction.

## Case scope

The authenticated key supplies `organization_id`. Its optional `case_id` selects
the Case entity's **`id`**, combined with the organization predicate. Request
parameters cannot override either predicate. A null/absent case restriction
allows organization-wide reads; malformed organization or case scope fails
before the Case query. The correction already present in PR #53 is preserved.

## Offline regression checks

Use Node.js 24 in an isolated environment:

```sh
node --test --test-concurrency=1 sentinel-forensics/functions/tests/*.test.mjs
```

`apiKeyIp.test.mjs` covers exact matches, prefix collisions, IPv6/mapped forms,
invalid policies and forwarding headers. `apiKeyAuthorization.test.mjs` imports
the actual middleware and endpoint, substitutes an in-memory SDK, and captures
`Deno.serve` without listening. All keys, organizations, cases and addresses are
synthetic. Tests exercise scoped reads, cross-case/cross-organization isolation,
denials before entity reads, logging and existing status/scope checks.

The `Sentinel API authorization offline` GitHub job runs all function `.test.mjs`
tests with no network, a read-only source/toolchain, an empty allowlisted
environment, an unprivileged user and bounded CPU, memory, processes, open files,
output file sizes, scratch space and wall time. It neither installs application
dependencies nor loads a provider SDK. Node setup precedes the isolated run.
