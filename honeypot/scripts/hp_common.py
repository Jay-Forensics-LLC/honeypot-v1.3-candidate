"""Shared, dependency-free helpers. Untrusted log data is never a command."""
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import stat
import tempfile
import functools
import sys
import time

ROOT = Path(os.environ.get('HP_ROOT', Path(__file__).resolve().parents[1])).resolve()
_LOG_LOCK_TIMEOUT = 1.0

def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00', 'Z')

def config(root=ROOT):
    values = {}
    for name in ('.env.example', '.env'):
        path = root / name
        if not path.exists():
            continue
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            key, sep, value = line.partition('=')
            if not sep or not re.fullmatch(r'[A-Z][A-Z0-9_]*', key):
                raise ValueError(f'Invalid configuration line in {name}')
            if any(c in value for c in '\r\n\x00') or (value and value[0] in "\"'"):
                raise ValueError(f'Use unquoted plain values for {key}')
            values[key] = value
    return values

def runtime_path(key, fallback, root=ROOT):
    # Container mounts have stable names regardless of the host's storage locations.
    if str(root) == '/hp':
        return root / fallback
    p = Path(config(root).get(key, fallback))
    return p if p.is_absolute() else root / p

def atomic_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix='.write-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=True, indent=2)
            f.write('\n'); f.flush(); os.fsync(f.fileno())
        os.chmod(tmp, 0o640)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)

def _log_parent(path):
    """Pin each directory without following an attacker-replaced ancestor."""
    path = Path(path).absolute()
    if '..' in path.parts:
        raise ValueError('Operational log path cannot contain parent traversal')
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    fd = os.open(path.anchor, flags)
    try:
        for part in path.parent.parts[1:]:
            try:
                child = os.open(part, flags, dir_fd=fd)
            except FileNotFoundError:
                try:
                    os.mkdir(part, mode=0o750, dir_fd=fd)
                except FileExistsError:
                    pass
                child = os.open(part, flags, dir_fd=fd)
            os.close(fd)
            fd = child
        return fd, path.name
    except BaseException:
        os.close(fd)
        raise


def _log_regular(parent, name):
    try:
        info = os.stat(name, dir_fd=parent, follow_symlinks=False)
    except FileNotFoundError:
        return None
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise ValueError('Operational log must be a regular single-link file')
    return info


def _lock_log_directory(parent):
    """A less-trusted reader can hold flock too; bound operational lock waiting."""
    deadline = time.monotonic() + _LOG_LOCK_TIMEOUT
    while True:
        try:
            fcntl.flock(parent, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return
        except BlockingIOError:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError('Operational log directory lock deadline exceeded')
            time.sleep(min(0.01, remaining))


def append_json(path, data, rotate=False):
    # A privileged writer shares some operational directories with incidentd.
    # Never follow their file/ancestor symlinks or write through a hard link.
    encoded = (json.dumps(data, ensure_ascii=True, separators=(',', ':')) + '\n').encode()
    parent, name = _log_parent(path)
    try:
        # Directory identity survives file rotation. A per-log-file lock would
        # split writers across old/new inodes; a sidecar introduces another
        # writable name. Linux flock serializes cooperating writers on this
        # already pinned directory until close, including exceptions.
        _lock_log_directory(parent)
        prior = _log_regular(parent, name)
        if rotate and prior is not None and prior.st_size > 20 * 1024**2:
            # Only live operational logs use rotation; never evidence/manifests.
            for i in range(9, 0, -1):
                source, target = f'{name}.{i}', f'{name}.{i+1}'
                if _log_regular(parent, source) is not None:
                    _log_regular(parent, target)
                    os.replace(source, target, src_dir_fd=parent, dst_dir_fd=parent)
            _log_regular(parent, name + '.1')
            os.replace(name, name + '.1', src_dir_fd=parent, dst_dir_fd=parent)
        fd = os.open(name, os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK,
                     0o640, dir_fd=parent)
        try:
            info = os.fstat(fd)
            current = _log_regular(parent, name)
            if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or current is None or
                    (info.st_dev, info.st_ino) != (current.st_dev, current.st_ino)):
                raise ValueError('Operational log changed during safe open')
            while encoded:
                written = os.write(fd, encoded)
                if written <= 0:
                    raise OSError('Operational log append made no progress')
                encoded = encoded[written:]
        finally:
            os.close(fd)
    finally:
        os.close(parent)

def sha256(path):
    # Reject symlinks, device nodes, FIFOs and unstable writes. Never execute samples.
    path = Path(path)
    import stat
    flags = os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_NONBLOCK', 0)
    fd = os.open(path, flags)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or path.is_symlink():
            raise ValueError('Evidence must be a regular non-symlink file')
        h = hashlib.sha256()
        with os.fdopen(fd, 'rb', closefd=False) as f:
            for chunk in iter(lambda: f.read(1024*1024), b''): h.update(chunk)
        after = os.fstat(fd)
        if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            raise ValueError('File changed while hashing; retry after writer closes it')
        return h.hexdigest(), after.st_size
    finally:
        os.close(fd)

def run(argv, timeout=30, check=True):
    return subprocess.run(argv, cwd=ROOT, text=True, capture_output=True, timeout=timeout, check=check)

def audit(action, **fields):
    # An allowlist prevents newly supplied payload/secret fields reaching telemetry.
    allowed = {'source_ip', 'unit', 'container', 'scope', 'decision', 'observed', 'expected'}
    row = {'timestamp': utc(), 'action': action, 'actor': os.getuid() if hasattr(os, 'getuid') else None,
           'approval_flags': [x for x in fields.get('approval_flags', []) if x in
                              ('--apply', '--approved', '--install', '--install-preview', '--exposure-approved', '--stop-decoys', '--copy-evidence')],
           'success': fields.get('success') is True}
    row.update({k: redact(v) for k, v in fields.items() if k in allowed})
    append_json(ROOT/'logs/system/audit.jsonl', row, rotate=True)
    if action.startswith(('firewall.', 'container.', 'guard.')):
        append_json(ROOT/'logs/system/containment.jsonl', row, rotate=True)

def redact(value):
    """Remove structured secrets recursively; malformed raw lines must be withheld."""
    if isinstance(value, dict):
        clean = {}
        for key, item in value.items():
            lower = str(key).lower()
            if lower in ('password_present', 'password_length'):
                clean[key] = bool(item) if lower.endswith('present') else (item if isinstance(item, int) else None)
            elif any(token in lower for token in ('password', 'passwd', 'secret', 'token', 'authorization', 'credential', 'artifact_bytes', 'payload')):
                if 'password' in lower or 'passwd' in lower: clean['password_present'] = True
            else: clean[key] = redact(item)
        return clean
    if isinstance(value, list): return [redact(x) for x in value]
    if isinstance(value, bytes): return '[withheld bytes]'
    return value

def audited(action):
    def decorate(fn):
        @functools.wraps(fn)
        def wrapped(*args, **kwargs):
            success = False
            try:
                result = fn(*args, **kwargs)
                success = True
                return result
            finally:
                audit(action, success=success, approval_flags=sys.argv[1:])
        return wrapped
    return decorate

def require_root():
    if not hasattr(os, 'geteuid') or os.geteuid() != 0:
        raise SystemExit('Root required on the Ubuntu target.')

def disk_severity(percent, cfg=None):
    cfg = cfg or {}
    for name, key, default in [('CRITICAL','DISK_CRITICAL_PERCENT',95),('HIGH','DISK_HIGH_PERCENT',90),('MEDIUM','DISK_WARN_PERCENT',80)]:
        if percent >= int(cfg.get(key, default)): return name
    return 'LOW'
