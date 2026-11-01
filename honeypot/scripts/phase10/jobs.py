"""Explicit offline capture jobs through an operator-configured Sentinel checkout."""
import datetime as dt
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

from .io import parse_json, read_regular
from .model import Phase10Error

MAX_CAPTURE_BYTES = 64 * 1024**2
MAX_WORKSPACE_BYTES = 256 * 1024**2
MAX_LOG_BYTES = 1024**2
JOB_TIMEOUT_SECONDS = 120
_DIRECTORY = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
_MAGICS = (b'\xd4\xc3\xb2\xa1', b'\xa1\xb2\xc3\xd4', b'\x4d\x3c\xb2\xa1',
           b'\xa1\xb2\x3c\x4d', b'\x0a\x0d\x0d\x0a')
_PUBLIC = ('id', 'status', 'stage', 'error_code', 'case_id', 'created_at', 'updated_at')


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
                os.mkdir(part, 0o700, dir_fd=descriptor)
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
    total = entries = 0
    pending = [os.dup(descriptor)]
    try:
        while pending:
            current = pending.pop()
            try:
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
                            try:
                                pending.append(os.open(child.name, _DIRECTORY, dir_fd=current))
                            except FileNotFoundError:
                                continue
                        elif stat.S_ISREG(info.st_mode) and info.st_nlink == 1:
                            total += info.st_size
                        else:
                            raise Phase10Error('Unsupported job workspace entry')
            finally:
                os.close(current)
        return total
    finally:
        for descriptor in pending:
            os.close(descriptor)


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

    def __init__(self, companion_root, workspace_path, import_callback, logger=None):
        self.companion_root = Path(companion_root).absolute() if companion_root else None
        self.workspace_path = Path(workspace_path).absolute()
        self.import_callback = import_callback
        self.logger = logger
        self._lock = threading.Lock()
        self._jobs = []
        self._closed = False
        self._history_error = False
        self._reconciled = 0
        self._load_history()

    def _load_history(self):
        try:
            root = _directory(self.workspace_path)
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
                                                  'workspace_quota', 'import_failed', 'analysis_interrupted') or
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
            root = _directory(self.workspace_path)
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

    def start(self, input_path):
        if os.geteuid() == 0 or not self.available():
            raise Phase10Error('Configure an unprivileged Sentinel companion before analyzing captures')
        if (not isinstance(input_path, str) or not 1 <= len(input_path) <= 4096 or
                not Path(input_path).is_absolute() or any(ord(c) < 32 for c in input_path)):
            raise Phase10Error('Choose an absolute local capture path')
        with self._lock:
            if self._closed:
                raise Phase10Error('The analysis session is closed')
            if self._history_error:
                raise Phase10Error('Private analysis history is unavailable; check the job workspace')
            if any(job['status'] == 'running' for job in self._jobs):
                raise Phase10Error('A capture is already being analyzed; wait or cancel it first')
            raw = read_regular(input_path, MAX_CAPTURE_BYTES)
            if len(raw) < 12 or raw[:4] not in _MAGICS:
                raise Phase10Error('Choose a PCAP or PCAPNG capture file')
            root = _directory(self.workspace_path, create=True)
            try:
                if _usage(root) + len(raw) > MAX_WORKSPACE_BYTES:
                    raise Phase10Error('Private job workspace is full; preserve or move completed cases first')
                identifier = secrets.token_hex(16)
                os.mkdir(identifier, 0o700, dir_fd=root)
                folder = self.workspace_path / identifier
                fd = os.open(folder / 'capture.pcap', os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                             os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
                with os.fdopen(fd, 'wb') as stream:
                    stream.write(raw)
                    stream.flush()
                    os.fsync(stream.fileno())
            finally:
                os.close(root)
            now = _utc()
            job = {'id': identifier, 'status': 'running', 'stage': 'starting',
                   'error_code': None, 'case_id': None, 'created_at': now, 'updated_at': now,
                   'folder': folder, 'cancel': threading.Event(), 'started': time.monotonic()}
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

    def _run(self, job):
        process = None
        failure = None
        folder = job['folder']
        try:
            command = [sys.executable, '-I', '-B', str(Path(__file__).with_name('companion_worker.py')),
                       str(self.companion_root / 'tools/evidence_lab/analyze.py'),
                       str(folder / 'capture.pcap'), str(folder / 'case')]
            with (folder / 'analysis.log').open('xb') as log:
                os.chmod(folder / 'analysis.log', 0o600)
                process = subprocess.Popen(command, cwd=folder, stdin=subprocess.DEVNULL,
                                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                           start_new_session=True, close_fds=True,
                                           env={'HOME': str(folder), 'TMPDIR': str(folder),
                                                'LANG': 'C.UTF-8', 'PYTHONDONTWRITEBYTECODE': '1'})
                selector = selectors.DefaultSelector()
                selector.register(process.stdout, selectors.EVENT_READ)
                started, logged = time.monotonic(), 0
                try:
                    while process.poll() is None:
                        if job['cancel'].is_set():
                            failure = 'cancelled'
                            break
                        if time.monotonic() - started > JOB_TIMEOUT_SECONDS:
                            failure = 'analysis_timeout'
                            break
                        root = _directory(self.workspace_path)
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
            self._update(job, status='complete', stage='complete', case_id=case_id)
        except Exception:
            if process is not None:
                _stop(process)
            self._update(job, status='failed', stage='failed', error_code='analysis_failed')
        finally:
            try:
                (folder / 'capture.pcap').unlink()
            except OSError:
                pass

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
