"""Closed opt-in policy; offline imports do not authorize tool execution."""
from dataclasses import asdict, dataclass, fields
import json
from pathlib import Path
from .io import parse_json, read_regular
from .model import MAX_BYTES, MAX_RECORDS, Phase10Error
from .registry import PLUGINS

MAX_POLICY_BYTES = 1024 * 1024


@dataclass(frozen=True)
class Policy:
    enabled: bool = False
    plugins: tuple = ()
    scope: tuple = ()
    assessment_approved: bool = False
    awareness_approved: bool = False
    privacy_policy: str = ''
    data_sharing_approved: bool = False
    max_bytes: int = MAX_BYTES
    max_records: int = MAX_RECORDS
    timeout_seconds: int = 5
    retention_days: int = 30

    def __post_init__(self):
        row = {field.name: getattr(self, field.name) for field in fields(self)}
        for name in ('enabled', 'assessment_approved', 'awareness_approved', 'data_sharing_approved'):
            if type(row[name]) is not bool:
                raise Phase10Error('Boolean policy field required')
        for name in ('plugins', 'scope'):
            entries = row.get(name, [])
            if (not isinstance(entries, (list, tuple)) or len(entries) > 1000 or
                    any(not isinstance(v, str) or not v or v != v.strip() or len(v) > 4096 or any(ord(c) < 32 or ord(c) == 127 for c in v) for v in entries) or len(set(entries)) != len(entries)):
                raise Phase10Error('Invalid policy list')
            object.__setattr__(self, name, tuple(entries))
        if set(self.plugins) - set(PLUGINS):
            raise Phase10Error('Unknown integration')
        privacy = row.get('privacy_policy', '')
        if not isinstance(privacy, str) or len(privacy) > 256 or any(ord(c) < 32 or ord(c) == 127 for c in privacy):
            raise Phase10Error('Invalid privacy policy identifier')
        for name, maximum in (('max_bytes', MAX_BYTES), ('max_records', MAX_RECORDS), ('timeout_seconds', 30), ('retention_days', 365)):
            if type(row[name]) is not int or not 1 <= row[name] <= maximum:
                raise Phase10Error('Invalid policy quota')
        self.serialize()

    def serialize(self):
        raw = (json.dumps(asdict(self), ensure_ascii=True, indent=2, allow_nan=False) + '\n').encode()
        if len(raw) > MAX_POLICY_BYTES:
            raise Phase10Error('Policy exceeds its serialized byte limit')
        return raw

    @classmethod
    def from_dict(cls, row):
        if not isinstance(row, dict) or set(row) - {field.name for field in fields(cls)}:
            raise Phase10Error('Unsupported policy fields')
        return cls(**row)

    @classmethod
    def load(cls, path):
        path = Path(path)
        # A missing policy keeps integrations off without creating runtime state.
        try:
            path.lstat()
        except FileNotFoundError:
            return cls()
        return cls.from_dict(parse_json(read_regular(path, MAX_POLICY_BYTES)))

    def require(self, plugin_id):
        if not self.enabled:
            raise Phase10Error('Phase 10 integrations are disabled')
        if plugin_id not in PLUGINS or plugin_id not in self.plugins:
            raise Phase10Error('Integration is not enabled by policy')
        return PLUGINS[plugin_id]

    def context(self, raw_hash, imported_at):
        return {'raw_source_hash': raw_hash, 'imported_at': imported_at,
                'scope': list(self.scope), 'assessment_approved': self.assessment_approved,
                'awareness_approved': self.awareness_approved, 'privacy_policy': self.privacy_policy,
                'max_records': self.max_records, 'max_bytes': self.max_bytes}
