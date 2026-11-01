"""Prepare consistent decoy identities without changing running sensor settings."""
import configparser
from copy import deepcopy
import hashlib
import io
import json
from pathlib import Path
import re

from phase10.io import parse_json, read_regular
from phase10.model import Phase10Error

_PROFILES = {
    'fileserver': {
        'name': 'File server',
        'description': 'A Linux file service with an administrative web portal.',
        'hostname': 'fileserver', 'node_id': 'fileserver-services',
        'ftp_banner': 'ProFTPD 1.3.8 Server (File Service)',
        'http_banner': 'nginx/1.24.0',
    },
    'webserver': {
        'name': 'Web server',
        'description': 'A Linux web host with a separate file-transfer service.',
        'hostname': 'webserver', 'node_id': 'webserver-services',
        'ftp_banner': 'vsFTPd 3.0.5',
        'http_banner': 'Apache/2.4.58 (Ubuntu)',
    },
}
_LIMITATIONS = [
    'Identity presentation reduces obvious labels; it does not make a honeypot undetectable.',
    'Protocol behavior, SSH fingerprints and enabled services remain unchanged.',
    'Prepared configurations require separate review and application to the intended target.',
]
_SENSITIVE = re.compile(r'password|passwd|secret|token|credential|private.?key', re.I)


def describe_profiles():
    """Describe the fixed profiles without reading configuration or runtime state."""
    return [{'id': key, 'name': value['name'], 'description': value['description'],
             'services': ['SSH', 'Telnet', 'FTP', 'HTTP'],
             'limitations': list(_LIMITATIONS)} for key, value in _PROFILES.items()]


def _check_source(value):
    """Refuse credential-bearing source instead of exporting redacted broken config."""
    if isinstance(value, dict):
        for key, item in value.items():
            if _SENSITIVE.search(str(key)):
                raise Phase10Error('Use sanitized source configuration for decoy profiles')
            _check_source(item)
    elif isinstance(value, list):
        for item in value:
            _check_source(item)
    elif isinstance(value, str) and ('-----BEGIN ' in value or
                                    re.search(r'\b[a-z][a-z0-9+.-]*://[^/\s:@]+:[^/\s@]+@', value, re.I)):
        raise Phase10Error('Use sanitized source configuration for decoy profiles')


def render_profile(root, profile_id):
    """Return derived source files; no writes, deployment, or listener changes."""
    if not isinstance(profile_id, str) or profile_id not in _PROFILES:
        raise Phase10Error('Choose an available decoy identity profile')
    root = Path(root)
    try:
        cowrie = configparser.ConfigParser(interpolation=None, strict=True)
        cowrie.optionxform = str
        cowrie.read_string(read_regular(root / 'configs/cowrie/cowrie.cfg', 1024**2).decode('utf-8'))
        canary = parse_json(read_regular(root / 'configs/opencanary/opencanary.conf', 1024**2))
        if not isinstance(canary, dict) or not cowrie.has_option('honeypot', 'hostname') or not all(
                isinstance(canary.get(key), str) for key in ('device.node_id', 'ftp.banner', 'http.banner')):
            raise Phase10Error('Supported source configuration is required')
        _check_source({section: dict(cowrie[section]) for section in cowrie.sections()})
        _check_source(canary)
    except (configparser.Error, UnicodeError) as exc:
        raise Phase10Error('Supported source configuration is required') from exc
    profile = _PROFILES[profile_id]
    cowrie.set('honeypot', 'hostname', profile['hostname'])
    canary = deepcopy(canary)
    canary.update({'device.node_id': profile['node_id'], 'ftp.banner': profile['ftp_banner'],
                   'http.banner': profile['http_banner']})
    buffer = io.StringIO()
    cowrie.write(buffer)
    contents = [('cowrie.cfg', buffer.getvalue()),
                ('opencanary.conf', json.dumps(canary, ensure_ascii=True, indent=2) + '\n')]
    return {'profile': next(item for item in describe_profiles() if item['id'] == profile_id),
            'status': 'prepared',
            'note': 'Review configuration before applying; no running services changed.',
            'files': [{'name': name, 'content': content,
                       'sha256': hashlib.sha256(content.encode('utf-8')).hexdigest()}
                      for name, content in contents]}
