# PR #53 authorization correction handoff

Task owner: current authorization-correction session. Working copy:
`/workspace/scratch/89599e4bcb56/honeytrace-auth`.
Branch: `fix/pr53-sentinel-api-authorization`.
Inspected parent: `37e4a43d36fcf69587cb307f1394c53a10517abd`.

## Findings and correction

The IP-prefix comparison remains in this parent even though review thread
`discussion_r4434943560` is marked resolved. The Case identifier correction is
already present from `fb90798`; `960cb53` also corrected the verifier import to
`.ts`. Both are preserved, along with the other parent-branch security changes.

The verifier now accepts only normalized literal addresses from runtime TCP
connection metadata. Forwarding headers and missing metadata are not trusted;
nonempty IP policies fail closed. CIDR entries are unsupported and denied.
Case queries retain `organization_id` plus the optional Case `id`, and malformed
scope is rejected before the Case query. The new tests exercise the real
endpoint/middleware against an in-memory provider, without serving or making
provider requests. See the retained application's
[address contract](../../sentinel-forensics/functions/API_KEY_AUTHORIZATION.md).

## Split coordination

At inspection, #53 was the only open implementation PR and no remote `split` or
`slice` branch was published. This correction is isolated as a follow-up PR
against `codex/forensic-workflows-20261101`; it does not move that shared branch.

Carry the Sentinel function changes, synthetic tests and authorization document
into the **Sentinel application/vendor slice**. Carry the accompanying offline
workflow and manifest/doc updates with that slice. The correction is not a
honeypot runtime change. Do not copy a stale whole manifest over a split branch:
reconcile its exact overlay inventory, preserving the same pinned upstream
commit/tree and license, then rerun the snapshot check. The workflow's broader
HoneyTrace checks assume the current stacked source layout.

## Provenance

The parent manifest has six stale recorded file hashes and sixteen unrecorded
overlay paths. The current receipt accounts for these existing parent changes
without altering their source, then records this correction. Added reasons name
the existing commits responsible for reconciled bytes. The original import at
`e94a6ba`, with its one recorded sanitization reversed by Git blob identity,
reconstructs the unchanged upstream tree
`45e7025dd351732dfa0d321362891ff353f8b940` for upstream commit
`187bec14835fc9497b05594ca467a49259553d64`.

## Validation and remaining review

Local static checks: syntax of changed JavaScript/TypeScript and workflow shell;
Git whitespace checks; independent Git-tree reconstruction, overlay hashes,
inventory totals and unchanged license digest. No repository code was executed
locally: network/mount isolation is unavailable and Landlock is unsupported.

The new GitHub job runs the function `.test.mjs` suite, bundle validator and
bundle tests, then the repository-required `make -C honeypot test` and
`make -C honeypot verify` in an OS sandbox. It uses an isolated loopback-only
network namespace, read-only source/toolchain, empty allowlisted environment,
unprivileged UID, 120 CPU seconds per process, 4 GiB address-space limit, 64
processes, 256 descriptors, 16 MiB file-size limit, 64 MiB scratch space and a
240-second wall deadline. Check the exact correction commit's job results before
acceptance; scheduling a job is not a PASS.

Runtime ingress qualification and independent PR review remain required before
deployment. No live provider calls, retained-application deployment, phase
acceptance or merge is authorized by this source correction.
