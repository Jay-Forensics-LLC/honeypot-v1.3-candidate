"""Run both offline suites from any working directory."""
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
results = [subprocess.run([sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-v'],
                         cwd=root / name).returncode
           for name in ('ios_sysdiagnose', 'evidence_lab')]
raise SystemExit(1 if any(results) else 0)
