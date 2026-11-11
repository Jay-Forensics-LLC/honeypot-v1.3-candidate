# Signed coverage checkpoint for PR #30

**October 26 disposition:** PR #33 merged this receipt as
`31468568e2b018332733c570213088ecaf5c76d3`. Its reviewed signed head was
`3c056853c04ec1509cd08342d87e2899e001126b`; Codex completed with no findings.
PR #30 was closed **without merge** on October 23 as superseded by merged #31;
its published history remains preserved. The equality below refers only to the
two pinned October 20 trees, not #30's later head or current HoneyWatch.
See [current status](CURRENT_PHASE_STATUS.md) for later integration, CI, reviews
and remaining gates. The original checkpoint narrative below is historical;
its “remains open” / “review is requested” statements describe October 20.

PR #30's complete candidate is already present in HoneyWatch. This receipt
records its coverage on the current default branch; the replacement introduces
no application or tooling changes and retains PR #30 and its published history.

GitHub observations on 2026-10-20 bind:

- PR #30 head: `7c601d53357b57b1b86a05de87402ca9bc4cabce` (24 commits: 19 unsigned and 5 verified).
- HoneyWatch base: `c0aa6bd70064b1c0602bf1b635b8800ee95ea641`.
- Both complete trees: `336b693af2669a6fbaece9dbe2dc82cbac993300`.
- Application subtree (`honeypot/`): `85a6017654f5dbdb5c2845873a07b81058248414`.
- Tooling subtree (`tools/`): `c7b8a147709bc4116fcaa6bff92d6c091d9dfa24`.

[PR #32](https://github.com/Jay-Forensics-LLC/honeypot-v1.3-candidate/pull/32)
was merged into the prior signed checkpoint branch at
`af7462e5921bad340ace4070c69fa9a044815af1`.
[PR #31](https://github.com/Jay-Forensics-LLC/honeypot-v1.3-candidate/pull/31)
was then merged into HoneyWatch as `c0aa6bd70064b1c0602bf1b635b8800ee95ea641`.
PR #30's later merge from HoneyWatch produced the same complete tree. Its
unsigned ancestry has no remaining source delta to transplant onto this base.

The exact retained comparison is:

```bash
git diff --exit-code --binary --full-index \
  c0aa6bd70064b1c0602bf1b635b8800ee95ea641 \
  7c601d53357b57b1b86a05de87402ca9bc4cabce
```

It produced zero bytes (SHA-256
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`). Recursive Git file inventories also
match byte for byte across all 254 tracked paths, including modes and blob IDs.
The signed replacement is one new commit directly on the pinned HoneyWatch
base. Its only source-tree addition is this coverage receipt; every pre-existing
file must retain its base blob and mode. A reviewer can compare the parent and
replacement trees without replaying the old unsigned commits.

The 235-file application package
`SOURCE-CANDIDATE-UNACCEPTED-72d1c00bf894.tar.gz` remains historical and unchanged
(SHA-256 `8fb323aebe94b6d3835ab1d0f30ae19d922d0338aebf76a8e82d5f5b2029a71e`).
The native-facts tooling package at `92938b75f94e5bafe7a0ad87f50f68382dfbdc0e`
also remains unchanged (SHA-256
`5ba64e010e3cae04fd1d0dcd4d671b4a9d042143f175d6f756ccc2e4042ff42f`).
New private sidecar receipts bind their exact file bytes/modes to this replacement
commit after signing; neither historical manifest is relabeled or overwritten.
These packages are source candidates, not accepted installed artifacts.

Independent review is requested for the replacement's exact signed head.
Historical source reviews remain tied to their original commits; they are not
reissued as an approval of a new commit. PR #30 remains open for provenance.
No history rewrite, protection/hook change, merge, deployment, native execution,
forensic evidence change or live operation is part of this checkpoint.
Phase 7 runtime/B17 and beta acceptance remain unproven; Phase 8 remains gated.
