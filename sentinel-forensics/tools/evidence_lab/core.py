"""Shared offline primitives. Evidence strings are data, never commands."""
from __future__ import annotations
from contextlib import contextmanager
from dataclasses import dataclass
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import re
import stat
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'ios_sysdiagnose'))
from ingest import IngestError, Limits, canonical, hash_file, ingest, records, timestamp, VERSION as IOS_PARSER_VERSION

VERSION = '2.0.10'
MAX_RECORD = 1024 * 1024
MAX_DEPTH = 32


def fingerprint(st):
    return st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns, st.st_ctime_ns


@contextmanager
def source_file(path):
    path = Path(path)
    if path.is_symlink() or Path(os.path.abspath(path)) != path.resolve():
        raise IngestError('source_symlink_rejected')
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_NONBLOCK', 0))
    with os.fdopen(fd, 'rb') as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
            raise IngestError('source_not_regular_or_hardlinked')
        yield stream, before
        if fingerprint(before) != fingerprint(os.fstat(stream.fileno())) or fingerprint(before) != fingerprint(path.stat()):
            raise IngestError('source_changed')


def _bounded_json(data, *, schema_probe=False):
    if len(data) > MAX_RECORD:
        raise IngestError('record_budget_exceeded')
    depth = 0
    quoted = escaped = False
    for c in data.decode('utf-8') if isinstance(data, bytes) else data:
        if escaped:
            escaped = False
        elif c == '\\' and quoted:
            escaped = True
        elif c == '"':
            quoted = not quoted
        elif not quoted:
            if c in '[{': depth += 1
            elif c in ']}': depth -= 1
            if depth > MAX_DEPTH: raise IngestError('json_depth_exceeded')
    def pairs(items):
        result = {}
        for k, v in items:
            if k in result: raise IngestError('duplicate_json_key')
            result[k] = v
        return result
    def constant(_): raise IngestError('nonfinite_json')
    def decimal_number(token):
        number = float(token)
        if not math.isfinite(number): raise IngestError('nonfinite_json')
        # Reject nonzero decimal values that would silently become zero.
        if number == 0 and any(c in '123456789' for c in token.lower().split('e', 1)[0]):
            raise IngestError('json_number_underflow')
        return number
    return json.loads(data, object_pairs_hook=pairs, parse_constant=constant,
        parse_float=(lambda _: 0) if schema_probe else decimal_number,
        parse_int=(lambda _: 0) if schema_probe else int)


def strict_json(data):
    return _bounded_json(data)


def json_schema_probe(data):
    """Return only explicit schema-marker presence for bounded JSON dispatch.

    Number tokens become inert placeholders so field-value validation cannot
    hide the marker. Structure, UTF-8, duplicate keys, depth, size and invalid
    NaN/Infinity literals retain the strict loader's checks. Never use this
    probe's placeholders as observations: every record still uses strict_json.
    """
    obj = _bounded_json(data, schema_probe=True)
    return isinstance(obj, dict) and obj.get('schema') is not None


def private_write(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def atomic_json(path, obj):
    tmp = path.with_suffix(path.suffix + '.pending')
    private_write(tmp, canonical(obj) + b'\n')
    os.replace(tmp, path)


def time_info(value=None, *, ticks=None, units=None, offset=0, clock='unknown'):
    """Integer nanoseconds are query keys. Original ticks/resolution remain lossless."""
    result = {'original': value, 'utc_ns': None, 'precision': None, 'timezone': None,
              'status': 'missing' if value is None and ticks is None else 'unresolved', 'clock': clock}
    if ticks is not None:
        result.update(original={'ticks': ticks, 'units_per_second': units, 'offset_seconds': offset},
                      precision={'numerator': 1, 'denominator': units}, timezone='UTC', status='normalized')
        ns = ticks * 10**9 // units + offset * 10**9
    else:
        if not isinstance(value, str) or len(value) > 128:
            return result
        # Numeric timestamps are deliberately not assigned an epoch/unit.
        match = re.fullmatch(r'\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.(\d{1,9}))?(Z|[+-]\d\d:\d\d)?', value)
        if not match: return result
        fraction, zone = match.groups()
        result.update(precision={'decimal_digits': len(fraction or '')}, timezone=zone)
        try:
            # datetime accepts offsets such as +01:99 by carrying the minutes.
            # Evidence must retain an invalid value, never silently repair it.
            if zone and zone != 'Z' and (int(zone[1:3]) > 23 or int(zone[4:6]) > 59):
                raise ValueError('invalid_timezone_offset')
            date = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
            if not zone:
                result['status'] = 'timezone_unknown'
                return result
            base = date.replace(microsecond=0).astimezone(dt.timezone.utc) - dt.datetime(1970, 1, 1, tzinfo=dt.timezone.utc)
            ns = (base.days * 86400 + base.seconds) * 10**9 + int((fraction or '').ljust(9, '0'))
        except (ValueError, OverflowError):
            result['status'] = 'invalid'
            return result
        result['status'] = 'normalized'
    if not -(2**63) < ns < 2**63:
        result['status'] = 'outside_index_time_range'
        return result
    result['utc_ns'] = ns
    return result


def iso_ns(ns):
    if ns is None: return None
    sec, fraction = divmod(ns, 10**9)
    return dt.datetime.fromtimestamp(sec, dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S') + f'.{fraction:09d}Z'


class Reader:
    def __init__(self, stream):
        self.stream, self.sha, self.offset = stream, hashlib.sha256(), 0
    def read(self, size):
        data = self.stream.read(size)
        self.sha.update(data)
        self.offset += len(data)
        return data
    def exact(self, size):
        data = self.read(size)
        if len(data) != size: raise IngestError('truncated_capture')
        return data
    def line(self):
        data = self.stream.readline(MAX_RECORD + 1)
        self.sha.update(data)
        self.offset += len(data)
        return data
