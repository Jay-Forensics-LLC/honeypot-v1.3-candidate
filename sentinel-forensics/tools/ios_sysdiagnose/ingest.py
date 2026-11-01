"""Offline, bounded sysdiagnose subset importer. Python 3.11+; stdlib only."""
# Modified for HoneyTrace on 2026-11-01: reject invalid explicit offset components.
from __future__ import annotations

import argparse
import datetime as dt
import gzip
import hashlib
import io
import json
import math
import os
from pathlib import Path
import plistlib
import re
import shutil
import stat
import tarfile
import tempfile
import unicodedata
import zipfile
from xml.parsers.expat import ExpatError
from dataclasses import asdict, dataclass

VERSION = '0.2.2'
SCHEMA = 'ios-sysdiagnose-evidence/1'


class IngestError(Exception):
    """Messages are fixed codes, never source data or filenames."""


@dataclass(frozen=True)
class Limits:
    archive_bytes: int = 256 * 1024**2
    expanded_bytes: int = 512 * 1024**2
    member_bytes: int = 32 * 1024**2
    members: int = 10000
    records: int = 100000
    record_bytes: int = 1024 * 1024


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical(value) -> bytes:
    return json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(',', ':'),
                      allow_nan=False).encode()


def hash_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def timestamp(value):
    """Never invent a zone, epoch/unit, year, or collection-time fallback."""
    if value is None:
        return None, 'missing'
    if isinstance(value, float) and not math.isfinite(value):
        return None, 'unsupported_nonfinite'
    if not isinstance(value, str) or len(value) > 80:
        return None, 'unsupported'
    try:
        value = re.sub(r'\s+([+-]\d{2}:?\d{2})$', r'\1', value)
        zone = re.search(r'([+-])(\d{2}):?(\d{2})(?::?(\d{2}))?(?:[.,]\d+)?$', value)
        if zone and (int(zone[2]) > 23 or int(zone[3]) > 59 or
                     zone[4] is not None and int(zone[4]) > 59):
            raise ValueError('invalid_timezone_offset')
        parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            return None, 'timezone_missing'
        return parsed.astimezone(dt.timezone.utc).isoformat().replace('+00:00', 'Z'), 'normalized'
    except (ValueError, OverflowError):
        return None, 'invalid'


def safe_name(name):
    if not isinstance(name, str) or not name or len(name) > 1024:
        raise IngestError('unsafe_member_path')
    # Fail closed even for cross-platform aliases; archive paths are never disk paths.
    if name.startswith('/') or '\\' in name or ':' in name or any(ord(c) < 32 or ord(c) == 127 for c in name):
        raise IngestError('unsafe_member_path')
    parts = name.rstrip('/').split('/')
    if any(p in ('', '.', '..') or p.endswith((' ', '.')) for p in parts):
        raise IngestError('unsafe_member_path')
    return unicodedata.normalize('NFC', '/'.join(parts)).casefold()


class BoundedReader:
    def __init__(self, source, maximum):
        self.source, self.maximum, self.used = source, maximum, 0

    def read(self, size=-1):
        left = self.maximum - self.used
        data = self.source.read(min(size if size >= 0 else left + 1, left + 1))
        self.used += len(data)
        if self.used > self.maximum:
            raise IngestError('expanded_budget_exceeded')
        return data


def members(snapshot, limits):
    """Stream bytes; reject links, devices, sparse entries and ambiguous names."""
    seen, files, directories = set(), set(), set()
    count = total = 0

    def check(name, size, is_dir):
        nonlocal count, total
        count += 1
        if count > limits.members:
            raise IngestError('member_count_exceeded')
        key = safe_name(name)
        parents = ['/'.join(key.split('/')[:i]) for i in range(1, len(key.split('/')))]
        if key in seen or any(p in files for p in parents) or (not is_dir and key in directories):
            raise IngestError('duplicate_or_conflicting_path')
        seen.add(key)
        directories.update(parents)
        (directories if is_dir else files).add(key)
        if size < 0 or size > limits.member_bytes:
            raise IngestError('member_budget_exceeded')
        total += size
        if total > limits.expanded_bytes:
            raise IngestError('expanded_budget_exceeded')

    if zipfile.is_zipfile(snapshot):
        with zipfile.ZipFile(snapshot) as archive:
            for index, info in enumerate(archive.infolist()):
                kind = stat.S_IFMT(info.external_attr >> 16)
                if kind not in (0, stat.S_IFREG, stat.S_IFDIR) or info.flag_bits & 1:
                    raise IngestError('unsupported_archive_entry')
                if info.orig_filename != info.filename:
                    raise IngestError('unsafe_member_path')
                check(info.filename, info.file_size, info.is_dir())
                if info.is_dir():
                    if info.file_size:
                        raise IngestError('invalid_directory')
                    continue
                with archive.open(info) as source:
                    data = source.read(limits.member_bytes + 1)
                if len(data) != info.file_size or len(data) > limits.member_bytes:
                    raise IngestError('member_size_mismatch')
                yield index, info.filename, data
    else:
        with open(snapshot, 'rb') as source:
            magic = source.read(2)
            source.seek(0)
            stream = gzip.GzipFile(fileobj=source) if magic == b'\x1f\x8b' else source
            bounded = BoundedReader(stream, limits.expanded_bytes)
            try:
                with tarfile.open(fileobj=bounded, mode='r|') as archive:
                    for index, info in enumerate(archive):
                        if not (info.isfile() or info.isdir()) or info.sparse is not None:
                            raise IngestError('unsupported_archive_entry')
                        check(info.name, info.size, info.isdir())
                        if info.isdir():
                            if info.size:
                                raise IngestError('invalid_directory')
                            continue
                        member = archive.extractfile(info)
                        with member:
                            data = member.read(limits.member_bytes + 1)
                        if len(data) != info.size:
                            raise IngestError('member_size_mismatch')
                        yield index, info.name, data
                # Read to EOF to verify gzip trailer/CRC and bound trailing bytes.
                while bounded.read(1024 * 1024):
                    pass
            finally:
                if stream is not source:
                    stream.close()


def json_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate_json_key')
        result[key] = value
    return result


def finite_json_float(text):
    """Reject numeric overflow/underflow instead of inventing infinity or zero."""
    number = float(text)
    if not math.isfinite(number):
        raise ValueError('nonfinite_json')
    if number == 0 and any(digit in '123456789' for digit in text.lower().split('e')[0]):
        raise ValueError('json_number_underflow')
    return number


def decode_json(text):
    return json.loads(text, object_pairs_hook=json_object,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError()),
                      parse_float=finite_json_float)


def records(name, data, limits):
    """Yield (locator, exact record bytes, object, error). Unsupported != clean."""
    suffix = Path(name).suffix.lower()
    if suffix in ('.jsonl', '.ndjson', '.log', '.txt'):
        offset = 0
        for line_no, raw in enumerate(io.BytesIO(data), 1):
            loc = {'line': line_no, 'byte_offset': offset, 'byte_length': len(raw)}
            offset += len(raw)
            if not raw.strip():
                continue
            if len(raw) > limits.record_bytes:
                yield loc, raw, None, 'record_budget_exceeded'
                continue
            try:
                text = raw.decode('utf-8')
                if suffix in ('.jsonl', '.ndjson') or text.lstrip().startswith('{'):
                    obj = decode_json(text)
                else:
                    match = re.match(r'^(\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d+)?(?:Z| ?[+-]\d\d:?\d\d)?)\s+(.+?)\s*$', text)
                    if not match:
                        yield loc, raw, None, 'unrecognized_text_record'
                        continue
                    obj = {'timestamp': match[1], 'message': match[2]}
                if not isinstance(obj, dict):
                    raise ValueError()
                yield loc, raw, obj, None
            except (UnicodeError, ValueError, RecursionError):
                yield loc, raw, None, 'malformed_record'
    elif suffix in ('.json', '.ips', '.plist'):
        loc = {'byte_offset': 0, 'byte_length': len(data)}
        if len(data) > limits.record_bytes:
            yield loc, data, None, 'record_budget_exceeded'
            return
        try:
            if suffix == '.plist':
                obj = plistlib.loads(data)
            elif suffix == '.ips':
                # Modern IPS often consists of a JSON header followed by JSON body.
                decoder = json.JSONDecoder(object_pairs_hook=json_object,
                    parse_constant=lambda _: (_ for _ in ()).throw(ValueError()),
                    parse_float=finite_json_float)
                text = data.decode('utf-8')
                pos, objects = 0, []
                while pos < len(text):
                    if not text[pos:].strip():
                        break
                    pos += len(text[pos:]) - len(text[pos:].lstrip())
                    obj, end = decoder.raw_decode(text, pos)
                    objects.append((pos, end, obj))
                    pos = end
                    if len(objects) > 2:
                        raise ValueError()
                if not objects or any(not isinstance(o[2], dict) for o in objects):
                    raise ValueError()
                for start, end, obj in objects:
                    raw = text[start:end].encode('utf-8')
                    yield {'byte_offset': len(text[:start].encode('utf-8')), 'byte_length': len(raw)}, raw, obj, None
                return
            else:
                obj = decode_json(data.decode('utf-8'))
            if not isinstance(obj, dict):
                raise ValueError()
            # Containers are observations of a structured diagnostic record, not invented events.
            yield loc, data, obj, None
        except (ValueError, UnicodeError, RecursionError, OverflowError, plistlib.InvalidFileException, ExpatError):
            yield loc, data, None, 'malformed_record'


def kind_for(name):
    low = name.lower()
    if '.logarchive/' in low or low.endswith(('.tracev3', '.logarchive')):
        return 'unsupported_unified_log'
    if Path(low).suffix in ('.ips', '.plist', '.json', '.jsonl', '.ndjson', '.log', '.txt'):
        return 'supported_candidate'
    return 'unsupported'


def private_json(value):
    # Plist bytes/datetimes are explicitly represented, never implicitly discarded.
    if isinstance(value, plistlib.UID):
        return {'type': 'plist_uid', 'value': value.data}
    if isinstance(value, bytes):
        return {'type': 'bytes', 'hex': value.hex()}
    if isinstance(value, dt.datetime):
        return {'type': 'plist_datetime', 'value': value.isoformat()}
    if isinstance(value, dict):
        return {str(k): private_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [private_json(v) for v in value]
    if isinstance(value, float) and (value != value or abs(value) == float('inf')):
        return {'type': 'nonfinite_number'}
    return value


def _ingest(archive_path, output, limits, include_sensitive, preserve_time_original=False):
    output = Path(output)
    # Exclusive directory; never overwrite evidence or follow an existing output symlink.
    output.mkdir(mode=0o700)
    try:
        with tempfile.TemporaryDirectory(prefix='ios-ingest-',dir=output) as work:
            snapshot = Path(work) / 'archive'
            flags = os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_NONBLOCK', 0)
            fd = os.open(archive_path, flags)
            with os.fdopen(fd, 'rb') as source, open(snapshot, 'xb') as target:
                before = os.fstat(source.fileno())
                if not stat.S_ISREG(before.st_mode):
                    raise IngestError('source_not_regular')
                h, size = hashlib.sha256(), 0
                for chunk in iter(lambda: source.read(1024 * 1024), b''):
                    size += len(chunk)
                    if size > limits.archive_bytes:
                        raise IngestError('archive_budget_exceeded')
                    h.update(chunk)
                    target.write(chunk)
                after = os.fstat(source.fileno())
                if (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_size, after.st_mtime_ns, after.st_ctime_ns):
                    raise IngestError('source_changed_during_read')
            archive_sha = h.hexdigest()
            if hash_file(snapshot) != archive_sha:
                raise IngestError('snapshot_integrity_failure')
            manifest = {'schema_version': SCHEMA, 'parser_version': VERSION,
                'archive': {'sha256': archive_sha, 'size': size}, 'limits': asdict(limits),
                'privacy': 'sensitive' if include_sensitive else 'minimized',
                'files': [], 'interpretations': [], 'suspected_anomalies': [],
                'unverified_conclusions': [], 'compromise_assessment': 'not_performed',
                'limitations': ['Subset parser; unsupported or absent records are not evidence of a clean device.',
                    'Hashes establish byte consistency, not device authenticity or acquisition custody.',
                    'Numeric timestamps and timezone-free timestamps are not guessed.',
                    'No native tracev3/logarchive decoding; no nested archive recursion.',
                    'No HoneyTrace runtime ingestion or classification is enabled.']}
            count = good = errors = 0
            seen = {}
            events_path = output / 'events.jsonl'
            with open(events_path, 'xb') as events:
                os.chmod(events_path, 0o600)
                for index, name, data in members(snapshot, limits):
                    file_sha = digest(data)
                    file_id = digest(canonical([archive_sha, index, name]))
                    entry = {'file_id': file_id, 'member_index': index,
                        'path_sha256': digest(name.encode('utf-8')), 'sha256': file_sha,
                        'size': len(data), 'discovery': kind_for(name), 'observations': 0, 'errors': 0}
                    if include_sensitive:
                        entry['archive_path'] = name
                    manifest['files'].append(entry)
                    if entry['discovery'] != 'supported_candidate':
                        continue
                    # Safe extraction into private scratch under opaque, generated names.
                    extracted = Path(work) / file_id
                    extracted.write_bytes(data)
                    if hash_file(extracted) != file_sha:
                        raise IngestError('extraction_integrity_failure')
                    for loc, raw, obj, error in records(name, data, limits):
                        count += 1
                        if count > limits.records:
                            raise IngestError('record_count_exceeded')
                        raw_sha = digest(raw)
                        event_id = digest(canonical([file_id, loc, raw_sha]))
                        provenance = {'archive_sha256': archive_sha, 'file_id': file_id,
                            'file_sha256': file_sha, 'record_sha256': raw_sha, **loc}
                        if error:
                            errors += 1
                            entry['errors'] += 1
                            record = {'event_id': event_id, 'record_type': 'parse_error',
                                'error_code': error, 'provenance': provenance}
                        else:
                            value = next((obj[k] for k in ('timestamp', 'time', 'date', 'captureTime') if k in obj), None)
                            normalized, status = timestamp(value)
                            good += 1
                            entry['observations'] += 1
                            record = {'event_id': event_id, 'record_type': 'observation',
                                'normalized': {'source': 'ios_sysdiagnose', 'timestamp': normalized,
                                    'timestamp_status': status, **({'timestamp_original': value} if preserve_time_original and (value is None or type(value) is int or type(value) is float and math.isfinite(value) or isinstance(value,str) and len(value)<=128) else {}), 'event_type': 'diagnostic.crash_report' if Path(name).suffix.lower() == '.ips' else 'diagnostic.record',
                                    'sha256': file_sha, 'notes': ['OBSERVED: diagnostic record in supplied archive; device origin unverified.']},
                                'raw': private_json(obj) if include_sensitive else None,
                                'provenance': provenance, 'duplicate_of': seen.get(raw_sha)}
                            seen.setdefault(raw_sha, event_id)
                        events.write(canonical(record) + b'\n')
                    extracted.unlink()
                events.flush()
                os.fsync(events.fileno())
            manifest['counts'] = {'observations': good, 'parse_errors': errors, 'files': len(manifest['files'])}
            manifest['coverage'] = 'partial' if errors or any(f['discovery'] != 'supported_candidate' for f in manifest['files']) else 'supported_subset_only'
            manifest['events_sha256'] = hash_file(events_path)
            manifest_path = output / 'manifest.json'
            manifest_path.write_bytes(canonical(manifest) + b'\n')
            os.chmod(manifest_path, 0o600)
            sums = output / 'SHA256SUMS'
            sums.write_text(f"{manifest['events_sha256']}  events.jsonl\n{hash_file(manifest_path)}  manifest.json\n")
            os.chmod(sums, 0o600)
            return manifest
    except BaseException:
        shutil.rmtree(output)
        raise


def ingest(archive_path, output, *, limits=None, include_sensitive=False, preserve_time_original=False):
    limits = limits or Limits()
    if any(type(v) is not int or v <= 0 for v in asdict(limits).values()):
        raise IngestError('invalid_limits')
    try:
        return _ingest(archive_path, output, limits, include_sensitive, preserve_time_original)
    except IngestError:
        raise
    except (OSError, ValueError, EOFError, tarfile.TarError, zipfile.BadZipFile,
            NotImplementedError, RuntimeError, RecursionError) as exc:
        raise IngestError('ingestion_failed_' + type(exc).__name__) from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--output', required=True, type=Path, help='New private directory; must not exist')
    parser.add_argument('--include-sensitive', action='store_true', help='Include unredacted structured records and archive paths locally')
    args = parser.parse_args()
    try:
        result = ingest(args.archive, args.output, include_sensitive=args.include_sensitive)
    except IngestError as exc:
        print(str(exc))
        return 2
    print(json.dumps({'status': 'complete', 'coverage': result['coverage'], **result['counts']}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
