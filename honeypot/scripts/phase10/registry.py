"""Fixed offline adapters. Registry metadata never grants execution authority."""
from dataclasses import dataclass


@dataclass(frozen=True)
class PluginSpec:
    identifier: str
    category: str
    input_formats: tuple
    version: str = '1.0.0'
    output_format: str = 'finding-v1'
    mode: str = 'offline'
    permissions: tuple = ('read-explicit-input', 'write-private-store')
    executable: None = None
    secrets_required: tuple = ()
    timeout_seconds: int = 5
    rate_limit: int = 0
    concurrency: int = 1
    retention_days: int = 30
    opt_in: bool = True
    failure_behavior: str = 'isolated-error'


PLUGINS = {identifier: PluginSpec(identifier, category, formats) for identifier, category, formats in (
    ('spiderfoot', 'osint', ('csv', 'gexf')),
    ('recon-ng', 'osint', ('json',)),
    ('bbot', 'osint', ('jsonl',)),
    ('nmap', 'assessment', ('xml',)),
    ('nuclei', 'assessment', ('jsonl',)),
    ('cloudfox', 'cloud', ('json',)),
    ('bloodhound', 'identity', ('json',)),
    ('awareness', 'awareness', ('json',)),
    ('mock-ti', 'intelligence', ('json',)),
    ('forensics', 'forensics', ('binary',)),
    ('sentinel', 'forensics', ('jsonl',)),
    ('imazing', 'forensics', ('sqlite', 'plist')),
)}
