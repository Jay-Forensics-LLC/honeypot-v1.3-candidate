# Phase 10 security model

Local reports, graph labels, URLs and captured files are untrusted data. An
operator policy determines whether a built-in adapter may run; input fields
cannot grant authority, select code or choose privileged runtime operations.

## Isolation and authorization

The package is separate from sensor processing. It exposes a fixed local parser
worker with finite input, record and time bounds. It has no plugin executable
loader or active-assessment command. It does not require Docker, firewall,
cloud-administrator or directory credentials. A worker failure is an import
error, not a reason to stop sensors.

The parser worker is not a general-purpose sandbox for arbitrary third-party
programs. External forensic parsers must run in a separately prepared offline,
disposable analysis environment. Forensic export provides an explicit evidence
copy and provenance, without starting ExifTool, CyberChef or a captured file.

Assessment report targets require explicit approval and exact asset scope.
Domain matching uses label boundaries; IP scope supports exact addresses and
CIDRs. Scope is an operator assertion. A report relationship, reputation score,
shared address or shared hosting provider never establishes ownership.

## Evidence and privacy

Original import bytes are preserved by SHA-256 in a dedicated private store.
Normalized output and manifests link to that original. A hash establishes
consistency with retained bytes; it does not establish truth, origin or
completeness of an upstream report. Imports never rewrite protected incident
evidence.

Raw reports remain sensitive. Normalized records use explicit field mappings,
and errors/audit records omit raw payloads and credentials. Indicators can still
contain personal or confidential information; review an export before sharing
it. Structured filtering is not a general secret detector.

Awareness imports accept aggregate campaign metrics only. Employee identifiers,
raw submissions, passwords, session tokens and unsupported fields are rejected.
BloodHound accepts aggregate authorized-lab summaries rather than raw identities.
Nuclei request/response bodies and extracted values are not exported.

## Mock enrichment

The six provider adapters consume injected local fixtures. They have bounded
cache/TTL, quota/rate limits and failure backoff. Private, loopback, reserved and
internal indicators are ineligible for enrichment; URL credentials and sensitive
query/fragment data are excluded. No API key, DNS lookup, upload or external
request is performed. A normalized reputation result is an assessment, not proof
of compromise or attacker identity.

Cache and rate/backoff state are in memory per `MockEnricher` instance; a new CLI
process starts a new cache. Eligibility is syntactic and does not establish a
domain's resolved destination. A future live provider needs separate disclosure
authorization, resolved-destination checks and persistent quota design.

## Operational limits

No Phase 10 source feature changes hp_guard, network bindings, decoy behavior,
PCAP, Compose, systemd, Loki/Grafana or deployment state. Prior beta and Stage 7/8
gates remain controlling. Source validation is not independent security
qualification, and the earlier repository audit remains partial.

Disable the policy to stop new integration work. Preserve private originals and
manifests during rollback; do not delete evidence to undo a source feature.
