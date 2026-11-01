#!/usr/bin/env bash
# Launch this checkout's local dashboard from any working directory.
set -euo pipefail

dashboard_repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
if ! command -v python3 >/dev/null 2>&1; then
    printf '%s\n' 'HoneyTrace requires Python 3.11 or newer with the standard-library sqlite3 module.' >&2
    exit 1
fi
python3 -I -B - <<'PY'
import sys

if sys.version_info < (3, 11):
    raise SystemExit('HoneyTrace requires Python 3.11 or newer; found ' + sys.version.split()[0] + '.')
try:
    import sqlite3
except ImportError:
    raise SystemExit('HoneyTrace requires Python with its standard-library sqlite3 module available.')
PY
exec env -u HP_ROOT python3 -B "$dashboard_repo/honeypot/scripts/hp.py" dashboard "$@"
