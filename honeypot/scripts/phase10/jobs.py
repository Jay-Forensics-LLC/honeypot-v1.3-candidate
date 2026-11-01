"""Explicit offline capture jobs through an operator-configured Sentinel checkout."""
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import secrets
import selectors
import signal
import stat
import subprocess
import sys
import threading
import time

from .io import InputTooLarge, parse_json, read_regular
from .model import Phase10Error

MAX_CAPTURE_BYTES = 64 * 1024**2
MAX_WORKSPACE_BYTES = 256 * 1024**2
MAX_LOG_BYTES = 1024**2
MAX_ATTACHMENT_BYTES = 4 * 1024**2
MAX_CONTEXT_BYTES = 256 * 1024
JOB_TIMEOUT_SECONDS = 120
_DIRECTORY = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
_MAGICS = (b'\xd4\xc3\xb2\xa1', b'\xa1\xb2\xc3\xd4', b'\x4d\x3c\xb2\xa1',
           b'\xa1\xb2\x3c\x4d', b'\x0a\x0d\x0d\x0a')
_PUBLIC = ('id', 'status', 'stage', 'error_code', 'case_id', 'created_at', 'updated_at')
_SOURCES = frozenset(('capture.pcap', 'session.jsonl'))
_ATTACHMENTS = frozenset(('transcript.json', 'session-provenance.json'))


class _WorkspaceFull(Phase10Error):
    def __init__(self):
        super().__init__('Private job workspace is full; preserve or move completed cases first')


class _WorkspaceBusy(Phase10Error):
    pass


def _context(value):
    """Take a bounded JSON snapshot so callers cannot mutate queued metadata."""
    if value is None:
        return {}
    if type(value) is not dict:
        raise Phase10Error('Analysis context must be a bounded JSON object')
    pending = [(value, 0)]
    count = 0
    while pending:
        item, depth = pending.pop()
        count += 1
        if depth > 32 or count > MAX_CONTEXT_BYTES:
            raise Phase10Error('Analysis context exceeds its supported bounds')
        if type(item) is dict:
            if any(type(key) is not str for key in item):
                raise Phase10Error('Analysis context requires JSON object keys')
            pending.extend((child, depth + 1) for child in item.values())
        elif type(item) is list:
            pending.extend((child, depth + 1) for child in item)
        elif type(item) not in (str, int, float, bool, type(None)):
            raise Phase10Error('Analysis context requires JSON values')
    try:
        raw = json.dumps(value, allow_nan=False, ensure_ascii=True,
                         separators=(',', ':')).encode()
        if len(raw) > MAX_CONTEXT_BYTES:
            raise InputTooLarge(MAX_CONTEXT_BYTES, len(raw))
        return json.loads(raw)
    except (TypeError, ValueError, RecursionError) as exc:
        if isinstance(exc, Phase10Error):
            raise
        raise Phase10Error('Analysis context must be a bounded JSON object') from exc


def _prepared(value, context):
    if (type(value) is not dict or set(value) != {'sources', 'attachments', 'context'} or
            not isinstance(value['sources'], (list, tuple)) or not 1 <= len(value['sources']) <= 2 or
            type(value['attachments']) is not dict or type(value['context']) is not dict):
        raise Phase10Error('Unsupported prepared analysis inputs')
    sources, seen, source_bytes = [], set(), 0
    for row in value['sources']:
        if (not isinstance(row, (list, tuple)) or len(row) != 2 or
                type(row[0]) is not str or row[0] not in _SOURCES or row[0] in seen or
                type(row[1]) is not bytes or not row[1]):
            raise Phase10Error('Unsupported prepared analysis source')
        name, raw = row
        source_bytes += len(raw)
        if source_bytes > MAX_CAPTURE_BYTES:
            raise InputTooLarge(MAX_CAPTURE_BYTES, source_bytes)
        if name == 'capture.pcap' and (len(raw) < 12 or raw[:4] not in _MAGICS):
            raise Phase10Error('Choose a PCAP or PCAPNG capture file')
        sources.append((name, raw))
        seen.add(name)
    attachments, attachment_bytes = [], 0
    for name, raw in value['attachments'].items():
        if type(name) is not str or name not in _ATTACHMENTS or type(raw) is not bytes:
            raise Phase10Error('Unsupported private analysis attachment')
        attachment_bytes += len(raw)
        if attachment_bytes > MAX_ATTACHMENT_BYTES:
            raise InputTooLarge(MAX_ATTACHMENT_BYTES, attachment_bytes)
        attachments.append((name, raw))
    merged = _context(context)
    merged.update(_context(value['context']))
    return {'sources': sources, 'attachments': attachments, 'context': _context(merged)}


def _utc():
    return dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00', 'Z')


def _directory(path, create=False):
    path = Path(path).absolute()
    if '..' in path.parts or len(path.parts) < 2:
        raise Phase10Error('Choose a private local job workspace')
    descriptor = os.open(path.anchor, _DIRECTORY)
    try:
        for part in path.parts[1:]:
            try:
                child = os.open(part, _DIRECTORY, dir_fd=descriptor)
            except FileNotFoundError:
                if not create:
                    raise
                try:
                    os.mkdir(part, 0o700, dir_fd=descriptor)
                except FileExistsError:
                    pass
                child = os.open(part, _DIRECTORY, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        info = os.fstat(descriptor)
        if info.st_uid != os.geteuid() or info.st_mode & 0o077:
            raise Phase10Error('Job workspace must be private and operator-owned')
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def _usage(descriptor):
    """Count regular files without retaining every sibling directory."""
    total = entries = 0

    def walk(current):
        nonlocal total, entries
        names = []
        with os.scandir(current) as children:
            for child in children:
                entries += 1
                if entries > 10000:
                    raise Phase10Error('Private job workspace is full')
                try:
                    info = child.stat(follow_symlinks=False)
                except FileNotFoundError:
                    continue  # The companion atomically replaces its progress files.
                if info.st_uid != os.geteuid() or info.st_mode & 0o077:
                    raise Phase10Error('Unsupported job workspace entry')
                if stat.S_ISDIR(info.st_mode):
                    names.append(child.name)
                elif stat.S_ISREG(info.st_mode) and info.st_nlink == 1:
                    total += info.st_size
                else:
                    raise Phase10Error('Unsupported job workspace entry')
        for name in names:
            try:
                child = os.open(name, _DIRECTORY, dir_fd=current)
            except FileNotFoundError:
                continue
            try:
                walk(child)
            finally:
                os.close(child)

    walk(descriptor)
    return total


def _stop(process):
    for sig, seconds in ((signal.SIGINT, 0.75), (signal.SIGTERM, 0.75), (signal.SIGKILL, 0.5)):
        if process.poll() is not None:
            return
        try:
            os.killpg(process.pid, sig)
        except ProcessLookupError:
            return
        try:
            process.wait(timeout=seconds)
        except subprocess.TimeoutExpired:
            pass


class JobManager:
    """One session job at a time; private completed bundles survive dashboard exit."""

    def __init__(self, companion_root, workspace_path, import_callback, logger=None,
                 completion_callback=None):
        self.companion_root = Path(companion_root).absolute() if companion_root else None
        self.workspace_path = Path(workspace_path).absolute()
        self.import_callback = import_callback
        self.completion_callback = completion_callback
        self.logger = logger
        self._lock = threading.Lock()
        self._jobs = []
        self._closed = False
        self._history_error = False
        self._reconciled = 0
        self._lease = None
        self._closing = None
        # Existing history must be reconciled only by its lifetime owner. A
        # fresh disabled dashboard still creates no job workspace.
        try:
            root = self._workspace()
        except FileNotFoundError:
            pass
        except _WorkspaceBusy:
            raise
        except (OSError, Phase10Error):
            self._history_error = True
            return
        else:
            os.close(root)
        try:
            self._load_history()
        except BaseException:
            self._release_lease()
            raise

    def _workspace(self, create=False):
        root = _directory(self.workspace_path, create=create)
        try:
            if self._lease is None:
                try:
                    fcntl.flock(root, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError as exc:
                    raise _WorkspaceBusy('This analysis workspace is already open in another dashboard') from exc
                self._lease = os.dup(root)
            elif (os.fstat(root).st_dev, os.fstat(root).st_ino) != (
                    os.fstat(self._lease).st_dev, os.fstat(self._lease).st_ino):
                raise Phase10Error('The private analysis workspace changed')
            return root
        except BaseException:
            os.close(root)
            raise

    def _load_history(self):
        try:
            root = self._workspace()
            os.close(root)
            path = self.workspace_path / 'jobs.json'
            info = path.lstat()
            if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or
                    info.st_uid != os.geteuid() or info.st_mode & 0o077):
                raise Phase10Error('Invalid private job history')
            rows = parse_json(read_regular(path, 64 * 1024))
            if not isinstance(rows, list) or len(rows) > 20:
                raise Phase10Error('Invalid job history')
            seen = set()
            for row in rows:
                if (not isinstance(row, dict) or set(row) != set(_PUBLIC) or
                        not isinstance(row['id'], str) or len(row['id']) != 32 or
                        any(c not in '0123456789abcdef' for c in row['id']) or
                        row['status'] not in ('running', 'complete', 'failed', 'cancelled') or
                        row['stage'] not in ('starting', 'ingestion', 'analysis', 'verifying',
                                             'complete', 'failed', 'cancelled') or
                        row['error_code'] not in (None, 'analysis_failed', 'analysis_timeout',
                                                  'workspace_quota', 'import_failed', 'analysis_interrupted',
                                                  'preparation_failed', 'capture_too_large', 'custody_failed') or
                        row['case_id'] is not None and (not isinstance(row['case_id'], str) or
                            len(row['case_id']) != 64 or any(c not in '0123456789abcdef' for c in row['case_id'])) or
                        any(not isinstance(row[key], str) or len(row[key]) > 64
                            for key in ('created_at', 'updated_at'))):
                    raise Phase10Error('Invalid job history')
                if (row['id'] in seen or row['status'] == 'complete' and
                        (row['case_id'] is None or row['stage'] != 'complete' or row['error_code'] is not None)):
                    raise Phase10Error('Invalid job history')
                seen.add(row['id'])
                if row['status'] == 'running':
                    row.update(status='failed', stage='failed', error_code='analysis_interrupted',
                               updated_at=_utc())
                    self._reconciled += 1
            self._jobs = rows
        except FileNotFoundError:
            pass
        except (OSError, Phase10Error):
            self._history_error = True

    def _save_history(self):
        """Called under the manager lock; failures never expose private diagnostics."""
        root = None
        temporary = '.jobs-' + secrets.token_hex(16)
        try:
            root = self._workspace()
            data = json.dumps([self._public(job) for job in self._jobs], allow_nan=False).encode()
            fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                         0o600, dir_fd=root)
            with os.fdopen(fd, 'wb') as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, 'jobs.json', src_dir_fd=root, dst_dir_fd=root)
            os.fsync(root)
        except (OSError, Phase10Error):
            self._history_error = True
        finally:
            if root is not None:
                try:
                    os.unlink(temporary, dir_fd=root)
                except OSError:
                    pass
                os.close(root)

    def available(self):
        if self.companion_root is None or sys.platform != 'linux' or sys.version_info < (3, 11):
            return False
        try:
            read_regular(self.companion_root / 'tools/evidence_lab/analyze.py', 1024**2)
            return True
        except (OSError, Phase10Error):
            return False

    @staticmethod
    def _public(job):
        return {key: job[key] for key in _PUBLIC}

    def _log(self, event, **fields):
        if self.logger is not None:
            try:
                self.logger.event(event, **{key: value for key, value in fields.items() if value is not None})
            except (OSError, ValueError):
                pass  # Diagnostic persistence must not replace the analysis result.

    def snapshot(self):
        with self._lock:
            jobs = [self._public(job) for job in reversed(self._jobs)]
        return {'available': self.available(), 'jobs': jobs,
                'history_status': 'unavailable' if self._history_error else 'available'}

    def _require_available(self):
        if os.geteuid() == 0 or not self.available():
            raise Phase10Error('Configure an unprivileged Sentinel companion before analyzing captures')

    def _require_slot(self):
        if self._closed:
            raise Phase10Error('The analysis session is closed')
        if self._history_error:
            raise Phase10Error('Private analysis history is unavailable; check the job workspace')
        if any(job['status'] == 'running' for job in self._jobs):
            raise Phase10Error('A capture is already being analyzed; wait or cancel it first')

    def start(self, input_path, context=None):
        self._require_available()
        if (not isinstance(input_path, str) or not 1 <= len(input_path) <= 4096 or
                not Path(input_path).is_absolute() or any(ord(c) < 32 for c in input_path)):
            raise Phase10Error('Choose an absolute local capture path')
        with self._lock:
            self._require_slot()
            raw = read_regular(input_path, MAX_CAPTURE_BYTES)
            prepared = _prepared({'sources': [('capture.pcap', raw)],
                                  'attachments': {}, 'context': {}}, context)
            return self._enqueue(prepared=prepared)

    def start_bytes(self, raw, context=None):
        self._require_available()
        with self._lock:
            self._require_slot()
            prepared = _prepared({'sources': [('capture.pcap', raw)],
                                  'attachments': {}, 'context': {}}, context)
            return self._enqueue(prepared=prepared)

    def start_prepared(self, prepare_callable, context=None):
        """Schedule trusted bounded preparation in the same single analysis slot."""
        self._require_available()
        if not callable(prepare_callable):
            raise Phase10Error('A trusted analysis preparer is required')
        with self._lock:
            self._require_slot()
            return self._enqueue(prepare=prepare_callable, context=_context(context))

    @staticmethod
    def _metadata(job):
        return {'job_id': job['id'], 'created_at': job['created_at'],
                'context': job['context'], 'artifacts': job['artifacts']}

    def _persist_prepared(self, job, prepared, rollback=False):
        artifacts = [{'path': str(job['folder'] / name), 'name': name,
                      'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)}
                     for name, raw in prepared['sources'] + prepared['attachments']]
        metadata = {'job_id': job['id'], 'created_at': job['created_at'],
                    'context': prepared['context'], 'artifacts': artifacts}
        record = json.dumps(metadata, allow_nan=False, ensure_ascii=True,
                            separators=(',', ':')).encode()
        writes = prepared['sources'] + prepared['attachments'] + [('inputs.json', record)]
        root = self._workspace()
        directory = None
        created = []
        try:
            # Reserve the bounded public ledger as well as the private inputs.
            if _usage(root) + sum(len(raw) for _, raw in writes) + 64 * 1024 > MAX_WORKSPACE_BYTES:
                raise _WorkspaceFull()
            directory = os.open(job['id'], _DIRECTORY, dir_fd=root)
            for name, raw in writes:
                descriptor = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                                     os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=directory)
                created.append(name)
                with os.fdopen(descriptor, 'wb') as stream:
                    stream.write(raw)
                    stream.flush()
                    os.fsync(stream.fileno())
            os.fsync(directory)
        except BaseException:
            if rollback and directory is not None:
                # Only synchronous, unaccepted inputs are rolled back. Accepted
                # jobs retain partial acquisition for review and recovery.
                for name in created:
                    os.unlink(name, dir_fd=directory)
                os.fsync(directory)
            raise
        finally:
            if directory is not None:
                os.close(directory)
            os.close(root)
        job.update(context=prepared['context'], sources=[name for name, _ in prepared['sources']],
                   artifacts=artifacts)

    def _enqueue(self, prepared=None, prepare=None, context=None):
        needs_history = self._lease is None
        root = self._workspace(create=True)
        identifier, now = secrets.token_hex(16), _utc()
        job = {'id': identifier, 'status': 'running', 'stage': 'starting',
               'error_code': None, 'case_id': None, 'created_at': now, 'updated_at': now,
               'folder': self.workspace_path / identifier, 'cancel': threading.Event(),
               'started': time.monotonic(), 'prepare': prepare, 'context': context or {},
               'sources': [], 'artifacts': []}
        created = False
        try:
            if needs_history:
                # Another dashboard may have created and closed this workspace
                # after our state-free startup. Read its history under the lease.
                self._load_history()
                self._require_slot()
            if _usage(root) + 64 * 1024 > MAX_WORKSPACE_BYTES:
                raise _WorkspaceFull()
            os.mkdir(identifier, 0o700, dir_fd=root)
            created = True
            if prepared is not None:
                self._persist_prepared(job, prepared, rollback=True)
        except BaseException:
            if created:
                os.rmdir(identifier, dir_fd=root)
                os.fsync(root)
            raise
        finally:
            os.close(root)
        job['thread'] = threading.Thread(target=self._run, args=(job,), daemon=True,
                                         name='honeytrace-offline-analysis')
        self._jobs.append(job)
        self._jobs = self._jobs[-20:]
        self._save_history()
        if self._reconciled:
            self._log('job.history_reconciled', count=self._reconciled, level='WARNING')
            self._reconciled = 0
        self._log('job.started', job_id=identifier, stage='starting')
        job['thread'].start()
        return self._public(job)

    def _update(self, job, **values):
        with self._lock:
            self._update_locked(job, **values)

    def _update_locked(self, job, **values):
        job.update(values, updated_at=_utc())
        self._save_history()
        status = values.get('status')
        event = 'job.' + status if status in ('complete', 'failed', 'cancelled') else 'job.stage'
        self._log(event, job_id=job['id'], stage=job['stage'], error_code=job['error_code'],
                  case_id=job['case_id'], level='ERROR' if status == 'failed' else 'INFO',
                  duration_ms=round((time.monotonic() - job['started']) * 1000))

    def _stage(self, job):
        try:
            state = parse_json(read_regular(job['folder'] / 'case/state.json', 4096))
            if (state.get('status') == 'INCOMPLETE' and state.get('stage') in ('ingestion', 'analysis')
                    and state['stage'] != job['stage']):
                self._update(job, stage=state['stage'])
        except (OSError, Phase10Error, AttributeError):
            pass

    @staticmethod
    def _interruption(job):
        if job['cancel'].is_set():
            return 'cancelled'
        if time.monotonic() - job['started'] > JOB_TIMEOUT_SECONDS:
            return 'analysis_timeout'
        return None

    def _finish_interrupted(self, job):
        failure = self._interruption(job)
        if failure:
            self._update(job, status='cancelled' if failure == 'cancelled' else 'failed',
                         stage='cancelled' if failure == 'cancelled' else 'failed',
                         error_code=None if failure == 'cancelled' else failure)
        return bool(failure)

    def _run(self, job):
        process = None
        failure = None
        folder = job['folder']
        try:
            if self._finish_interrupted(job):
                return
            prepare = job.pop('prepare', None)
            if prepare is not None:
                try:
                    supplied = prepare()
                    if self._finish_interrupted(job):
                        return
                    prepared = _prepared(supplied, job['context'])
                    if self._finish_interrupted(job):
                        return
                    self._persist_prepared(job, prepared)
                    # Drop potentially large in-memory source snapshots before analysis.
                    del supplied, prepared
                except InputTooLarge as exc:
                    if not self._finish_interrupted(job):
                        self._update(job, status='failed', stage='failed',
                                     error_code='capture_too_large' if exc.max_bytes == MAX_CAPTURE_BYTES
                                     else 'preparation_failed')
                    return
                except _WorkspaceFull:
                    if not self._finish_interrupted(job):
                        self._update(job, status='failed', stage='failed', error_code='workspace_quota')
                    return
                except Exception:
                    if not self._finish_interrupted(job):
                        self._update(job, status='failed', stage='failed', error_code='preparation_failed')
                    return
            if self._finish_interrupted(job):
                return
            command = [sys.executable, '-I', '-B', str(Path(__file__).with_name('companion_worker.py')),
                       str(self.companion_root / 'tools/evidence_lab/analyze.py'),
                       *(str(folder / name) for name in job['sources']), str(folder / 'case')]
            with (folder / 'analysis.log').open('xb') as log:
                os.chmod(folder / 'analysis.log', 0o600)
                process = subprocess.Popen(command, cwd=folder, stdin=subprocess.DEVNULL,
                                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                           start_new_session=True, close_fds=True,
                                           env={'HOME': str(folder), 'TMPDIR': str(folder),
                                                'LANG': 'C.UTF-8', 'PYTHONDONTWRITEBYTECODE': '1'})
                selector = selectors.DefaultSelector()
                selector.register(process.stdout, selectors.EVENT_READ)
                logged = 0
                try:
                    while process.poll() is None:
                        failure = self._interruption(job)
                        if failure:
                            break
                        root = self._workspace()
                        try:
                            if _usage(root) > MAX_WORKSPACE_BYTES:
                                failure = 'workspace_quota'
                                break
                        finally:
                            os.close(root)
                        self._stage(job)
                        for key, _ in selector.select(timeout=0.1):
                            part = os.read(key.fileobj.fileno(), 65536)
                            if not part:
                                selector.unregister(key.fileobj)
                                continue
                            log.write(part[:max(0, MAX_LOG_BYTES - logged)])
                            logged += len(part)
                            if logged > MAX_LOG_BYTES:
                                failure = 'analysis_failed'
                                break
                        if failure:
                            break
                finally:
                    selector.close()
                    if failure:
                        _stop(process)
                    process.stdout.close()
                    process.wait(timeout=3)
            failure = failure or self._interruption(job)
            if failure == 'cancelled' or job['cancel'].is_set():
                self._update(job, status='cancelled', stage='cancelled')
                return
            if failure or process.returncode != 0:
                self._update(job, status='failed', stage='failed',
                             error_code=failure or 'analysis_failed')
                return
            # Cancellation ends before the verification/commit boundary. Once this
            # stage starts, the operator sees its actual committed result.
            with self._lock:
                if job['cancel'].is_set():
                    self._update_locked(job, status='cancelled', stage='cancelled')
                    return
                self._update_locked(job, stage='verifying')
            try:
                case_id = self.import_callback(folder / 'case')
            except Exception:
                self._update(job, status='failed', stage='failed', error_code='import_failed')
                return
            # The projection is committed even if private custody finalization fails.
            # Retain that case identity and all source snapshots for operator recovery.
            self._update(job, case_id=case_id)
            if self.completion_callback is not None:
                try:
                    self.completion_callback(case_id, folder / 'case',
                                             json.loads(json.dumps(self._metadata(job), allow_nan=False)))
                except Exception:
                    self._update(job, status='failed', stage='failed', error_code='custody_failed')
                    return
            self._update(job, status='complete', stage='complete', case_id=case_id)
        except Exception:
            if process is not None:
                _stop(process)
            self._update(job, status='failed', stage='failed', error_code='analysis_failed')

    def cancel(self, job_id):
        with self._lock:
            job = next((item for item in self._jobs if item['id'] == job_id), None)
            if job is None:
                raise Phase10Error('This analysis job is not in the current session')
            if job['status'] == 'running' and job['stage'] != 'verifying':
                job['cancel'].set()
            return self._public(job)

    def close(self):
        with self._lock:
            self._closed = True
            for job in self._jobs:
                if job['status'] == 'running' and job['stage'] != 'verifying':
                    job['cancel'].set()
            threads = [job['thread'] for job in self._jobs if 'thread' in job]
        for thread in threads:
            thread.join(timeout=35)
        with self._lock:
            if self._closing is None:
                if any(thread.is_alive() for thread in threads):
                    # A slow trusted preparer or commit may outlive shutdown's
                    # bounded join. Keep its lease until it actually finishes.
                    self._closing = threading.Thread(target=self._release_workspace,
                                                     args=(threads,), daemon=True,
                                                     name='honeytrace-analysis-close')
                    self._closing.start()
                else:
                    self._release_lease()

    def _release_workspace(self, threads):
        for thread in threads:
            thread.join()
        with self._lock:
            self._release_lease()

    def _release_lease(self):
        if self._lease is not None:
            os.close(self._lease)
            self._lease = None
