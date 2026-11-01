"""Private content-addressed originals and independently hashed projections."""
from contextlib import contextmanager
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
from operational_log import get_log
from .io import parse_json, parse_jsonl
from .model import MAX_BYTES, Phase10Error, make_finding, timestamp

MAX_STORE_BYTES = 256 * 1024**2
MAX_IMPORTS = 1000
_DIRECTORY = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC


def _json(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True) + '\n').encode()


def _child(parent, name, create=False):
    try:
        descriptor = os.open(name, _DIRECTORY, dir_fd=parent)
    except FileNotFoundError:
        if not create:
            raise
        os.mkdir(name, mode=0o700, dir_fd=parent)
        descriptor = os.open(name, _DIRECTORY, dir_fd=parent)
    info = os.fstat(descriptor)
    if info.st_uid != os.geteuid() or info.st_mode & 0o077:
        os.close(descriptor)
        raise Phase10Error('Integration store directories must be private and operator-owned')
    return descriptor


def _read(parent, name, limit=MAX_BYTES):
    descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=parent)
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size > limit or before.st_mode & 0o077:
            raise Phase10Error('Unsupported stored object')
        chunks, remaining = [], before.st_size
        while remaining:
            part = os.read(descriptor, min(65536, remaining))
            if not part:
                raise Phase10Error('Stored object changed')
            chunks.append(part)
            remaining -= len(part)
        after = os.fstat(descriptor)
        if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
            raise Phase10Error('Stored object changed')
        return b''.join(chunks)
    finally:
        os.close(descriptor)


def _write_once(parent, name, data):
    try:
        descriptor = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=parent)
    except FileExistsError:
        if _read(parent, name) != data:
            raise Phase10Error('Immutable integration object differs')
        return False
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.fsync(parent)
    except BaseException:
        os.unlink(name, dir_fd=parent)
        raise
    return True


class Store:
    def __init__(self, root, policy):
        self.root = Path(root).absolute()
        if '..' in self.root.parts or len(self.root.parts) < 2:
            raise Phase10Error('Store parent traversal is unsupported')
        self.policy = policy

    @contextmanager
    def _open(self, create=False):
        descriptor = os.open(self.root.anchor, _DIRECTORY)
        try:
            for index, part in enumerate(self.root.parts[1:]):
                leaf = index == len(self.root.parts) - 2
                try:
                    child = os.open(part, _DIRECTORY, dir_fd=descriptor)
                except FileNotFoundError:
                    if not create:
                        raise
                    os.mkdir(part, mode=0o700, dir_fd=descriptor)
                    child = os.open(part, _DIRECTORY, dir_fd=descriptor)
                os.close(descriptor)
                descriptor = child
                if leaf:
                    info = os.fstat(descriptor)
                    if info.st_uid != os.geteuid() or info.st_mode & 0o077:
                        raise Phase10Error('Integration store must be private and operator-owned')
            fcntl.flock(descriptor, (fcntl.LOCK_EX if create else fcntl.LOCK_SH) | fcntl.LOCK_NB)
            yield descriptor
        except FileNotFoundError:
            raise
        except OSError as exc:
            raise Phase10Error('Integration store unavailable or busy') from exc
        finally:
            os.close(descriptor)

    def _manifests(self, root):
        try:
            directory = _child(root, 'imports')
        except FileNotFoundError:
            return []
        try:
            names = os.listdir(directory)
            if len(names) > MAX_IMPORTS or any(not re.fullmatch('[a-f0-9]{64}\\.json', n) for n in names):
                raise Phase10Error('Unsupported import inventory')
            rows, total = [], 0
            for name in sorted(names):
                data = _read(directory, name, 1024 * 1024)
                total += len(data)
                if total > MAX_BYTES:
                    raise Phase10Error('Manifest inventory byte limit exceeded')
                row = parse_json(data)
                if not isinstance(row, dict) or row.get('import_id') != name[:-5]:
                    raise Phase10Error('Invalid import manifest')
                rows.append(row)
            return rows
        finally:
            os.close(directory)

    def _verify(self, root, manifest):
        try:
            identifier = manifest['import_id']
            digest = manifest['raw_source_hash'].removeprefix('sha256:')
            if not re.fullmatch('[a-f0-9]{64}', identifier) or not re.fullmatch('[a-f0-9]{64}', digest):
                raise Phase10Error('Invalid stored identifiers')
            result = []
            for folder, section, name in (('objects', 'original', digest + '.bin'), ('findings', 'normalized', identifier + '.jsonl')):
                expected = manifest[section]
                if expected['path'] != folder + '/' + name:
                    raise Phase10Error('Invalid stored object reference')
                if section == 'original' and expected['sha256'] != digest:
                    raise Phase10Error('Original digest does not match provenance')
                directory = _child(root, folder)
                try:
                    raw = _read(directory, name)
                finally:
                    os.close(directory)
                if len(raw) != expected['bytes'] or hashlib.sha256(raw).hexdigest() != expected['sha256']:
                    raise Phase10Error('Stored object digest mismatch')
                if section == 'normalized':
                    result = parse_jsonl(raw, self.policy.max_records)
                    if len(result) != expected['records']:
                        raise Phase10Error('Stored record count mismatch')
                    context = self.policy.context(digest, manifest['imported_at'])
                    context['scope'] = manifest['scope']
                    for finding in result:
                        normalized = make_finding(manifest['plugin_id'], finding['source_record_id'], finding['indicator_type'], finding['indicator_value'], context,
                                                  relationship=finding['relationship'], assessment=finding['assessment'], confidence=finding['confidence'],
                                                  collected_at=finding['collected_at'], scope_status=finding['scope_status'], details=finding.get('details'))
                        if finding != normalized:
                            raise Phase10Error('Stored finding schema or provenance mismatch')
            return result
        except (KeyError, AttributeError, TypeError, OSError) as exc:
            raise Phase10Error('Invalid stored manifest or object') from exc

    def _usage(self, root):
        total = count = 0
        try:
            audit = os.stat('audit.jsonl', dir_fd=root, follow_symlinks=False)
            if not stat.S_ISREG(audit.st_mode) or audit.st_nlink != 1:
                raise Phase10Error('Unsupported integration audit log')
            total += audit.st_size
        except FileNotFoundError:
            pass
        for folder in ('objects', 'findings', 'imports'):
            try:
                directory = _child(root, folder)
            except FileNotFoundError:
                continue
            try:
                names = os.listdir(directory)
                if len(names) > MAX_IMPORTS:
                    raise Phase10Error('Integration inventory quota exceeded')
                if folder == 'imports':
                    count = len(names)
                for name in names:
                    info = os.stat(name, dir_fd=directory, follow_symlinks=False)
                    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                        raise Phase10Error('Unsupported integration inventory entry')
                    total += info.st_size
            finally:
                os.close(directory)
        return total, count

    def save(self, plugin_id, format_name, raw, findings, imported_at):
        spec = self.policy.require(plugin_id)
        if format_name not in spec.input_formats or not isinstance(raw, bytes) or len(raw) > self.policy.max_bytes:
            raise Phase10Error('Unsupported format or input size')
        if not isinstance(findings, list) or len(findings) > self.policy.max_records:
            raise Phase10Error('Finding quota exceeded')
        digest = hashlib.sha256(raw).hexdigest()
        imported_at = timestamp(imported_at)
        context = self.policy.context(digest, imported_at)
        rows, seen = [], set()
        for finding in findings:
            try:
                normalized = make_finding(plugin_id, finding['source_record_id'], finding['indicator_type'], finding['indicator_value'], context,
                                          relationship=finding['relationship'], assessment=finding['assessment'],
                                          confidence=finding['confidence'], collected_at=finding['collected_at'],
                                          scope_status=finding['scope_status'], details=finding.get('details'))
                if finding != normalized:
                    raise Phase10Error('Finding schema or provenance mismatch')
                if normalized['finding_id'] not in seen:
                    seen.add(normalized['finding_id'])
                    rows.append(normalized)
            except (KeyError, TypeError) as exc:
                raise Phase10Error('Invalid normalized finding') from exc
        projection = b''.join(_json(row) for row in rows)
        if len(projection) > MAX_BYTES:
            raise Phase10Error('Normalized output byte limit exceeded')
        identifier = hashlib.sha256(_json([plugin_id, spec.version, format_name, digest])).hexdigest()
        manifest = {'schema_version': 1, 'import_id': identifier, 'plugin_id': plugin_id,
                    'plugin_version': spec.version, 'format': format_name, 'imported_at': imported_at,
                    'scope': list(self.policy.scope),
                    'raw_source_hash': 'sha256:' + digest,
                    'original': {'path': 'objects/' + digest + '.bin', 'sha256': digest, 'bytes': len(raw)},
                    'normalized': {'path': 'findings/' + identifier + '.jsonl', 'sha256': hashlib.sha256(projection).hexdigest(), 'bytes': len(projection), 'records': len(rows)},
                    'retention_days': self.policy.retention_days,
                    'eligible_after': (dt.datetime.fromisoformat(imported_at.replace('Z', '+00:00')) + dt.timedelta(days=self.policy.retention_days)).isoformat().replace('+00:00', 'Z')}
        encoded = _json(manifest)
        audit_line = _json({'action': 'import', 'import_id': identifier, 'plugin_id': plugin_id,
                           'records': len(rows), 'bytes': len(raw), 'timestamp': imported_at})
        with self._open(create=True) as root:
            for old in self._manifests(root):
                if old['import_id'] == identifier:
                    self._verify(root, old)
                    get_log('store').event('store.deduplicated', plugin=plugin_id,
                                           import_id=identifier, records=len(rows), deduplicated=True)
                    return {**old, 'deduplicated': True}
            total, count = self._usage(root)
            if count >= MAX_IMPORTS or total + len(raw) + len(projection) + len(encoded) + len(audit_line) > MAX_STORE_BYTES:
                raise Phase10Error('Integration store quota exceeded')
            original = _child(root, 'objects', create=True)
            try:
                _write_once(original, digest + '.bin', raw)
            finally:
                os.close(original)
            projected = _child(root, 'findings', create=True)
            created = False
            try:
                created = _write_once(projected, identifier + '.jsonl', projection)
                directory = _child(root, 'imports', create=True)
                try:
                    _write_once(directory, identifier + '.json', encoded)
                finally:
                    os.close(directory)
            except BaseException:
                if created:
                    # A later retry has a new import time. Remove only this
                    # uncommitted projection; originals and prior files survive.
                    os.unlink(identifier + '.jsonl', dir_fd=projected)
                    os.fsync(projected)
                raise
            finally:
                os.close(projected)
            # The manifest commits the import; audit failure cannot roll it back.
            audit = os.open('audit.jsonl', os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, 0o600, dir_fd=root)
            try:
                info = os.fstat(audit)
                if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_mode & 0o077 or info.st_size > 1024 * 1024:
                    raise Phase10Error('Unsupported integration audit log')
                if info.st_size + len(audit_line) > 1024 * 1024:
                    raise Phase10Error('Integration audit byte quota exceeded')
                if os.write(audit, audit_line) != len(audit_line):
                    raise Phase10Error('Short integration audit write')
                os.fsync(audit)
            finally:
                os.close(audit)
            os.fsync(root)
        get_log('store').event('store.committed', plugin=plugin_id, import_id=identifier,
                               records=len(rows), bytes=len(raw), deduplicated=False)
        return {**manifest, 'deduplicated': False}

    def manifests(self):
        if not self.policy.enabled:
            return []
        try:
            with self._open() as root:
                return self._manifests(root)
        except FileNotFoundError:
            return []

    def read_import(self, import_id):
        """Verify one committed import without exporting unrelated evidence."""
        if not isinstance(import_id, str) or not re.fullmatch('[a-f0-9]{64}', import_id):
            raise Phase10Error('Invalid import identifier')
        if not self.policy.enabled:
            raise Phase10Error('Phase 10 integrations are disabled')
        try:
            with self._open() as root:
                directory = _child(root, 'imports')
                try:
                    manifest = parse_json(_read(directory, import_id + '.json', 1024 * 1024))
                finally:
                    os.close(directory)
                if not isinstance(manifest, dict) or manifest.get('import_id') != import_id:
                    raise Phase10Error('Invalid import manifest')
                if not isinstance(manifest.get('plugin_id'), str):
                    raise Phase10Error('Invalid stored integration')
                self.policy.require(manifest.get('plugin_id'))
                return {'manifest': manifest, 'findings': self._verify(root, manifest)}
        except FileNotFoundError as exc:
            raise Phase10Error('Import is unavailable') from exc

    def export(self):
        if not self.policy.enabled:
            return []
        try:
            with self._open() as root:
                rows, total = [], 0
                for manifest in self._manifests(root):
                    if manifest.get('plugin_id') in self.policy.plugins:
                        total += manifest['normalized']['bytes']
                        if total > MAX_BYTES or len(rows) + manifest['normalized']['records'] > self.policy.max_records:
                            raise Phase10Error('Export quota exceeded; select a narrower store')
                        rows.extend(self._verify(root, manifest))
                get_log('store').event('store.exported', records=len(rows), bytes=total)
                return rows
        except FileNotFoundError:
            return []
