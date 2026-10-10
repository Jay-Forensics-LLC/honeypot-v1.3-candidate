#!/usr/bin/env python3
"""Repeatable target/lab validation. Never starts decoys or applies WAN exposure."""
import argparse
import collections
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from hp_common import utc


def run(argv, timeout=180):
    return subprocess.run(argv, cwd=ROOT, text=True, capture_output=True, timeout=timeout)


def add(results, name, status, detail, evidence=''):
    row = {'check': name, 'status': status, 'detail': detail, 'evidence': evidence, 'timestamp': utc()}
    results.append(row)
    print(f'{status:10} {name}: {detail[:240]}')


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--write-report', action='store_true')
    ap.add_argument('--runtime', action='store_true', help='Run nft/netns/compose checks that need target tools')
    args = ap.parse_args()
    results = []

    unit = run([sys.executable, '-B', '-m', 'unittest', 'discover', '-s', str(ROOT / 'tests'), '-v'])
    add(results, 'Behavioral unit tests', 'PASS' if unit.returncode == 0 else 'FAIL',
        (unit.stderr or unit.stdout).strip().splitlines()[-3] if (unit.stderr or unit.stdout) else 'no output')

    val = run([sys.executable, '-B', str(ROOT / 'scripts' / 'validate.py')])
    add(results, 'Static validate.py', 'PASS' if val.returncode == 0 else 'FAIL',
        val.stdout.strip().splitlines()[-1] if val.stdout else val.stderr[-200:])

    if not args.runtime:
        add(results, 'Runtime nft/Compose/systemd', 'NOT RUN',
            'Re-run with --runtime on the isolated Ubuntu lab')
    else:
        if not shutil.which('nft'):
            add(results, 'nftables present', 'FAIL', 'nft binary missing')
        else:
            test = run([sys.executable, '-B', str(ROOT / 'scripts' / 'firewall.py'), 'test'])
            out = (test.stdout + test.stderr).strip()
            if test.returncode == 0 and 'PASS nft syntax and kernel check' in out:
                add(results, 'nft full policy check', 'PASS', 'nft -c accepted rendered hp_guard')
            elif test.returncode == 0 and 'PASS verdict-only' in out:
                add(results, 'nft full policy check', 'NOT TESTED',
                    'kernel rejected nft_log/nft_limit; verdict-only check passed', out[-500:])
                add(results, 'nft verdict-only check', 'PASS', 'drop/accept/jump policy accepted')
            else:
                add(results, 'nft policy check', 'FAIL', out[-500:])

        if os.geteuid() == 0 and shutil.which('ip') and shutil.which('nft'):
            netns = run([sys.executable, '-B', str(ROOT / 'tests' / 'firewall-netns.py')], timeout=60)
            add(results, 'Isolated netns containment',
                'PASS' if netns.returncode == 0 else 'FAIL',
                (netns.stdout or netns.stderr).strip()[-400:])
        else:
            add(results, 'Isolated netns containment', 'NOT RUN', 'root + ip + nft required')

        if shutil.which('docker'):
            compose = run(['docker', 'compose', 'config', '--quiet'])
            add(results, 'Docker Compose config', 'PASS' if compose.returncode == 0 else 'FAIL',
                compose.stderr.strip() or 'compose config --quiet')
        else:
            add(results, 'Docker Compose config', 'NOT RUN', 'docker unavailable')

        if shutil.which('systemctl'):
            state = run(['systemctl', 'is-system-running'])
            text = (state.stdout or state.stderr).strip()
            add(results, 'systemd runtime',
                'PASS' if text in ('running', 'degraded') else 'NOT RUN',
                'systemctl is-system-running=' + (text or 'unknown'))
        else:
            add(results, 'systemd runtime', 'NOT RUN', 'systemctl missing')

        for name, exe in (('Suricata', 'suricata'), ('Alloy', 'alloy'), ('YARA', 'yara')):
            add(results, name + ' binary', 'PASS' if shutil.which(exe) else 'NOT RUN',
                exe + (' present' if shutil.which(exe) else ' missing'))

    add(results, 'WAN exposure', 'NOT RUN', 'Separately gated; loopback-only remains the lab mode')
    add(results, 'Automatic decoy boot', 'NOT RUN', 'Preview units must stay disabled')
    add(results, 'Guard-table delete drill', 'NOT RUN',
        'Requires isolated Ubuntu console, WAN disconnected, and explicit session approval')

    counts = collections.Counter(r['status'] for r in results)
    print(json.dumps(dict(counts)))
    if args.write_report:
        payload = {'timestamp': utc(), 'counts': dict(counts), 'results': results}
        out = ROOT / 'work' / 'lab-acceptance-results.json'
        out.parent.mkdir(exist_ok=True)
        out.write_text(json.dumps(payload, indent=2) + '\n')
        print('Wrote ' + str(out))
    return 1 if counts.get('FAIL') else 0


if __name__ == '__main__':
    os.umask(0o027)
    raise SystemExit(main())
