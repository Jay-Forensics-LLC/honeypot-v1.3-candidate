#!/usr/bin/env bash
# Launch this checkout's local dashboard from any working directory.
set -euo pipefail

dashboard_repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
exec env -u HP_ROOT python3 -B "$dashboard_repo/honeypot/scripts/hp.py" dashboard "$@"
