"""Read-only capture identity checks. No restart, recovery, or evidence mutation."""
from pathlib import Path
import subprocess
from hp_common import config, runtime_path, run, utc


def inspect_capture(root, runner=run, proc=Path('/proc')):
    cfg = config(root)
    row = {'timestamp': utc(), 'ok': False, 'problems': [], 'continuity': 'NOT TESTED'}
    try:
        result = runner(['systemctl', 'show', 'honeypot-pcap.service',
                         '--property=ActiveState', '--property=SubState', '--property=MainPID',
                         '--property=Result'], timeout=10, check=True)
        service = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
        row['service'] = service
        if service.get('ActiveState') != 'active' or service.get('SubState') != 'running':
            raise ValueError('Capture service is not active/running; inspect its journal and disk watermarks')
        pid = int(service.get('MainPID', '0'))
        if pid <= 0:
            raise ValueError('Capture service has no MainPID')
        # comm can contain spaces and parentheses; field 22 is starttime.
        stat = (proc / str(pid) / 'stat').read_text().rsplit(')', 1)[1].split()
        argv = (proc / str(pid) / 'cmdline').read_bytes().rstrip(b'\0').decode().split('\0')
        expected = [v.strip() for v in cfg.get('PCAP_INTERFACES', cfg.get('HONEYPOT_INTERFACE', '')).split(',') if v.strip()]
        actual = [argv[i + 1] for i, v in enumerate(argv[:-1]) if v == '-i']
        dest = runtime_path('PCAP_PATH', 'captures', root).resolve()
        row.update(pid=pid, start_ticks=int(stat[19]), argv=argv, interfaces=actual,
                   capture_directory=str(dest))
        if stat[0] == 'Z' or Path(argv[0]).name != 'dumpcap':
            raise ValueError('MainPID is not a running dumpcap process')
        if not expected or actual != expected:
            raise ValueError('Capture interfaces differ from configured interfaces')
        if argv.count('-w') != 1 or Path(argv[argv.index('-w') + 1]).resolve() != dest / 'ring.pcapng':
            raise ValueError('Capture destination differs from configured ring')
        ring = [argv[i + 1] for i, v in enumerate(argv[:-1]) if v == '-b']
        size = int(cfg['PCAP_SIZE_MB']); count = int(cfg['PCAP_FILE_COUNT'])
        if not 1 <= size <= 1000 or not 2 <= count <= 5000 or size * count > 150000:
            raise ValueError('Capture budget exceeds startup safety limits')
        expected_ring = [f'filesize:{size * 1000}', f'files:{count}', 'duration:300']
        if sorted(ring) != sorted(expected_ring) or '-a' in argv:
            raise ValueError('Capture ring differs or has an automatic stop condition')
        after = (proc / str(pid) / 'stat').read_text().rsplit(')', 1)[1].split()
        if after[19] != stat[19] or after[0] == 'Z':
            raise ValueError('Capture process changed during inspection')
        row['ok'] = True
    except (OSError, ValueError, IndexError, KeyError, subprocess.SubprocessError) as exc:
        row['problems'].append(str(exc))
    return row
