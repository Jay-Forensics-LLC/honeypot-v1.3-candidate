#!/usr/bin/env bash
set -Eeuo pipefail
umask 027
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
exec python3 "$ROOT/scripts/ops.py" update "$@"
