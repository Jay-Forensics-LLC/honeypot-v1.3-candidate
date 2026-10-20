# Independent clean-room Stage 7 qualification

Status: **BLOCKED until approved live evidence exists**. These tools qualify an
identified deployment; they do not change any B01–B18 requirement. Ubuntu 24.04,
Python 3.12 and Compose v2 remain the mandatory supported-installation target.
Ubuntu 26.04/Python 3.14/Compose 5 desktop diagnostics are a separate result.
Historical laptop recovery/custody checks and unresolved global event-location
ambiguity are recorded in [current status](../../docs/CURRENT_PHASE_STATUS.md).
No Stage 8 or later-phase execution is authorized by this document.

## Source and target identity

Preserve the qualification patch, existing evidence and historical manifests. Use a
reviewed clean local source checkpoint; neither a dirty checkout nor an unrelated
commit's unit results may authorize live qualification. Do not push automatically.
Keep runtime and new private evidence in distinct canonical directories outside the
source tree. The evidence root must also be outside the runtime. Never create the
original laptop path to impersonate its deployment.

The runtime Compose file must exactly match the reviewed source file, and all
seven actual container restart policies must be disabled (`no`, zero retries).
Inventory rejects a mismatch or mid-observation file change; it forces enumeration
of untracked source files even if Git's local status configuration hides them.
These source checks do not change the deployed policies or qualify boot ordering.
Additional Compose files/input environment are refused. Effective command,
entrypoint, environment, healthcheck, working-directory and stop-signal fields
must match the reviewed model and independently approved image defaults. Labels
or recorded environment hashes alone cannot establish this relationship.

The complete clean-room evidence sweep also requires event-ID uniqueness across
all incident locations, independently of incidentd's earlier startup audit. An
ambiguous location blocks the sweep without changing either original. The global
ID map is limited to 250,000 entries; existing 4,000-file, per-file, aggregate-byte
and time limits remain. Final file signatures must still match the acquired
records, and an empty event store cannot pass. Current prerequisites require an
explicit `VERIFIED_UNIQUE` result; a per-incident-only receipt is insufficient.

The explicit `--context PATH --context-sha256 SHA256` pair selects clean-room mode.
Without it, the historical laptop path and reconciliation requirements remain strict.
A context is a bounded JSON object with exactly these fields:

```json
{
  "schema_version": 2,
  "mode": "cleanroom",
  "phase": "acquisition",
  "issued_utc": "<CURRENT_UTC>",
  "source_root": "/ABS/SOURCE/honeypot",
  "runtime_root": "/ABS/WORKSPACE/runtime/honeytrace",
  "evidence_root": "/ABS/WORKSPACE/work/private-qualification-UNIQUE",
  "source_commit": "<REVIEWED_CLEAN_COMMIT>",
  "image_approval_sha256": "<SEPARATELY_REVIEWED_APPROVAL_SHA256>",
  "boot_id": "<CURRENT_BOOT_ID>",
  "deployment_id": "independent-desktop-01",
  "receipts": {}
}
```

This is a schema example, **not an execution receipt**. Do not substitute fabricated
PASS data or historical hashes. Capture the actual current identities and SHA-256
of the exact new context bytes. Both context and receipt files belong under the
private evidence root, use canonical non-symlink paths, and are retained unchanged.
Contexts expire after one hour; prerequisite qualification still has the unchanged
120-second deadline. Cross-boot, stale, changed, missing or mismatched inputs block.

## Acquisition and qualification are distinct

1. After separate deployment/containment/capture approval and readiness, prepare an
   acquisition-phase context with no receipts. A complete prerequisite sweep needs
   actual nonempty incident evidence, so do not run it against a new empty store
   or weaken the nonempty requirement. The first guarded demo creates that evidence.
2. Under separate explicit probe authorization, acquire a guarded loopback live demo
   using `python3 -B scripts/hp.py demo --mode live --runtime-root RUNTIME
   --output-root EVIDENCE_ROOT --timeout 60`. It generates bounded synthetic traffic,
   so it is not read-only acquisition and must not be executed during preparation.
   Its native capture/normalization/classification/Loki/postflight checks must pass.
3. Independently review the demo, retained raw and parser capture provenance and all
   source/deployment/boot relationships. Retain a confirmation with `status: PASS`,
   actual UTC `timestamp`, exact `qualification_identity`, `demo_sha256` and
   `capture_sha256` only after those checks pass. The identity contains mode,
   source_root, runtime_root, evidence_root, source_commit, image_approval_sha256, boot_id and deployment_id.
   A human assertion or a JSON field alone does not establish acceptance; the runner
   rechecks the referenced artifacts. Retain the original confirmation bytes.
4. Acquire a fresh complete prerequisite report within the existing deadline:

   ```text
   python3 -B scripts/stage7_recovery_check.py --runtime-root RUNTIME \
     --active --context ACQUISITION_CONTEXT --context-sha256 CONTEXT_SHA256
   ```

   Administrative acquisition is **OPERATOR MUST RUN IN TERMINAL**, subject to the
   exact bounded command review in AGENTS.md. This command does not start services.
   Create a **new** `phase: qualification` context with the same identity and all four
   receipt entries `prerequisites`, `demo`, `capture`, `confirmation`. Each entry is
   exactly `{"path": "/ABS/EVIDENCE/actual-file", "sha256": "<ACTUAL_SHA256>"}`.
   The capture entry identifies the exact parser snapshot from the live demo.
   Do not overwrite or reinterpret the earlier acquisition context.
5. Supply the final context alongside the exact prerequisite and validation receipt
   arguments to `scripts/stage7_qualification.py`. Without `--execute-restarts` it
   prepares a baseline only. Restart execution requires separate approval and that
   explicit flag. All seven original rows/checks and independent closeout remain.

A clean-room sweep requires actual, nonempty, complete clean incident evidence; it
never imports the laptop's known-defect exception. The positive startup record in
`logs/system/evidence-startup.jsonl` identifies the current incidentd producer/boot
and completed enumeration. It is a scoped observation, not a replacement for the
independent full-store sweep, custody checks or corruption/write-blocking tests.
Unavailable or failed enumeration cannot be relabeled CLEAN on a subsequent poll.

## Capture and deployment prerequisites

- Preserve the 64 MiB proof-file and 128 MiB aggregate snapshot limits, evidence
  scan budgets/counts and all verification timeouts. A proposed smaller capture
  ring requires deployment configuration approval; the 100 MB example segments can
  exceed the proof-file limit and are not automatically qualified for this lab.
- Acquired PCAPNG bytes stay distinct from a complete-block prefix derivative.
  Both artifacts are bounded and hashed; independent recheck must reproduce the
  exact prefix and derivation. Interior corruption, unsafe tails, nonzero TShark
  exits and missing markers fail. Do not claim this resolves the historical timeout
  without a controlled live reproduction. Original ring segments remain untouched.
- Acquisition must pin a regular source segment through O_NOFOLLOW, compare the
  selected entry with fstat before reading, and recheck both descriptor and path
  after the finite copy. Ring replacement, rewrite or growth during that copy
  aborts before parsing; use a stable segment. The acquisition includes the source
  path and matching selected/opened/after-FD/after-path identities. Independent
  verification requires these typed identities as well as raw/parser hashes and
  exact derivative bytes. Never invent missing source identity for an old receipt.
- Use only approved bridge interfaces. Do not substitute a physical LAN interface,
  enable WAN/boot automation, mount a Docker socket into decoys or relax controls.
- A rendered Compose configuration is not proof that secrets, mounts, images,
  health, containment or capture are ready. Do not run the legacy distro installer
  over an existing official Docker CE installation.
- Before startup or qualification, independently review the seven image IDs and
  references in a version-1 `images.approved.json` document (the source template is
  intentionally empty). Retain that manifest outside the clean source and supply
  `HONEYTRACE_IMAGE_APPROVAL_FILE=/ABS/PRIVATE/REVIEW/images.approved.json` and
  `HONEYTRACE_IMAGE_APPROVAL_SHA256=<SEPARATELY_REVIEWED_DIGEST>` to every command.
  The digest must also match the schema-2 context identity. Do not compute a new
  trust pin from observed images to obtain readiness. Dirty source is rejected.
- `scripts/image_lock.py` still acquires an exclusive SHA-bound local image-review
  receipt. Preserve it. Neither that runtime lock nor post-start observations
  authorize startup/qualification. Local ID agreement and source-to-image build
  provenance are distinct obligations; neither substitutes for the other.


## Results and rollback

Run the current canonical validator and `make stage7-test`, `make test`, `make
verify` against the clean checkpoint. Keep command/stdout/stderr/exit/duration,
source identity and manifests outside source. Tests with mocked Docker or synthetic
PCAPs do not qualify live deployment. No failed/skipped gate is counted as passed.

After approval and safety verification, run the seven rows once in their existing
order, stop on the first failure, preserve postflight and never retry without a new
supported hypothesis. A desktop matrix result does not clear canonical B17 or
unknown historical obligations. No Phase 7 release PASS until every mandatory gate
has objective evidence. Roll back only reviewed changes to owned resources; preserve
all logs, captures, originals, backups and acquisition reports.

A successful clean-room runner reports `STATUS: PASS` and `MATRIX_GATE: PASS` for
that completed matrix only. `STAGE7_GATE` and `STAGE8_GATE` stay `BLOCKED` pending
independent closeout and the outstanding canonical/release obligations, including
B17. A failed final postflight also blocks the matrix. The legacy runner's historical
verdict fields retain their original meaning.
