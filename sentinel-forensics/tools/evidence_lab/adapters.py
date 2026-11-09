from contextlib import closing
"""Declared passive Tetra/BLE schemas and inspected Pineapple recon SQLite subset."""
import csv
import hashlib
import io
import math
import os
from pathlib import Path
import re
import shutil
import sqlite3
from core import (IngestError, MAX_RECORD, canonical, strict_json, time_info,
                  source_file, hash_file)

TETRA = 'evidence-lab.tetra/1'
BLE = 'evidence-lab.ble/1'
BLE_ARD_PARALLEL = 'ble-ard.parallel-csv/1'
BLE_ARD_PARALLEL_HEADER = ('Timestamp', 'DeviceName', 'AdvertisingType',
                         'AddressType', 'Address', 'RSSI', 'Channel')
MAC = re.compile(r'(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}')
INTEGER_TEXT = re.compile(r'[+-]?[0-9]+')
UNSIGNED_TEXT = re.compile(r'[0-9]+')
SIGNAL_TEXT = re.compile(r'[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?')
MAX_ROWS = 10_000_000
MAX_SQLITE = 512 * 1024**2
csv.field_size_limit(MAX_RECORD)


def address(value):
    if value in (None, ''): return None
    if not isinstance(value, str) or not MAC.fullmatch(value): raise IngestError('invalid_mac')
    return value.lower()


def scalar(value, name, *, numeric=False, allow_fraction=False):
    if value in (None, ''): return None
    if numeric:
        if type(value) is int or allow_fraction and type(value) is float:
            number = value
        elif isinstance(value, str):
            token = value.strip()
            try:
                if INTEGER_TEXT.fullmatch(token): number = int(token)
                elif allow_fraction and SIGNAL_TEXT.fullmatch(token):
                    number = float(token)
                    if number == 0 and any(c in '123456789' for c in token.lower().split('e', 1)[0]):
                        raise IngestError('invalid_'+name)
                else: raise IngestError('invalid_'+name)
            except (ValueError, OverflowError): raise IngestError('invalid_'+name) from None
        else: raise IngestError('invalid_'+name)
        if type(number) is float and not math.isfinite(number): raise IngestError('invalid_'+name)
        if not -(2**31) <= number < 2**31: raise IngestError('invalid_'+name)
        return number
    if not isinstance(value, str) or len(value) > 4096: raise IngestError('invalid_'+name)
    return value


def normalize(obj):
    if not isinstance(obj, dict): raise IngestError('adapter_record_not_object')
    schema = obj.get('schema')
    if schema not in (TETRA, BLE): raise IngestError('unsupported_radio_schema')
    allowed = {'schema','timestamp','clock_source'} | (
        {'kind','ssid','security','scanner','bssid','client_mac','channel','frequency','rssi'} if schema==TETRA else
        {'address','address_type','name','scanner','manufacturer_id','manufacturer_data','service_data','first_seen','last_seen','rssi','tx_power','service_uuids'})
    if set(obj)-allowed: raise IngestError('unsupported_radio_fields')
    when = time_info(obj.get('timestamp'), clock=scalar(obj.get('clock_source'), 'clock_source') or 'scanner_unverified')
    if schema == TETRA:
        kind = obj.get('kind', 'ap')
        if kind not in ('ap', 'client', 'probe', 'association', 'disassociation'): raise IngestError('unsupported_tetra_event')
        data = {key: scalar(obj.get(key), key) for key in ('ssid', 'security', 'scanner')}
        data.update({key: address(obj.get(key)) for key in ('bssid', 'client_mac')})
        data.update({key: scalar(obj.get(key), key, numeric=True) for key in ('channel', 'frequency')})
        data['rssi'] = scalar(obj.get('rssi'), 'rssi', numeric=True, allow_fraction=True)
        if not data['bssid'] and not data['client_mac']: raise IngestError('tetra_identifiers_missing')
        data['association_semantics'] = 'explicit_export_event' if kind in ('association','disassociation') else 'observed_record_only'
        return 'wifi.'+kind, data, when
    data = {key: scalar(obj.get(key), key) for key in ('name','scanner','manufacturer_data','service_data','first_seen','last_seen')}
    data['address'] = address(obj.get('address'))
    if not data['address']: raise IngestError('ble_address_missing')
    typ = obj.get('address_type') or 'unknown'
    if typ not in ('public','random','random_static','random_resolvable','random_nonresolvable','unknown'):
        raise IngestError('unsupported_ble_address_type')
    data['address_type'] = typ
    for key in ('rssi','tx_power','manufacturer_id'):
        data[key] = scalar(obj.get(key), key, numeric=True, allow_fraction=key != 'manufacturer_id')
    uuids = obj.get('service_uuids') or []
    if isinstance(uuids, str): uuids = uuids.split(';')
    if not isinstance(uuids, list) or len(uuids) > 128: raise IngestError('ble_uuid_budget')
    data['service_uuids'] = [scalar(v, 'service_uuid') for v in uuids]
    for key in ('manufacturer_data','service_data'):
        value = data[key]
        if value is not None and (len(value) % 2 or not re.fullmatch('[0-9a-fA-F]*', value)):
            raise IngestError('invalid_ble_hex_data')
    data['first_seen_time'] = time_info(data['first_seen'],clock='scanner_unverified')
    data['last_seen_time'] = time_info(data['last_seen'],clock='scanner_unverified')
    data['identity_limit'] = 'advertised_identifier_only_no_physical_device_inference'
    return 'ble.advertisement', data, when


def normalize_ble_ard_parallel(obj):
    """Interpret only the inspected raw parallel CSV layout, never its origin.

    The older published export does not establish an epoch, time unit or a
    revision-specific meaning for numeric type/channel codes. Preserve these
    facts without applying assumptions from newer collector implementations.
    """
    if not isinstance(obj, dict) or set(obj) != set(BLE_ARD_PARALLEL_HEADER):
        raise IngestError('unsupported_ble_ard_fields')
    timestamp = obj['Timestamp']
    if not isinstance(timestamp, str) or not 1 <= len(timestamp) <= 128 or not UNSIGNED_TEXT.fullmatch(timestamp):
        raise IngestError('invalid_ble_ard_timestamp')
    codes = {}
    for column, field in (('AddressType', 'address_type_code_uninterpreted'),
                          ('AdvertisingType', 'advertising_type_code_uninterpreted'),
                          ('Channel', 'channel_code_uninterpreted')):
        token = obj[column]
        if not isinstance(token, str) or not UNSIGNED_TEXT.fullmatch(token):
            raise IngestError('invalid_ble_ard_'+column.lower())
        codes[field] = scalar(token, 'ble_ard_'+column.lower(), numeric=True)
    rssi = scalar(obj['RSSI'], 'ble_ard_rssi', numeric=True)
    if rssi is None: raise IngestError('invalid_ble_ard_rssi')
    kind, data, when = normalize({'schema': BLE, 'timestamp': timestamp,
        'address': obj['Address'], 'address_type': 'unknown',
        'name': obj['DeviceName'], 'rssi': rssi})
    data.update(codes, source_profile=BLE_ARD_PARALLEL,
        timestamp_semantics='numeric_epoch_and_unit_unverified',
        source_fields_unavailable=['service_uuids', 'manufacturer_id',
            'manufacturer_data', 'service_data', 'tx_power', 'scanner'])
    return kind, data, when


def json_rows(reader, full=False):
    if full:
        raw = reader.read(MAX_RECORD + 1)
        try:
            obj = strict_json(raw)
            if not isinstance(obj, dict) or not isinstance(obj.get('observations'), list): raise IngestError('radio_envelope_required')
            schema = obj.get('schema')
            if schema not in (TETRA, BLE): raise IngestError('unsupported_radio_schema')
        except (ValueError, UnicodeError, IngestError) as exc:
            # A bounded JSON envelope is one framed source record. Its invalid
            # rows cannot be recovered independently, but other sources can.
            # Finish hashing oversized sources without buffering their content.
            for _ in iter(lambda: reader.read(MAX_RECORD), b''): pass
            loc = {'byte_offset':0,'byte_length':reader.offset,'precision':'byte'}
            yield 1, loc, None, reader.sha.hexdigest(), str(exc) if isinstance(exc, IngestError) else 'malformed_json'
            return
        for index, row in enumerate(obj['observations'], 1):
            value = dict(row) if isinstance(row, dict) else None
            if value is not None: value.setdefault('schema', schema)
            yield index, {'json_pointer': '/observations/'+str(index-1), 'precision': 'logical'}, value, hashlib.sha256(canonical(row)).hexdigest(), None
        return
    number = 0
    while True:
        off = reader.offset
        raw = reader.line()
        if not raw: return
        number += 1
        digest = hashlib.sha256(raw)
        length = len(raw)
        oversized = length > MAX_RECORD
        while not raw.endswith(b'\n'):
            raw = reader.line()
            if not raw: break
            oversized = True; digest.update(raw); length += len(raw)
        loc = {'byte_offset': off, 'byte_length': length, 'line': number, 'precision': 'byte'}
        if oversized:
            yield number, loc, None, digest.hexdigest(), 'record_budget_exceeded'
            continue
        # The original single bounded line is needed, without buffering other lines.
        # Recover via the read-only stream; restore position so the digest stays one-pass.
        pos = reader.stream.tell(); reader.stream.seek(off)
        original = reader.stream.read(length); reader.stream.seek(pos)
        try: obj = strict_json(original)
        except (ValueError, UnicodeError, IngestError) as exc:
            yield number, loc, None, digest.hexdigest(), str(exc) if isinstance(exc, IngestError) else 'malformed_json'
        else: yield number, loc, obj, digest.hexdigest(), None


class CSVLines:
    def __init__(self, reader): self.reader, self.total, self.digest, self.line_no = reader, 0, hashlib.sha256(), 0
    def __iter__(self): return self
    def __next__(self):
        raw = self.reader.line()
        if not raw: raise StopIteration
        self.total += len(raw); self.line_no += 1
        if self.total > MAX_RECORD: raise IngestError('csv_record_budget')
        self.digest.update(raw)
        return raw.decode('utf-8')
    def reset(self): self.total, self.digest = 0, hashlib.sha256()


def csv_rows(reader, metadata=None):
    lines = CSVLines(reader)
    rows = csv.reader(lines, strict=True)
    try: header = next(rows)
    except (StopIteration, csv.Error): raise IngestError('csv_header_required') from None
    native_parallel = tuple(header) == BLE_ARD_PARALLEL_HEADER
    if len(header) > 64 or len(set(header)) != len(header) or not native_parallel and 'schema' not in header:
        raise IngestError('unsupported_csv_schema')
    if native_parallel and metadata is not None:
        metadata.update(adapter_profile=BLE_ARD_PARALLEL,
            detection='exact_ordered_header_signature', source_origin='unverified',
            compatibility='recognized_native_layout',
            timestamp_semantics='numeric_epoch_and_unit_unverified',
            type_code_semantics='uninterpreted',
            unavailable_fields=['service_uuids', 'manufacturer_id',
                'manufacturer_data', 'service_data', 'tx_power', 'scanner'])
    ordinal = 0
    while True:
        lines.reset(); off = reader.offset; first = lines.line_no+1
        try: row = next(rows)
        except StopIteration: return
        except (csv.Error, UnicodeError): raise IngestError('malformed_csv') from None
        ordinal += 1
        loc = {'byte_offset': off, 'byte_length': lines.total, 'line': first, 'last_line': lines.line_no, 'precision': 'byte'}
        yield ordinal, loc, dict(zip(header, row)), lines.digest.hexdigest(), None if len(row) == len(header) else 'csv_column_count'


def sqlite_snapshot(path, stream, output, source_id):
    """Copy a stable closed DB; never let SQLite touch the source or its sidecars."""
    sidecars = {}
    for suffix in ('-wal','-shm','-journal'):
        p = Path(str(path)+suffix)
        if p.exists() or p.is_symlink():
            with source_file(p) as (f, st):
                h = hashlib.sha256()
                for chunk in iter(lambda: f.read(MAX_RECORD), b''): h.update(chunk)
                sidecars[suffix] = {'sha256': h.hexdigest(), 'size': st.st_size}
    if sidecars:
        return None, {'compatibility': 'BLOCKED_EXTERNAL', 'error': 'sqlite_sidecars_require_consistent_closed_snapshot',
                      'sidecars': sidecars, 'limitation': 'Base-only ingestion may omit committed WAL data; source was not checkpointed or repaired.'}
    size = os.fstat(stream.fileno()).st_size
    if size > MAX_SQLITE: raise IngestError('sqlite_snapshot_budget')
    if shutil.disk_usage(output).free < size + 64*1024**2: raise IngestError('sqlite_snapshot_space')
    dest = output / f'sqlite-snapshot-{source_id}'
    fd = os.open(dest, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    stream.seek(0)
    with os.fdopen(fd, 'wb') as f: shutil.copyfileobj(stream, f, MAX_RECORD)
    return dest, {'sidecars': {}, 'source_schema': 'inspected_pineapple_recon_subset/1'}


def sqlite_rows(snapshot, metadata):
    uri = snapshot.resolve().as_uri()+'?mode=ro&immutable=1'
    with closing(sqlite3.connect(uri, uri=True)) as db:
        db.execute('PRAGMA query_only=ON')
        if hasattr(db, 'enable_load_extension'):
            db.enable_load_extension(False)
        db.setlimit(sqlite3.SQLITE_LIMIT_LENGTH, MAX_RECORD)
        db.execute('PRAGMA cache_size=-4096')
        version = db.execute('PRAGMA user_version').fetchone()[0]
        schema = db.execute("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name LIMIT 129").fetchall()
        if len(schema)>128 or any(len(n)>128 for n,_ in schema): raise IngestError('sqlite_schema_budget')
        metadata.update(user_version=version, schema_sha256=hashlib.sha256(canonical(schema)).hexdigest(),
                        tables=[x[0] for x in schema], compatibility='supported_subset')
        expected = {'aps': {'id','scan_id','ssid','bssid','encryption','hidden','channel','signal','wps','last_seen'},
                    'clients': {'id','scan_id','mac','bssid','last_seen'}}
        if version != 0: raise IngestError('unsupported_tetra_sqlite_version')
        # Views, virtual tables, and source-defined SQL are never executed as adapters.
        for table, required in expected.items():
            definition = next((sql for name,sql in schema if name == table), '') or ''
            if 'VIRTUAL' in definition.upper() or not definition.upper().startswith('CREATE TABLE'):
                raise IngestError('unsupported_tetra_sqlite_schema')
            columns = {r[1] for r in db.execute(f'PRAGMA table_info({table})')}
            if columns & {'rowid','_rowid_','oid'} or len(columns)>64: raise IngestError('unsupported_sqlite_row_identity_or_columns')
            metadata.setdefault('uninterpreted_columns',{})[table]=sorted(columns-required)
            if not required <= columns: raise IngestError('unsupported_tetra_sqlite_schema')
        ordinal = 0
        metadata['unsupported_tables'] = [n for n,_ in schema if n not in expected]
        for table, query in (
            ('aps','SELECT rowid,id,scan_id,ssid,bssid,encryption,hidden,channel,signal,wps,last_seen FROM aps ORDER BY rowid'),
            ('clients','SELECT rowid,id,scan_id,mac,bssid,last_seen FROM clients ORDER BY rowid')):
            cursor = db.execute(query)
            for row in cursor:
                if any(type(value) not in (type(None),bool,int,float,str) or
                       type(value) is float and not math.isfinite(value) for value in row):
                    # SQLite permits BLOBs/nonfinite REALs in declared columns.
                    # They have no canonical JSON logical-record hash under this
                    # adapter; never invent one or pass them to serialization.
                    metadata.update(partial_source=True,
                        stopped_at={'table':table,'rowid':row[0]},
                        unexamined_rows='The unsupported row and subsequent rows in adapter order were not interpreted.')
                    raise IngestError('unsupported_sqlite_record_value')
                ordinal += 1
                if ordinal > MAX_ROWS: raise IngestError('adapter_row_budget')
                rowid, ident, scanid = row[:3]
                if table == 'aps':
                    obj = {'schema': TETRA,'kind':'ap','ssid':row[3],'bssid':row[4], 'channel':row[7],
                           'rssi':row[8],'timestamp':row[10]}
                    extra = {'encryption_code_uninterpreted':row[5], 'hidden':row[6], 'wps':row[9]}
                else:
                    # A recon client row is an observed mapping; it does not establish an association event.
                    obj = {'schema': TETRA,'kind':'client','client_mac':row[3],'bssid':row[4],'timestamp':row[5]}
                    extra = {}
                obj['scanner'] = 'scan:'+str(scanid)
                loc = {'table':table,'rowid':rowid,'id':ident,'scan_id':scanid,'precision':'logical'}
                yield ordinal, loc, obj, hashlib.sha256(canonical(row)).hexdigest(), extra
