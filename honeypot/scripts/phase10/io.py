"""Bounded, non-executing report readers and parsers."""
import json
import math
import os
from pathlib import Path
import re
import stat
import xml.etree.ElementTree as ET
from .model import MAX_BYTES, MAX_RECORDS, Phase10Error


def read_regular(path, max_bytes=MAX_BYTES):
    if type(max_bytes) is not int or not 1 <= max_bytes <= 64 * 1024**2:
        raise Phase10Error('Invalid input byte limit')
    path = Path(path).absolute()
    if '..' in path.parts:
        raise Phase10Error('Input parent traversal is unsupported')
    directory = descriptor = None
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
    try:
        directory = os.open(path.anchor, flags)
        for part in path.parent.parts[1:]:
            child = os.open(part, flags, dir_fd=directory)
            os.close(directory)
            directory = child
        descriptor = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=directory)
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or before.st_size > max_bytes:
            raise Phase10Error('Input is not a bounded regular file')
        chunks, remaining = [], before.st_size
        while remaining:
            chunk = os.read(descriptor, min(65536, remaining))
            if not chunk:
                raise Phase10Error('Input changed during read')
            chunks.append(chunk)
            remaining -= len(chunk)
        after = os.fstat(descriptor)
        identity = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
        if identity(before) != identity(after):
            raise Phase10Error('Input changed during read')
        return b''.join(chunks)
    except OSError as exc:
        raise Phase10Error('Input unavailable or unsupported') from exc
    finally:
        if descriptor is not None:
            os.close(descriptor)
        if directory is not None:
            os.close(directory)


def _text(data):
    if not isinstance(data, bytes) or len(data) > MAX_BYTES:
        raise Phase10Error('Input byte limit exceeded')
    try:
        return data.decode('utf-8-sig')
    except UnicodeError as exc:
        raise Phase10Error('UTF-8 input required') from exc


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise Phase10Error('Duplicate JSON key')
        result[key] = value
    return result


def _float(value):
    number = float(value)
    if not math.isfinite(number):
        raise Phase10Error('Non-finite JSON number')
    return number


def parse_json(data):
    text = _text(data)
    quoted = escaped = False
    depth = tokens = 0
    for char in text:
        if quoted:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == '"':
                quoted = False
        elif char == '"':
            quoted = True
        elif char in '[{':
            depth += 1
            tokens += 1
        elif char in ']}':
            depth -= 1
        elif char == ',':
            tokens += 1
        if depth > 32 or tokens > MAX_RECORDS * 64:
            raise Phase10Error('JSON structure limit exceeded')
    try:
        return json.loads(text, object_pairs_hook=_pairs, parse_float=_float,
                          parse_constant=lambda _: (_ for _ in ()).throw(Phase10Error('Non-finite JSON number')))
    except (ValueError, RecursionError) as exc:
        raise Phase10Error('Invalid JSON structure') from exc


def parse_jsonl(data, max_records=MAX_RECORDS):
    if type(max_records) is not int or not 1 <= max_records <= MAX_RECORDS:
        raise Phase10Error('Invalid record limit')
    rows = []
    for line in _text(data).splitlines():
        if not line.strip():
            continue
        if len(rows) >= max_records:
            raise Phase10Error('Record limit exceeded')
        row = parse_json(line.encode('utf-8'))
        if not isinstance(row, dict):
            raise Phase10Error('JSONL objects required')
        rows.append(row)
    return rows


def parse_xml(data):
    text = _text(data)
    if re.search(r'<!\s*(?:DOCTYPE|ENTITY)\b', text, re.I) or text.count('<') > 100000:
        raise Phase10Error('Unsupported XML declarations or size')
    try:
        root = ET.fromstring(text)
    except (ET.ParseError, ValueError) as exc:
        raise Phase10Error('Invalid XML structure') from exc
    stack = [(root, 1)]
    while stack:
        node, depth = stack.pop()
        if depth > 32 or len(node.attrib) > 100 or any(len(s) > 4096 for s in (node.text or '', *node.attrib.keys(), *node.attrib.values())):
            raise Phase10Error('XML structure limit exceeded')
        stack.extend((child, depth + 1) for child in node)
    return root


def record_limit(rows, context):
    limit = context.get('max_records', MAX_RECORDS)
    if type(limit) is not int or not 1 <= limit <= MAX_RECORDS:
        raise Phase10Error('Invalid record limit')
    result = []
    for row in rows:
        if len(result) >= limit:
            raise Phase10Error('Record limit exceeded')
        result.append(row)
    return result
