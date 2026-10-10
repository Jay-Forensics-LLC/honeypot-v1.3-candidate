#!/usr/bin/env bash
set -Eeuo pipefail
umask 027
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ $# -ne 1 ]]; then echo "Usage: $0 /absolute/path/to/backup.tar.gz" >&2; exit 2; fi
exec python3 "$ROOT/scripts/backup.py" --verify "$1"
