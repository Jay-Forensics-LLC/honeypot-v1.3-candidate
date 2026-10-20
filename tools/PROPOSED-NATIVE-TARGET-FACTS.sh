#!/usr/bin/env bash
# PROPOSED — NOT APPLIED / NOT EXECUTED.
# OPERATOR MUST RUN IN TERMINAL, inside the installed guest after separate boot approval.
# Saved block: tools/PROPOSED-NATIVE-TARGET-FACTS.sh. Non-modifying read queries only.
set -euo pipefail
[[ "$#" -eq 1 ]] || { printf '%s\n' 'Usage: bash tools/PROPOSED-NATIVE-TARGET-FACTS.sh REVIEWED_VM_UUID' >&2; exit 64; }
reviewed_vm_uuid="$1"
[[ "$reviewed_vm_uuid" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]] || {
  printf '%s\n' 'STOP: supply the UUID from the separately reviewed VM transaction.' >&2
  exit 64
}
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ "$EUID" -eq 0 ]]; then
  exec /usr/bin/python3 -I -B "$script_dir/native_target_facts.py" --expected-vm-uuid "$reviewed_vm_uuid"
fi
exec sudo -- /usr/bin/python3 -I -B "$script_dir/native_target_facts.py" --expected-vm-uuid "$reviewed_vm_uuid"
