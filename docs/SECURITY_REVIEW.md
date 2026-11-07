# Assessment review

**Security review** turns existing Nmap and Nuclei reports into a traceable review
queue. It imports no new scan results by itself and never starts a scanner.

1. In **Settings**, enable offline imports and Nmap and/or Nuclei. Enter the scope
   covered by your assessment and confirm assessment approval.
2. Import the existing Nmap XML or Nuclei JSONL through **Import evidence**.
3. Open **Security review**, select the reports, and choose **Load selected
   reports**. Search or filter by exact asset and review status.
4. Open **Source provenance** when checking an observation. Use **Update review**
   to record your status and note, then **Export review** for the complete selected
   source observations, decisions and provenance.

Review priority reflects the source report. A possible high/critical Nuclei
finding gets high review priority; a negative matcher remains informational and
collection errors remain collection issues. An open Nmap port is a service
observation, not proof of compromise. Suggested next steps ask you to inspect the
source, confirm intended exposure and record an interpretation.

Assets group by exact canonical IP or domain. URL observations retain their
original origins and share the recorded host group. The suite does not infer
ownership, resolve DNS to join identities, or merge Sentinel case pseudonyms into
these groups. Every selection is checked against both the source import's scope
and the currently approved scope.

Operator statuses are **Unreviewed**, **In review**, **Resolved**, **Accepted
risk** and **False positive**. They are stored separately from immutable source
findings. Resolved records your decision; it does not verify a rescan or repair.
Notes may contain multiple lines and remain part of the private review/export.
They are excluded from suite operational logging.

Individual verified imports keep review independent of the overview preview and
combined finding-export quota. A selection can include twenty reports, 20,000
records and 32 MiB of normalized data; over-budget selections fail explicitly.
Triage state lives in a private sibling of the import store, by default
`honeypot/state/phase10-reviews/decisions.json`.
