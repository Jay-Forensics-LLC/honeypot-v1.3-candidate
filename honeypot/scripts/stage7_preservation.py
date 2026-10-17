"""Bounded read-only restart custody. Historical recovery never replaces original bytes."""
from collections import Counter
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import stat

import stage7_recovery_check as review
from hp_common import runtime_path, utc

LOG_BUDGET = 512 * 1024**2
CUSTODY_BUDGET = 512 * 1024**2
FILE_COUNT = 20000
STATE_LIMIT = 16 * 1024**2


def regular(path):
    path = Path(path)
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or path.resolve() != path.absolute():
        raise ValueError('Nonregular or noncanonical preservation path: ' + str(path))
    return info


def stable_bytes(path, limit):
    before = regular(path)
    if before.st_size > limit:
        raise ValueError('Preservation file exceeds finite limit: ' + str(path))
    return review.read_evidence(Path(path), before)


def prefix(path, length=None, identity=None, fixed=False):
    """Hash only an acquired prefix; growth is allowed, replacement/truncation is not."""
    path = Path(path)
    before = regular(path)
    length = before.st_size if length is None else length
    ident = [before.st_dev, before.st_ino]
    if length < 0 or before.st_size < length or (identity is not None and ident != identity):
        raise ValueError('Preserved identity/prefix lost: ' + str(path))
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        opened = os.fstat(fd)
        if [opened.st_dev, opened.st_ino] != ident or opened.st_size < length:
            raise ValueError('Preservation file changed before hashing')
        digest = hashlib.sha256()
        offset = 0
        while offset < length:
            block = os.pread(fd, min(1024**2, length - offset), offset)
            if not block:
                raise ValueError('Preservation file truncated while hashing')
            digest.update(block)
            offset += len(block)
        after = os.fstat(fd)
        current = regular(path)
        if fixed and any((s.st_size, s.st_mtime_ns) != (before.st_size, before.st_mtime_ns)
                         for s in (opened, after, current)):
            raise ValueError('Fixed custody file changed during hashing')
        if ([after.st_dev, after.st_ino] != ident or
                [current.st_dev, current.st_ino] != ident or
                min(after.st_size, current.st_size) < length):
            raise ValueError('Preservation file rotated/replaced during hashing')
        # Fixed-size files must be stable; active append-only streams may grow.
        if (after.st_size == length and
                (opened.st_size, opened.st_mtime_ns) != (after.st_size, after.st_mtime_ns)):
            raise ValueError('Preservation file rewritten during hashing')
        return {'path': str(path), 'bytes': length, 'identity': ident,
                'sha256': digest.hexdigest(), 'acquired_utc': utc(),
                'scope': 'Finite prefix; concurrent later append bytes excluded'}
    finally:
        os.close(fd)


def tree_files(folder):
    """Propagate unreadable branches instead of silently omitting them with glob."""
    folder = Path(folder)
    if folder.resolve() != folder.absolute() or not stat.S_ISDIR(folder.lstat().st_mode):
        raise ValueError('Noncanonical preservation directory')
    result = []
    pending = [(folder, 0)]
    entries = 0
    while pending:
        directory, depth = pending.pop()
        if depth > 12:
            raise ValueError('Preservation directory depth exceeds bound')
        for path in directory.iterdir():
            entries += 1
            if entries > FILE_COUNT:
                raise ValueError('Preservation inventory exceeds finite count')
            mode = path.lstat().st_mode
            if stat.S_ISDIR(mode):
                pending.append((path, depth + 1))
            elif stat.S_ISREG(mode):
                result.append(path)
            else:
                raise ValueError('Symlink/special preservation file requires review: ' + str(path))
    return sorted(result)


def offset_path(root, source):
    if source.startswith('logs/') and '..' not in Path(source).parts:
        return root / source
    if source == 'trusted/boundary.jsonl':
        return root / 'state/trusted/boundary.jsonl'
    artifacts = runtime_path('ARTIFACT_PATH', 'artifacts', root)
    if source in (str(artifacts / 'sha256-manifest.jsonl'), '/hp/artifacts/sha256-manifest.jsonl'):
        return artifacts / 'sha256-manifest.jsonl'
    raise ValueError('Unreviewed ingestion source: ' + source)


def snapshot(root, progress=None):
    root = Path(root)
    progress = {} if progress is None else progress
    progress.update(status='INCOMPLETE', acquired_utc=utc(), custody_bytes_read=0)
    incidents = {}
    custody_remaining = CUSTODY_BUDGET

    def incident(path, data, metadata, analysis, known, reconciliation):
        nonlocal custody_remaining
        directory = path.parent
        doc = json.loads(metadata)
        metadata_values(doc)
        custody_data = stable_bytes(directory / 'metadata.json', review.EVIDENCE_METADATA_LIMIT)
        custody_remaining -= len(custody_data)
        if custody_remaining < 0:
            raise ValueError('Custody aggregate allowance exceeded')
        copies = json.loads(custody_data)['copies']
        if not isinstance(copies, list) or len(copies) > 128:
            raise ValueError('Invalid/oversized custody records')
        retained = []
        for copy in copies:
            destination = copy['destination']
            if not isinstance(destination, str) or Path(destination).name != destination or destination in ('.', '..'):
                raise ValueError('Unsafe custody destination')
            candidates = [directory / kind / destination for kind in ('pcap', 'artifacts')]
            found = [p for p in candidates if p.exists()]
            if len(found) != 1 or copy.get('verified_stable') is not True:
                raise ValueError('Missing/ambiguous/unverified custody copy')
            info = regular(found[0])
            custody_remaining -= info.st_size
            if info.st_size > 350 * 1024**2 or custody_remaining < 0:
                raise ValueError('Custody aggregate/per-file allowance exceeded')
            acquired = prefix(found[0], fixed=True)
            if acquired['sha256'] != copy['sha256'] or acquired['bytes'] != copy['size']:
                raise ValueError('Custody hash/size differs from manifest')
            retained.append({'record': copy, 'artifact': acquired})
        progress['custody_bytes_read'] = CUSTODY_BUDGET - custody_remaining
        ids = ([r['event_id'] for r in reconciliation['records']] if known else analysis['event_ids'])
        incidents[str(directory)] = {
            'incident_id': doc['incident_id'], 'metadata_event_ids': doc['related_events'],
            'event_counts': dict(Counter(ids)), 'events_bytes': len(data),
            'events_prefix_sha256': analysis['sha256'],
            'metadata_sha256_at_acquisition': hashlib.sha256(metadata).hexdigest(),
            'metadata_at_acquisition': doc,
            'custody': retained, 'historical_original': known,
            'record_scope': 'Derived reconciled IDs; original bytes stay damaged' if known else 'Original clean records',
        }

    sweep = review.evidence_integrity(root, progress.setdefault('sweep', {}), on_incident=incident)
    state = json.loads(stable_bytes(root / 'state/incidentd/state.json', STATE_LIMIT))
    logs = {}
    paths = tree_files(root / 'logs')
    for source in state['offsets']:
        path = offset_path(root, source)
        if path not in paths:
            paths.append(path)
    total = sum(regular(path).st_size for path in paths)
    progress['logs_planned_bytes'] = total
    if total > LOG_BUDGET:
        raise ValueError('Log preservation aggregate allowance exceeded')
    for path in paths:
        logs[str(path)] = prefix(path)
    for source, offset in state['offsets'].items():
        p = offset_path(root, source)
        current = logs[str(p)]
        identity = ':'.join(str(v) for v in current['identity'])
        if offset['inode'] != identity or not isinstance(offset['offset'], int) or not 0 <= offset['offset'] <= current['bytes']:
            raise ValueError('Ingestion checkpoint does not match current source identity/length')
    progress['status'] = 'PASS'
    return {'status': 'PASS', 'sweep': sweep, 'incidents': incidents, 'logs': logs,
            'ingestion_state_at_acquisition': state, 'offsets': state['offsets'],
            'heartbeat_mtime_ns': regular(root / 'state/incidentd/heartbeat').st_mtime_ns,
            'custody_bytes_read': progress['custody_bytes_read'], 'logs_prefix_bytes': total,
            'bounds': {'logs': LOG_BUDGET, 'custody': CUSTODY_BUDGET, 'state': STATE_LIMIT}}


def metadata_values(metadata):
    """Validate mutable qualification fields before comparing their growth."""
    levels = {'LOW': 0, 'MEDIUM': 1, 'HIGH': 2, 'CRITICAL': 3}
    severity = metadata.get('severity')
    count, confidence = metadata.get('auth_attempt_count'), metadata.get('confidence')
    if (type(severity) is not str or severity not in levels or
            type(count) is not int or count < 0 or
            type(confidence) not in (int, float) or not 0 <= confidence <= 1 or
            not math.isfinite(confidence)):
        raise ValueError('Invalid incident metadata types or numeric values')
    stamps = []
    for name in ('timestamp_start', 'timestamp_end'):
        value = metadata.get(name)
        if type(value) is not str or len(value) > 128:
            raise ValueError('Invalid incident metadata timestamp')
        try:
            stamp = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
            if stamp.utcoffset() is None:
                raise ValueError('Timezone required')
            stamps.append(stamp.astimezone(dt.timezone.utc))
        except (ValueError, OverflowError) as exc:
            raise ValueError('Invalid incident metadata timestamp') from exc
    if stamps[1] < stamps[0]:
        raise ValueError('Incident metadata ends before it starts')
    return levels[severity], stamps[1], count, confidence


def compare(root, old, new):
    """Verify every retained prefix and ID; no sampling or historical-original replacement."""
    if old.get('status') != 'PASS' or new.get('status') != 'PASS':
        raise ValueError('Incomplete preservation acquisition')
    by_identity = {tuple(v['identity']): Path(path) for path, v in new['logs'].items()}
    for path, before in old['logs'].items():
        current = by_identity.get(tuple(before['identity']))
        if current is None:
            raise ValueError('Preserved log inode absent: ' + path)
        if prefix(current, before['bytes'], before['identity'])['sha256'] != before['sha256']:
            raise ValueError('Preserved log prefix changed: ' + path)
    for path, before in old['incidents'].items():
        after = new['incidents'].get(path)
        if after is None or after['incident_id'] != before['incident_id']:
            raise ValueError('Incident history lost')
        if before['metadata_event_ids'] == after['metadata_event_ids']:
            if before['metadata_sha256_at_acquisition'] != after['metadata_sha256_at_acquisition']:
                raise ValueError('Incident metadata changed without new events')
        else:
            old_meta = before.get('metadata_at_acquisition')
            new_meta = after.get('metadata_at_acquisition')
            if not isinstance(old_meta,dict) or not isinstance(new_meta,dict):
                raise ValueError('Metadata growth requires complete acquired metadata')
            for field in ('incident_id','source_ip','timestamp_start'):
                if old_meta.get(field) != new_meta.get(field): raise ValueError('Incident metadata identity changed')
            old_values, new_values = metadata_values(old_meta), metadata_values(new_meta)
            if any(after < before for before, after in zip(old_values, new_values)):
                raise ValueError('Incident metadata regressed during growth')
            for field,value in old_meta.items():
                if isinstance(value,list):
                    if not isinstance(new_meta.get(field), list):
                        raise ValueError('Invalid incident metadata list: '+field)
                    # Existing metadata values and evidence paths must remain in order.
                    remaining=iter(new_meta.get(field,[]))
                    if not all(any(candidate==entry for candidate in remaining) for entry in value):
                        raise ValueError('Incident metadata values lost during growth: '+field)
                elif field not in ('severity','timestamp_end','auth_attempt_count','confidence'):
                    if new_meta.get(field)!=value: raise ValueError('Incident metadata field changed: '+field)
        if not set(before['metadata_event_ids']) <= set(after['metadata_event_ids']):
            raise ValueError('Incident metadata IDs lost')
        if prefix(Path(path) / 'events.jsonl', before['events_bytes'])['sha256'] != before['events_prefix_sha256']:
            raise ValueError('Incident evidence prefix changed')
        for event_id, count in before['event_counts'].items():
            if after['event_counts'].get(event_id) != count:
                raise ValueError('Existing event lost or duplicated')
        for copy in before['custody']:
            if not any(copy['record'] == candidate['record'] and
                       copy['artifact']['sha256'] == candidate['artifact']['sha256']
                       for candidate in after['custody']):
                raise ValueError('Custody record/copy lost or changed')
    rotations = []
    for source, before in old['offsets'].items():
        after = new['offsets'].get(source)
        if after is None:
            raise ValueError('Ingestion offset lost')
        if after['inode'] == before['inode']:
            if after['offset'] < before['offset']:
                raise ValueError('Ingestion offset regressed')
        else:
            identity = tuple(int(value) for value in before['inode'].split(':'))
            old_source = by_identity.get(identity)
            old_snapshot = next((value for value in new['logs'].values()
                                 if tuple(value['identity']) == identity), None)
            if old_source is None or old_snapshot is None or before['offset'] != old_snapshot['bytes']:
                raise ValueError('Rotation leaves unread old-source bytes; independent drain proof required')
            # Prefix preservation alone does not establish ingestion of an unread tail.
            rotations.append({'source': source, 'before': before, 'after': after})
    return {'status': 'PASS', 'logs_verified': len(old['logs']),
            'incidents_verified': len(old['incidents']), 'event_counts_deduplicated': True,
            'custody_hashes_verified': True, 'offsets_verified': True,
            'source_rotations': rotations, 'historical_original_unchanged': True}
