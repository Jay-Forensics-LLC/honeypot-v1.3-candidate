"""Read a finite tail of an operational log; never treat unreadability as idle."""
import os
from pathlib import Path
import stat


def read_tail(path, count=20, budget=1024**2):
    if not 1 <= count <= 1000 or not 1 <= budget <= 4 * 1024**2:
        raise ValueError('Invalid log tail read limit')
    path = Path(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode):
            raise ValueError('Operational log must be a regular non-symlink file')
        offset = max(0, before.st_size - budget)
        os.lseek(fd, max(0, offset - 1), os.SEEK_SET)
        data = os.read(fd, budget + int(offset > 0))
        partial = False
        if offset:
            if data[:1] == b'\n': data = data[1:]
            else:
                boundary = data.find(b'\n')
                data = data[boundary + 1:] if boundary >= 0 else b''
                partial = True
        if data and not data.endswith(b'\n'):
            data = data[:data.rfind(b'\n') + 1]
            partial = True
        current = path.lstat()
        after = os.fstat(fd)
        if ((current.st_dev, current.st_ino) != (before.st_dev, before.st_ino) or
                after.st_size < before.st_size):
            raise ValueError('Log rotated or truncated during bounded read; observation incomplete')
        return {'lines': data.splitlines()[-count:], 'empty': before.st_size == 0,
                'bounded': bool(offset), 'partial_records_withheld': partial,
                'read_budget_bytes': budget, 'inode': before.st_ino}
    finally:
        os.close(fd)
