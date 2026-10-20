# Native guest baseline for Phase 7 preparation

`tools/native_target_facts.py` collects private native facts after a separately
approved installed-system boot. It requires the reviewed VM UUID, Ubuntu 24.04
x86_64, CPython 3.12, QEMU/KVM virtualization, a native machine ID and boot ID.
It refuses another target before querying packages. Linux exposes the DMI UUID
through a privileged sysfs file on many systems; an unreadable UUID produces an
incomplete report. An operator may need to run the reviewed read-only command
with sudo in the guest terminal. Never substitute host facts or another UUID.

The collector issues only read queries. It does not contact the Docker daemon,
install packages, configure a network, change the clock, run healthchecks, start
services or run qualification. It prints JSON to stdout and creates no files.
Use `python3 -I -B` to avoid local module imports and bytecode writes. Retain its
complete stdout as private evidence using the separately reviewed acquisition
procedure. A real report includes machine/package identities and must not enter
the public repository or a sanitized distribution.

Command output has explicit time and byte bounds. Exact stdout/stderr bytes are
base64 encoded with byte counts and SHA-256 hashes. A timeout, nonzero required
query, excess output, incomplete row, duplicate package or database change blocks
completion; partial command bytes remain visible. It never silently truncates a
complete package baseline to a display limit. The default query bound is 8 MiB
stdout / 64 KiB stderr, with at most 20,000 package rows. The command phase has a
45-second budget and a maximum 10 seconds per query; cleanup has a 5-second bound.

Two full `dpkg-query` inventories and before/after dpkg status bytes must match;
pending dpkg updates and a nonempty `dpkg --audit` block completion. Missing
optional tools and required package observations remain explicit. The complete
inventory is retained even when a required deployment tool is not installed.
No APT update, download, dependency selection or package installation occurs.

`COMPLETE_BASELINE_ONLY` means that the native baseline collection completed.
It is not an approved dependency closure, signed package attestation, installed
file integrity audit, application consistency proof, clock qualification or B17
installation acceptance. Concurrent changes outside the finite observation
window are unproven. All reports keep B17 false and Phase 7/Phase 8 blocked.
The baseline is input to a later guest-specific package transaction review.

No guest collector execution is implied by adding this tool. VM creation,
installed-system boot, provisioning, images, deployment, current qualification
and Phase 8 boot/recovery remain separately scoped actions. Preserve all prior
receipts, failed attempts and the original dirty workspace.
