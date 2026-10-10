#!/usr/bin/env python3
"""Preview-only containment monitor. Installation and activation require approval."""
import argparse
import json
import os
import subprocess
from guard_policy import inspect_guard
from hp_common import audit, require_root, run

def check(stop_decoys=False):
    report = inspect_guard()
    report['would_stop_decoys'] = not report['ok']
    if not report['ok']:
        stopped = False
        try:
            if stop_decoys:
                require_root()
                stopped = run(['docker', 'compose', 'stop', 'cowrie', 'opencanary'], timeout=120, check=False).returncode == 0
        except (OSError, subprocess.SubprocessError):
            stopped = False
        finally:
            report['decoys_stopped'] = stopped
            audit('guard.table_missing', success=stopped if stop_decoys else False,
                  approval_flags=['--stop-decoys'] if stop_decoys else [],
                  observed=report['observed'], expected=report['expected'],
                  decision='stop-decoys' if stop_decoys else 'would-stop-decoys')
    return report

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--stop-decoys', action='store_true')
    args = ap.parse_args()
    report = check(args.stop_decoys)
    print(json.dumps(report, indent=2))
    return 0 if report['ok'] else 1

if __name__ == '__main__':
    os.umask(0o027)
    raise SystemExit(main())
