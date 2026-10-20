#!/usr/bin/env python3
"""Explicit live-raw-log retention. No recursion and no forensic evidence deletion."""
import gzip
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import time
from hp_common import ROOT, config, require_root, append_json, utc


def _identity(info):
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def _copy_pinned(source, destination, size):
    remaining = size
    while remaining:
        chunk = source.read(min(remaining, 1024**2))
        if not chunk:
            raise ValueError('Cold-log source shrank during compression')
        destination.write(chunk)
        remaining -= len(chunk)


def compress_log(path, before, staging_parent):
    """Publish only a stable regular-file copy; never unlink a replacement name."""
    path, staging_parent = Path(path), Path(staging_parent)
    if (path.parent.resolve() != path.parent.absolute() or
            staging_parent.resolve() != staging_parent.absolute() or
            not staging_parent.is_dir() or staging_parent.stat().st_uid != os.geteuid() or
            staging_parent.stat().st_mode & 0o022):
        raise ValueError('Cold-log staging and source parents require canonical protected directories')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        opened = os.fstat(fd)
        if (not stat.S_ISREG(opened.st_mode) or opened.st_nlink != 1 or
                _identity(opened) != _identity(before)):
            raise ValueError('Cold-log input identity or regular-file type changed')
        # This directory is outside the container-writable log mount. A failed
        # compression never publishes partially acquired bytes to that mount.
        with tempfile.TemporaryDirectory(prefix='.cold-log-', dir=staging_parent) as temporary:
            staged = Path(temporary) / 'compressed.gz'
            with os.fdopen(fd, 'rb', closefd=False) as source, staged.open('xb') as output:
                with gzip.GzipFile(fileobj=output, mode='wb') as compressed:
                    _copy_pinned(source, compressed, opened.st_size)
                output.flush(); os.fsync(output.fileno())
            if (_identity(os.fstat(fd)) != _identity(opened) or
                    _identity(path.lstat()) != _identity(opened)):
                raise ValueError('Cold-log source changed during compression; original preserved')
            os.chown(staged, -1, opened.st_gid)
            os.chmod(staged, 0o640)
            os.utime(staged, (opened.st_atime, opened.st_mtime))
            destination = path.with_name(path.name + '.gz')
            # Exclusive publication cannot overwrite an existing file/symlink.
            os.link(staged, destination, follow_symlinks=False)
        # Preserve the source until normal configured expiry. A separate
        # check-then-unlink could otherwise delete a newly replaced raw log.
        return 'compressed_source_retained'
    finally:
        os.close(fd)


if __name__=='__main__':
    require_root();os.umask(0o027)
    policy=json.loads((ROOT/'configs/logrotate/cowrie-cold-policy.json').read_text())
    base=ROOT/'logs/cowrie';days=int(config()['LOG_RETENTION_DAYS'])
    if not 1<=days<=90:raise SystemExit('Retention must be 1..90 days')
    for p in base.iterdir():
        if p.is_symlink() or not p.is_file() or not re.fullmatch(policy['filename_pattern'],p.name):continue
        age=(time.time()-p.stat().st_mtime)/86400
        if age>days:
            # This is normal, explicitly scoped live log rotation, never incident evidence.
            p.unlink();action='expired'
        elif age>1 and p.suffix!='.gz':
            dest=p.with_name(p.name+'.gz')
            if dest.exists():continue
            before=p.lstat()
            try:
                action=compress_log(p,before,ROOT/'state')
            except (OSError, ValueError):
                action='compression_refused_input_changed_or_unsafe'
        else:continue
        append_json(ROOT/'logs/system/retention.jsonl',{'timestamp':utc(),'action':action,'path':str(p),'scope':'expired live raw logs only'},rotate=True)
