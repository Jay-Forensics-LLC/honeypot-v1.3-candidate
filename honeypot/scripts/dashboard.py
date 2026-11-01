"""Local operator dashboard for optional offline investigations and saved telemetry."""
import base64
import binascii
from dataclasses import asdict
import datetime as dt
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import os
from pathlib import Path
import secrets
import stat
import tempfile
import threading
from urllib.parse import urlsplit

from phase10.io import parse_json, read_regular
from phase10.model import MAX_BYTES, Phase10Error
from phase10.policy import Policy
from phase10.registry import PLUGINS
from phase10.service import import_sentinel, parse_report, utc
from phase10.store import Store

ASSETS = {'/': ('index.html', 'text/html; charset=utf-8'),
          '/app.js': ('app.js', 'text/javascript; charset=utf-8'),
          '/styles.css': ('styles.css', 'text/css; charset=utf-8')}
SERVICES = ('cowrie', 'opencanary', 'suricata', 'loki', 'alloy', 'grafana', 'incidentd')
SOURCES = {'cowrie': 'logs/normalized/cowrie.jsonl',
           'opencanary': 'logs/normalized/opencanary.jsonl',
           'events': 'logs/normalized/events.jsonl',
           'incidents': 'logs/normalized/incidents.jsonl'}
LABELS = {'spiderfoot': 'SpiderFoot', 'recon-ng': 'Recon-ng', 'bbot': 'BBOT',
          'nmap': 'Nmap', 'nuclei': 'Nuclei', 'cloudfox': 'CloudFox',
          'bloodhound': 'BloodHound', 'awareness': 'Awareness reports',
          'mock-ti': 'Threat intelligence preview', 'forensics': 'Evidence handoff',
          'sentinel': 'Sentinel cases', 'imazing': 'iMazing backup metadata'}
DESCRIPTIONS = {
    'spiderfoot': 'Import exported entities and observed relationships.',
    'recon-ng': 'Review versioned workspace reports.',
    'bbot': 'Import supported discovery events from a local report.',
    'nmap': 'Review authorized service-discovery reports.',
    'nuclei': 'Review authorized assessment reports.',
    'cloudfox': 'Import an approved cloud findings report.',
    'bloodhound': 'Review authorized aggregate lab summaries.',
    'awareness': 'Import aggregate training results without employee identities.',
    'mock-ti': 'Try local provider responses; no external requests are sent.',
    'forensics': 'Preserve a private copy and hash for local analysis.',
    'sentinel': 'Import a verified, completed small Sentinel case.',
    'imazing': 'Inventory completed, unencrypted backup metadata only.'}
DIRECTORY = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC


def _parent(path, create=False):
    path = Path(path).absolute()
    if '..' in path.parts:
        raise Phase10Error('Unsupported parent path')
    descriptor = os.open(path.anchor, DIRECTORY)
    try:
        for part in path.parent.parts[1:]:
            try:
                child = os.open(part, DIRECTORY, dir_fd=descriptor)
            except FileNotFoundError:
                if not create:
                    raise
                os.mkdir(part, mode=0o700, dir_fd=descriptor)
                child = os.open(part, DIRECTORY, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        return descriptor, path.name
    except BaseException:
        os.close(descriptor)
        raise


def _write_policy(path, policy):
    parent, name = _parent(path, create=True)
    temporary = '.dashboard-' + secrets.token_hex(16)
    created = False
    try:
        try:
            previous = os.stat(name, dir_fd=parent, follow_symlinks=False)
        except FileNotFoundError:
            previous = None
        if previous is not None and (not stat.S_ISREG(previous.st_mode) or
                                     previous.st_uid != os.geteuid() or previous.st_nlink != 1):
            raise Phase10Error('Policy must be an operator-owned regular file')
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                             0o600, dir_fd=parent)
        created = True
        with os.fdopen(descriptor, 'w', encoding='utf-8') as stream:
            json.dump(asdict(policy), stream, ensure_ascii=True, indent=2, allow_nan=False)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, name, src_dir_fd=parent, dst_dir_fd=parent)
        os.fsync(parent)
    finally:
        if created:
            try:
                os.unlink(temporary, dir_fd=parent)
            except FileNotFoundError:
                pass
        os.close(parent)


def _summary(manifest):
    return {key: manifest[key] for key in
            ('import_id', 'plugin_id', 'format', 'imported_at', 'raw_source_hash')} | {
                'records': manifest['normalized']['records'],
                'deduplicated': manifest.get('deduplicated', False)}


def _import_order(summary):
    value = summary['imported_at']
    if not isinstance(value, str) or len(value) > 64 or not isinstance(summary['import_id'], str):
        raise Phase10Error('Invalid saved import metadata')
    try:
        when = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
        if when.tzinfo is None:
            raise ValueError('Timezone required')
        return when.astimezone(dt.timezone.utc), summary['import_id']
    except (ValueError, OverflowError) as exc:
        raise Phase10Error('Invalid saved import time') from exc


def _source_metadata(root, name, relative):
    parent = descriptor = None
    try:
        parent, leaf = _parent(root / relative)
        descriptor = os.open(leaf, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                             dir_fd=parent)
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode):
            raise Phase10Error('Unsupported telemetry file')
        return {'name': name, 'present': True,
                'last_write_age': max(0, (dt.datetime.now().timestamp() - info.st_mtime)),
                'status': 'observed'}
    except FileNotFoundError:
        return {'name': name, 'present': False, 'last_write_age': None, 'status': 'not_collected'}
    except (OSError, Phase10Error):
        return {'name': name, 'present': None, 'last_write_age': None, 'status': 'unavailable'}
    finally:
        if descriptor is not None:
            os.close(descriptor)
        if parent is not None:
            os.close(parent)


def _health(root):
    path = root / 'state/health.json'
    try:
        path.lstat()
    except FileNotFoundError:
        return 'not_collected', {}
    except OSError:
        return 'unavailable', {}
    except OSError:
        return 'unavailable', {}
    try:
        row = parse_json(read_regular(path, 1024 * 1024))
        if not isinstance(row, dict):
            raise Phase10Error('Invalid saved health')
        containers = row.get('containers') if isinstance(row.get('containers'), dict) else {}
        services = []
        for name in SERVICES:
            source = containers.get(name) if isinstance(containers.get(name), dict) else {}
            services.append({'name': name,
                             'state': source.get('state') if source.get('state') in
                             ('running', 'exited', 'paused', 'created', 'restarting', 'dead') else None,
                             'health': source.get('health') if source.get('health') in
                             ('healthy', 'unhealthy', 'starting', 'none') else None})
        stamp = row.get('timestamp')
        try:
            when = dt.datetime.fromisoformat(stamp.replace('Z', '+00:00'))
            if when.tzinfo is None:
                raise ValueError('Timezone required')
            stamp = when.isoformat().replace('+00:00', 'Z')
            age = (dt.datetime.now(dt.timezone.utc) - when).total_seconds()
        except (ValueError, TypeError, AttributeError):
            stamp = age = None
        health = {'timestamp': stamp, 'age_seconds': age,
                  'stale': age is None or age < -5 or age > 180,
                  'severity': row.get('severity') if row.get('severity') in
                  ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') else None,
                  'services': services, 'observation': 'saved_snapshot',
                  'current_runtime_verified': False}
        for key in ('pcap_running', 'clock_synchronized', 'log_forwarding'):
            health[key] = row.get(key) if type(row.get(key)) is bool else None
        for key in ('guard', 'capture'):
            value = row.get(key) if isinstance(row.get(key), dict) else {}
            health[key + '_ok'] = value.get('ok') if type(value.get('ok')) is bool else None
        for key in ('disk_percent', 'parser_errors_last_hour', 'suricata_kernel_drop_rate'):
            value = row.get(key)
            maximum = 100 if key == 'disk_percent' else 10**15
            health[key] = value if (type(value) in (int, float) and 0 <= value <= maximum
                                    and math.isfinite(value)) else None
        return 'available', health
    except (OSError, Phase10Error):
        return 'unavailable', {}


def _expect(row, required, optional=()):
    if not isinstance(row, dict) or set(row) - set(required) - set(optional) or set(required) - set(row):
        raise Phase10Error('Unsupported request fields')


def _decode(value, maximum):
    if not isinstance(value, str) or len(value) > ((maximum + 2) // 3) * 4:
        raise Phase10Error('Upload exceeds import limit')
    try:
        raw = base64.b64decode(value, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise Phase10Error('Invalid upload encoding') from exc
    if len(raw) > maximum:
        raise Phase10Error('Upload exceeds import limit')
    return raw


class DashboardServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 8

    def __init__(self, root, port, policy_path, store_path, sentinel_root):
        self.root = Path(root).absolute()
        self.assets = Path(__file__).resolve().parents[1] / 'dashboard'
        self.policy_path = Path(policy_path) if policy_path else self.root / 'configs/phase10.json'
        self.store_path = Path(store_path) if store_path else self.root / 'state/phase10'
        self.sentinel_root = Path(sentinel_root) if sentinel_root else None
        self.session_token = secrets.token_urlsafe(32)
        self.operation_lock = threading.Lock()
        self.enricher = None
        super().__init__(('127.0.0.1', port), DashboardHandler)

    def snapshot(self):
        errors = []
        try:
            policy = Policy.load(self.policy_path)
        except (OSError, Phase10Error):
            policy = Policy()
            errors.append({'module': 'policy', 'code': 'policy_unavailable',
                           'message': 'Settings could not be read. Save valid settings to continue.'})
        imports = findings = []
        store_status = 'available' if policy.enabled else 'disabled'
        try:
            store = Store(self.store_path, policy)
            imports = [_summary(row) for row in store.manifests() if row['plugin_id'] in policy.plugins]
            imports.sort(key=_import_order, reverse=True)
            findings = store.export()
        except (OSError, Phase10Error, KeyError, TypeError):
            store_status = 'unavailable'
            imports = findings = []
            errors.append({'module': 'evidence', 'code': 'store_unavailable',
                           'message': 'Evidence is unavailable. Check the selected private store and try again.'})
        telemetry_status, health = _health(self.root)
        sources = [_source_metadata(self.root, name, path) for name, path in SOURCES.items()]
        integrations = [{'identifier': name, 'name': LABELS[name], 'category': spec.category,
                         'input_formats': list(spec.input_formats), 'mode': spec.mode,
                         'enabled': policy.enabled and name in policy.plugins}
                        for name, spec in PLUGINS.items()]
        available = False
        if self.sentinel_root is not None:
            try:
                read_regular(self.sentinel_root / 'tools/evidence_lab/analyze.py', 1024 * 1024)
                available = True
            except (OSError, Phase10Error):
                pass
        return {'app': {'name': 'HoneyTrace Security Suite', 'mode': 'Local / offline', 'updated_at': utc()},
                'metrics': {'imports': len(imports) if store_status != 'unavailable' else None,
                            'findings': len(findings) if store_status != 'unavailable' else None,
                            'integrations_enabled': sum(item['enabled'] for item in integrations)},
                'policy': asdict(policy), 'store_status': store_status, 'errors': errors,
                'integrations': integrations, 'imports': imports,
                'findings': findings[:1000], 'findings_truncated': len(findings) > 1000,
                'telemetry': {'status': telemetry_status, 'health': health, 'sources': sources},
                'posture': {'honeypot': 'observed' if health else 'not_checked', 'guard': 'not_checked',
                            'beta': 'not_qualified', 'edition': 'Free core',
                            'note': 'Saved observations do not establish current runtime qualification.'},
                'capabilities': [{'id': name, 'title': LABELS[name], 'category': spec.category,
                                  'status': 'enabled' if policy.enabled and name in policy.plugins else 'available',
                                  'description': DESCRIPTIONS[name], 'formats': list(spec.input_formats)}
                                 for name, spec in PLUGINS.items()],
                'hardware': [{'id': name, 'name': label, 'status': 'planned',
                              'description': 'Hardware capture will be added in a later milestone.'}
                             for name, label in (('ble', 'Bluetooth LE'), ('wifi', 'Wi-Fi'), ('rf', 'RF'))],
                'sentinel': {'available': available, 'source_ref': None,
                             'note': 'Analyze captures with the companion offline analyzer, then import its completed case.'}}

    def mutate(self, path, row):
        with self.operation_lock:
            if path == '/api/policy':
                policy = Policy.from_dict(row)
                _write_policy(self.policy_path, policy)
                self.enricher = None
                return {'status': 'saved', 'policy': asdict(policy)}
            policy = Policy.load(self.policy_path)
            if not policy.enabled:
                return 409, {'code': 'disabled', 'error': 'Enable offline imports in Settings first.'}
            if path == '/api/import':
                _expect(row, ('plugin', 'format', 'data'))
                plugin, format_name = row['plugin'], row['format']
                if (not isinstance(plugin, str) or plugin in ('sentinel', 'imazing', 'mock-ti', 'forensics') or
                        not isinstance(format_name, str)):
                    raise Phase10Error('Use the dedicated import workflow')
                policy.require(plugin)
                raw = _decode(row['data'], policy.max_bytes)
                imported_at = utc()
                context = policy.context(hashlib.sha256(raw).hexdigest(), imported_at)
                findings = parse_report(plugin, format_name, raw, context, policy.timeout_seconds)
                manifest = Store(self.store_path, policy).save(plugin, format_name, raw, findings, imported_at)
                return {'status': 'imported', 'manifest': _summary(manifest)}
            if path == '/api/sentinel':
                _expect(row, ('bundle_path',))
                if not isinstance(row['bundle_path'], str) or not 1 <= len(row['bundle_path']) <= 4096:
                    raise Phase10Error('Choose a local case folder')
                result = import_sentinel(self.store_path, policy, row['bundle_path'])
                return {'status': 'imported', 'manifest': _summary(result['manifest']),
                        'verification': result['verification']}
            if path == '/api/imazing':
                _expect(row, ('files',))
                names = ('Manifest.plist', 'Status.plist', 'Manifest.db')
                _expect(row['files'], names)
                policy.require('imazing')
                from phase10.imazing import import_backup
                with tempfile.TemporaryDirectory(prefix='hp-dashboard-backup-') as folder:
                    for name in names:
                        limit = min(policy.max_bytes, 1024 * 1024) if name.endswith('.plist') else policy.max_bytes
                        raw = _decode(row['files'][name], limit)
                        descriptor = os.open(Path(folder) / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                        with os.fdopen(descriptor, 'wb') as stream:
                            stream.write(raw)
                    result = import_backup(self.store_path, policy, folder)
                result['manifests'] = [_summary(item) for item in result['manifests']]
                return {'status': 'imported', 'result': result}
            if path == '/api/forensics':
                _expect(row, ('data',))
                policy.require('forensics')
                from phase10.forensics import export_copy
                raw = _decode(row['data'], policy.max_bytes)
                with tempfile.TemporaryDirectory(prefix='hp-dashboard-copy-') as folder:
                    source = Path(folder) / 'artifact.bin'
                    descriptor = os.open(source, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                    with os.fdopen(descriptor, 'wb') as stream:
                        stream.write(raw)
                    result = export_copy(self.store_path, policy, source)
                result['manifest'] = _summary(result['manifest'])
                return {'status': 'imported', 'result': result}
            if path == '/api/enrich':
                _expect(row, ('provider', 'type', 'value', 'response'), ('status',))
                policy.require('mock-ti')
                from phase10.intel import MockEnricher
                if self.enricher is None or self.enricher.policy != policy:
                    self.enricher = MockEnricher(policy)
                return self.enricher.enrich(row['provider'], row['type'], row['value'],
                                            response=row['response'], status=row.get('status', 200))
            return 404, {'code': 'not_found', 'error': 'This operation is not available.'}


class DashboardHandler(BaseHTTPRequestHandler):
    server_version = 'HoneyTrace'

    def setup(self):
        self.request.settimeout(10)
        super().setup()

    def log_message(self, format_string, *args):
        # Request headers, local case selectors and the session token stay private.
        pass

    def _send(self, status, data, content_type='application/json; charset=utf-8'):
        if isinstance(data, (dict, list)):
            data = json.dumps(data, ensure_ascii=True, allow_nan=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        self.send_header('Connection', 'close')
        self.end_headers()
        self.close_connection = True
        if self.command != 'HEAD':
            try:
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def _guard(self):
        port = self.server.server_port
        hosts = ('127.0.0.1:' + str(port), 'localhost:' + str(port))
        host = self.headers.get('Host', '').lower()
        if host not in hosts or (self.headers.get('Origin') is not None and
                                 self.headers['Origin'] not in tuple('http://' + name for name in hosts)):
            self._send(403, {'code': 'local_only', 'error': 'Use the local dashboard address.'})
            return None
        path = urlsplit(self.path)
        if path.query or path.fragment:
            self._send(400, {'code': 'invalid_input', 'error': 'Use the dashboard navigation.'})
            return None
        if path.path.startswith('/api/'):
            expected = 'Bearer ' + self.server.session_token
            supplied = self.headers.get('Authorization', '')
            if not secrets.compare_digest(supplied.encode(), expected.encode()):
                self._send(401, {'code': 'unauthorized', 'error': 'Open the session link printed by HoneyTrace.'})
                return None
        return path.path

    def do_GET(self):
        path = self._guard()
        if path is None:
            return
        try:
            if path in ASSETS:
                name, content_type = ASSETS[path]
                self._send(200, read_regular(self.server.assets / name, MAX_BYTES), content_type)
            elif path == '/api/state':
                self._send(200, self.server.snapshot())
            elif path == '/api/export':
                policy = Policy.load(self.server.policy_path)
                if not policy.enabled:
                    self._send(409, {'code': 'disabled', 'error': 'Enable offline imports in Settings first.'})
                    return
                self._send(200, {'schema_version': 1, 'findings': Store(self.server.store_path, policy).export()})
            elif path == '/api/guide':
                self._send(200, {'steps': ['Enable the modules you want in Settings.',
                                          'Import an exported report or completed case.',
                                          'Review findings and provenance, then export.'],
                                 'limits': {'input_bytes': MAX_BYTES, 'finding_preview': 1000},
                                 'sample': {'plugin': 'bbot', 'format': 'jsonl',
                                            'data': {'id': 'tutorial-dns-1', 'type': 'DNS_NAME',
                                                     'data': 'sample.example.org',
                                                     'timestamp': '2026-11-01T00:00:00Z'}}})
            else:
                self._send(404, {'code': 'not_found', 'error': 'This page is not available.'})
        except (OSError, Phase10Error, ValueError, KeyError, TypeError):
            self._send(503, {'code': 'store_unavailable', 'error': 'Data is unavailable. Check settings and try again.'})

    def do_POST(self):
        path = self._guard()
        if path is None:
            return
        if not path.startswith('/api/'):
            self._send(404, {'code': 'not_found', 'error': 'This operation is not available.'})
            return
        try:
            if self.headers.get('Transfer-Encoding') or self.headers.get_content_type() != 'application/json':
                raise Phase10Error('JSON request required')
            lengths = self.headers.get_all('Content-Length') or []
            if len(lengths) != 1 or not lengths[0].isdigit():
                raise Phase10Error('Request length required')
            length = int(lengths[0])
            if not 0 < length <= 2 * MAX_BYTES:
                self._send(413, {'code': 'input_too_large', 'error': 'This upload is too large. Use a smaller report.'})
                return
            raw = self.rfile.read(length)
            if len(raw) != length:
                raise Phase10Error('Incomplete request')

            def pairs(entries):
                row = {}
                for key, value in entries:
                    if key in row:
                        raise Phase10Error('Duplicate request field')
                    row[key] = value
                return row

            def constant(_):
                raise Phase10Error('Finite JSON values required')

            row = json.loads(raw, object_pairs_hook=pairs, parse_constant=constant)
            result = self.server.mutate(path, row)
            status, result = result if isinstance(result, tuple) else (200, result)
            self._send(status, result)
        except (Phase10Error, ValueError, TypeError, KeyError, RecursionError):
            self._send(400, {'code': 'invalid_input', 'error': 'This input could not be accepted. Check the format and module settings.'})
        except OSError:
            self._send(503, {'code': 'store_unavailable', 'error': 'The private store or settings are unavailable. Please try again.'})

    def do_OPTIONS(self):
        self._send(405, {'code': 'method_not_allowed', 'error': 'Use the local dashboard interface.'})


def create_server(root, port=0, policy_path=None, store_path=None, sentinel_root=None):
    if os.geteuid() == 0:
        raise Phase10Error('Run the dashboard as an unprivileged operator')
    if type(port) is not int or not 0 <= port <= 65535:
        raise Phase10Error('Invalid dashboard port')
    return DashboardServer(root, port, policy_path, store_path, sentinel_root)


def serve(root, port=8765, policy_path=None, store_path=None, sentinel_root=None):
    server = create_server(root, port, policy_path, store_path, sentinel_root)
    print('HoneyTrace Security Suite — local dashboard', flush=True)
    print('Open http://127.0.0.1:' + str(server.server_port) + '/#token=' + server.session_token, flush=True)
    print('Keep this session link private. Press Ctrl+C to stop the dashboard.', flush=True)
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0
