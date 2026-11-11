"""Closed, read-only case inputs for optional bounded TLS reconstruction.

Checksums establish consistency, not authenticity. A self-sealed index is never
trusted for packet selection until every original classic-PCAP occurrence has
been freshly decoded and reconciled. No decoder or network operation occurs here.
"""
from contextlib import ExitStack, contextmanager
import hashlib
import os
from pathlib import Path, PurePosixPath
import re
import sqlite3
import stat

from analyze import config_validate
from capture import classic
from core import IngestError, MAX_RECORD, Reader, canonical, fingerprint, source_file, strict_json
from network import decode

MAX_FILES = MAX_SOURCES = 4096
MAX_PACKETS = 2000000
MAX_METADATA = 1024 * 1024
HEX = re.compile(r'[0-9a-f]{64}')
MEMBERS = ('SHA256SUMS', 'manifest.json', 'state.json', 'index.sqlite', 'pseudonym.key')
PACKET_COLUMNS = ('id', 'source_id', 'ordinal', 'context', 'protocol', 'src', 'dst',
    'sport', 'dport', 'tcp_flags', 'captured_bytes', 'original_bytes', 'ip_bytes',
    'utc_ns', 'time_json', 'linktype', 'section', 'interface', 'packet_number',
    'block', 'losses', 'src_mac', 'dst_mac', 'vlan', 'a', 'b', 'direction')
RECORD_COLUMNS = ('source_id', 'ordinal', 'offset', 'length', 'sha256', 'timestamp',
                  'kind', 'protocol', 'captured_bytes', 'status')


def require(value, code):
    if not value:
        raise IngestError(code)


def validate_source_map(source_map):
    require(isinstance(source_map, dict) and 0 < len(source_map) <= MAX_SOURCES,
            'reconstruct_source_map_required')
    for ident, path in source_map.items():
        require(type(ident) is int and 1 <= ident <= MAX_SOURCES,
                'reconstruct_source_id_invalid')
        require(isinstance(path, (str, Path)) and 0 < len(str(path)) <= 4096,
                'reconstruct_source_path_invalid')


def hash_stream(stream, guard):
    stream.seek(0)
    digest = hashlib.sha256()
    for chunk in iter(lambda: stream.read(MAX_RECORD), b''):
        digest.update(chunk)
        guard()
    return digest.hexdigest()


def metadata(stream, guard):
    stream.seek(0)
    raw = stream.read(MAX_METADATA + 1)
    require(len(raw) <= MAX_METADATA, 'reconstruct_metadata_budget')
    guard()
    return raw


def checksum_entries(raw):
    require(len(raw) <= MAX_METADATA, 'reconstruct_checksum_budget')
    entries = {}
    try:
        lines = raw.decode('utf-8').splitlines()
        for line in lines:
            require(len(entries) < MAX_FILES and len(line) <= 4162,
                    'reconstruct_checksum_budget')
            parts = line.split('  ', 1)
            require(len(parts) == 2 and HEX.fullmatch(parts[0]),
                    'reconstruct_checksum_invalid')
            digest, name = parts
            path = PurePosixPath(name)
            require(name and len(name) <= 4096 and not path.is_absolute()
                    and path.as_posix() == name and '\\' not in name
                    and all(part not in ('', '.', '..') for part in name.split('/'))
                    and name not in entries and name != 'SHA256SUMS',
                    'reconstruct_checksum_path_invalid')
            entries[name] = digest
    except UnicodeError:
        raise IngestError('reconstruct_checksum_invalid') from None
    require(set(MEMBERS[1:]) <= set(entries), 'reconstruct_required_checksum_missing')
    return entries


def check_sidecars(case):
    for suffix in ('-wal', '-shm', '-journal'):
        require(not os.path.lexists(str(case / 'index.sqlite') + suffix),
                'reconstruct_case_sidecar_present')


def schema_check(db):
    tables = {'packet_meta': set(PACKET_COLUMNS), 'records': set(RECORD_COLUMNS),
              'sources': {'id', 'sha256', 'size', 'kind'},
              'source_details': {'source_id', 'parser_version', 'metadata'}}
    for name, columns in tables.items():
        rows = db.execute('SELECT type,sql FROM sqlite_master WHERE name=?', (name,)).fetchall()
        require(len(rows) == 1 and rows[0][0] == 'table'
                and isinstance(rows[0][1], str)
                and rows[0][1].lstrip().upper().startswith('CREATE TABLE '),
                'reconstruct_ordinary_case_table_required')
        actual = {row[1] for row in db.execute('PRAGMA table_info(' + name + ')')}
        require(actual == columns, 'reconstruct_case_schema_unsupported')


class BoundCase:
    def __init__(self, case, handles, manifest, state, db, sources, key, hashes, guard):
        self.case, self._handles, self.manifest, self.state = case, handles, manifest, state
        self.db, self.sources, self.pseudonym_key = db, sources, key
        self._hashes, self._guard, self._verified = hashes, guard, False
        self.binding = {'input_schema': manifest['schema'],
            'input_parser_version': manifest['parser_version'],
            'index_sha256': hashes['index.sqlite'],
            'manifest_sha256': hashes['manifest.json'],
            'sealed_members_sha256': {name: value for name, value in hashes.items()
                                      if name != 'pseudonym.key'},
            'input_configuration_sha256': hashlib.sha256(canonical(manifest['configuration'])).hexdigest(),
            'input_code_manifest_sha256': hashlib.sha256(canonical(manifest.get('tools', {}).get('code_sha256', {}))).hexdigest(),
            'case_verification_scope': 'Required sealed manifest/state/index/key plus checksum ledger; unrelated bundle files are not independently rehashed.',
            'source_authenticity': 'not_established', 'original_sources_reconciled': False}

    def _stable_path(self, path, stream, initial, code):
        try:
            require(Path(os.path.abspath(path)) == path.resolve() and not path.is_symlink(), code)
            named, opened = path.lstat(), os.fstat(stream.fileno())
            require(stat.S_ISREG(named.st_mode) and stat.S_ISREG(opened.st_mode)
                    and named.st_nlink == opened.st_nlink == 1
                    and fingerprint(named) == fingerprint(opened) == initial, code)
        except OSError:
            raise IngestError(code) from None

    def _fingerprints(self):
        check_sidecars(self.case)
        for name, (stream, initial) in self._handles.items():
            self._stable_path(self.case / name, stream, fingerprint(initial),
                              'reconstruct_case_input_changed')
        for source in self.sources.values():
            self._stable_path(source['path'], source['stream'], source['fingerprint'],
                              'reconstruct_original_source_changed')
        self._guard()

    def verify_after(self):
        self._fingerprints()
        for name, (stream, _) in self._handles.items():
            require(hash_stream(stream, self._guard) == self._hashes[name],
                    'reconstruct_case_after_hash_mismatch')
        for source in self.sources.values():
            require(hash_stream(source['stream'], self._guard) == source['sha256'],
                    'reconstruct_source_after_hash_mismatch')
        self._fingerprints()
        require(self.db.total_changes == 0, 'reconstruct_case_was_written')
        self._verified = True

    def reconcile_original_packets(self, packet_rows=MAX_PACKETS):
        """Reject a forged/resealed index by checking ALL original occurrences."""
        require(type(packet_rows) is int and 1 <= packet_rows <= MAX_PACKETS,
                'reconstruct_packet_budget_invalid')
        select = ','.join('p.' + name for name in PACKET_COLUMNS)
        select += ',' + ','.join('r.' + name + ' AS record_' + name for name in RECORD_COLUMNS)
        sql = ('SELECT ' + select + ' FROM packet_meta p LEFT JOIN records r '
               'ON r.source_id=p.source_id AND r.ordinal=p.ordinal ORDER BY p.id')
        plan = self.db.execute('EXPLAIN QUERY PLAN ' + sql).fetchall()
        require(not any('TEMP B-TREE' in row[3].upper() for row in plan),
                'reconstruct_index_sort_unsupported')
        indexed = iter(self.db.execute(sql))
        count = 0
        for sid, source in self.sources.items():
            stream = source['stream']
            stream.seek(0)
            reader = Reader(stream)
            source_count = 0
            for packet in classic(reader):
                self._guard()
                count += 1
                source_count += 1
                require(count <= packet_rows, 'reconstruct_packet_budget')
                row = next(indexed, None)
                require(row is not None, 'reconstruct_index_omits_original_packet')
                require(row['id'] == count and row['source_id'] == sid,
                        'reconstruct_index_packet_order_mismatch')
                require(tuple(row['record_' + name] for name in RECORD_COLUMNS)
                        == (sid, *packet.row()), 'reconstruct_record_differs_from_original')
                meta, _, losses = decode(packet)
                if packet.status:
                    losses.append(packet.status)
                if packet.time['status'] != 'normalized':
                    losses.append('timestamp_' + packet.time['status'])
                context = self.manifest['configuration'].get('contexts', {}).get(str(sid), 'source:' + str(sid))
                context += '/section:' + str(packet.section) + '/interface:' + str(packet.interface)
                context += '/vlan:' + ','.join(map(str, meta['vlan']))
                left = canonical([meta['src'], meta['sport']]).decode()
                right = canonical([meta['dst'], meta['dport']]).decode()
                a, b = sorted((left, right))
                expected = {'ordinal': packet.ordinal, 'context': context,
                    'protocol': meta['protocol'], 'captured_bytes': len(packet.payload),
                    'original_bytes': packet.original, 'utc_ns': packet.time['utc_ns'],
                    'linktype': packet.linktype, 'section': packet.section,
                    'interface': packet.interface, 'packet_number': packet.ordinal,
                    'block': packet.block, 'a': a, 'b': b, 'direction': int(left != a)}
                expected.update({name: meta[name] for name in ('src', 'dst', 'sport', 'dport',
                    'tcp_flags', 'ip_bytes', 'src_mac', 'dst_mac')})
                require(all(row[name] == value for name, value in expected.items()),
                        'reconstruct_index_metadata_differs_from_original')
                require(strict_json(row['time_json']) == packet.time
                        and strict_json(row['losses']) == losses
                        and strict_json(row['vlan']) == meta['vlan'],
                        'reconstruct_index_time_or_losses_differ_from_original')
            require(reader.offset == source['size'] and reader.sha.hexdigest() == source['sha256'],
                    'reconstruct_traversal_source_hash_mismatch')
            source['packet_count'] = source_count
            stream.seek(0)
        require(next(indexed, None) is None, 'reconstruct_index_has_extra_packet')
        require(self.db.execute('SELECT COUNT(*) FROM records').fetchone()[0] == count,
                'reconstruct_index_has_unmatched_record')
        self.binding.update(original_sources_reconciled=True,
                            reconciled_original_packet_count=count)
        self._fingerprints()


@contextmanager
def validated_case(case, source_map, guard=lambda: None, *, packet_rows=MAX_PACKETS):
    """Yield held read-only inputs; verify again on successful completion.

    Input-code pins remain the original case's provenance, separate from the
    executing reconstruction command. Explicit verify_after() can be followed
    immediately by context exit without repeating expensive source hashes.
    """
    validate_source_map(source_map)
    require(type(packet_rows) is int and 1 <= packet_rows <= MAX_PACKETS,
            'reconstruct_packet_budget_invalid')
    case = Path(os.path.abspath(case))
    require(case == case.resolve() and not case.is_symlink() and case.is_dir(),
            'reconstruct_case_path_invalid')
    with ExitStack() as stack:
        check_sidecars(case)
        handles = {name: stack.enter_context(source_file(case / name)) for name in MEMBERS}
        ledger = metadata(handles['SHA256SUMS'][0], guard)
        entries = checksum_entries(ledger)
        for name in entries:
            require((case / name).resolve().is_relative_to(case),
                    'reconstruct_checksum_path_invalid')
            guard()
        hashes = {'SHA256SUMS': hashlib.sha256(ledger).hexdigest()}
        bodies = {}
        for name in MEMBERS[1:]:
            stream = handles[name][0]
            if name == 'index.sqlite':
                digest = hash_stream(stream, guard)
            else:
                bodies[name] = metadata(stream, guard)
                digest = hashlib.sha256(bodies[name]).hexdigest()
            require(digest == entries[name], 'reconstruct_case_checksum_mismatch')
            hashes[name] = digest
        manifest, state = strict_json(bodies['manifest.json']), strict_json(bodies['state.json'])
        require(isinstance(manifest, dict) and isinstance(state, dict)
                and manifest.get('schema') == 'evidence-lab/2'
                and manifest.get('status') == state.get('status') == 'COMPLETE'
                and isinstance(manifest.get('parser_version'), str)
                and re.fullmatch(r'2\.[0-9]{1,3}\.[0-9]{1,3}', manifest['parser_version'])
                and isinstance(manifest.get('tools', {}), dict)
                and state.get('version') == manifest['parser_version'],
                'reconstruct_complete_case_required')
        config = config_validate(manifest.get('configuration'))
        sources = manifest.get('sources')
        require(isinstance(sources, list) and 0 < len(sources) <= MAX_SOURCES
                and set(source_map) == set(range(1, len(sources) + 1)),
                'reconstruct_all_source_occurrences_required')
        require(all(int(key) <= len(sources) for field in ('contexts', 'clock_adjustments')
                    for key in config.get(field, {})), 'reconstruct_configuration_source_invalid')
        expected_sources = []
        for sid, value in enumerate(sources, 1):
            require(isinstance(value, dict) and type(value.get('id')) is int and value['id'] == sid
                    and value.get('kind') == 'pcap', 'reconstruct_classic_sources_only')
            require(type(value.get('size')) is int and 24 <= value['size'] < 2**63
                    and isinstance(value.get('sha256'), str) and HEX.fullmatch(value['sha256']),
                    'reconstruct_source_metadata_invalid')
            expected_sources.append({name: value[name] for name in ('id', 'sha256', 'size', 'kind')})
        key = bodies['pseudonym.key']
        require(len(key) == 32, 'reconstruct_case_key_invalid')
        db = sqlite3.connect('file:/proc/self/fd/' + str(handles['index.sqlite'][0].fileno())
                             + '?mode=ro&immutable=1', uri=True)
        stack.callback(db.close)
        db.row_factory = sqlite3.Row
        db.enable_load_extension(False)
        db.execute('PRAGMA trusted_schema=OFF')
        db.execute('PRAGMA query_only=ON')
        db.execute('PRAGMA cache_size=-4096')
        db.execute('PRAGMA mmap_size=0')
        db.execute('PRAGMA temp_store=FILE')
        db.execute('PRAGMA automatic_index=OFF')
        db.setlimit(sqlite3.SQLITE_LIMIT_LENGTH, MAX_METADATA)
        db.setlimit(sqlite3.SQLITE_LIMIT_ATTACHED, 0)
        db.setlimit(sqlite3.SQLITE_LIMIT_COLUMN, 128)
        db.set_progress_handler(lambda: (guard() or 0), 10000)
        schema_check(db)
        actual_sources = [dict(row) for row in db.execute('SELECT id,sha256,size,kind FROM sources ORDER BY id LIMIT ?', (MAX_SOURCES + 1,))]
        require(actual_sources == expected_sources, 'reconstruct_case_sources_mismatch')
        details = [row[0] for row in db.execute('SELECT source_id FROM source_details ORDER BY source_id LIMIT ?', (MAX_SOURCES + 1,))]
        require(details == list(range(1, len(sources) + 1)),
                'reconstruct_source_details_mismatch')
        held = {}
        for sid, value in enumerate(sources, 1):
            path = Path(os.path.abspath(source_map[sid]))
            stream, initial = stack.enter_context(source_file(path))
            require(initial.st_size == value['size'] and hash_stream(stream, guard) == value['sha256'],
                    'reconstruct_source_before_hash_mismatch')
            held[sid] = {name: value[name] for name in ('id', 'sha256', 'size', 'kind')}
            held[sid].update(path=path, stream=stream, fingerprint=fingerprint(initial))
            stream.seek(0)
        bound = BoundCase(case, handles, manifest, state, db, held, key, hashes, guard)
        bound.reconcile_original_packets(packet_rows=packet_rows)
        yield bound
        if bound._verified:
            bound._fingerprints()
        else:
            bound.verify_after()
