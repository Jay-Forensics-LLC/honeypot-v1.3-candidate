#!/usr/bin/env python3
"""Collect a bounded, read-only Ubuntu guest baseline; never issue acceptance."""
import argparse
import base64
import datetime
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import selectors
import shlex
import shutil
import signal
import stat
import subprocess
import time
import uuid

COMMAND_PATH = '/usr/sbin:/usr/bin:/sbin:/bin'
PACKAGE_FORMAT = '${binary:Package}\t${Version}\t${Architecture}\t${db:Status-Abbrev}\n'
PACKAGE_QUERY = ['dpkg-query', '-W', '-f=' + PACKAGE_FORMAT]
REQUIRED_PACKAGES = ('python3', 'python3.12', 'python3-yaml', 'docker.io', 'docker-ce',
                     'docker-compose-v2', 'docker-compose-plugin', 'chrony', 'nftables',
                     'tcpdump', 'tshark', 'logrotate')


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def read_file(path, limit):
    """Bound regular and kernel pseudo-file reads; reject symlinked inputs."""
    path = Path(path)
    before = path.lstat()
    if path.resolve() != path.absolute() or not stat.S_ISREG(before.st_mode) or before.st_size > limit:
        raise ValueError('Unsafe or oversized fact input: ' + str(path))
    signature = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        if signature(os.fstat(stream.fileno())) != signature(before):
            raise ValueError('Fact input changed before read')
        data = stream.read(limit + 1)
        after = os.fstat(stream.fileno())
    if len(data) > limit or signature(after) != signature(before) or signature(path.lstat()) != signature(before):
        raise ValueError('Fact input changed or exceeded its read bound')
    return data


def run_command(argv, *, timeout=10, stdout_limit=8 * 1024**2, stderr_limit=64 * 1024):
    """Drain both pipes within time/byte limits, retaining exact partial bytes."""
    result = {'command': argv, 'status': 'NOT_INSTALLED', 'exit_code': None}
    executable = shutil.which(argv[0], path=COMMAND_PATH)
    if executable is None:
        return result
    captured = {'stdout': bytearray(), 'stderr': bytearray()}
    limits = {'stdout': stdout_limit, 'stderr': stderr_limit}
    deadline = time.monotonic() + timeout
    env = {'PATH': COMMAND_PATH, 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'PYTHONDONTWRITEBYTECODE': '1'}
    process = subprocess.Popen([executable, *argv[1:]], stdin=subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               env=env, start_new_session=True)
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ, 'stdout')
            selector.register(process.stderr, selectors.EVENT_READ, 'stderr')
            while selector.get_map():
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError('Fact command deadline exceeded')
                for key, _ in selector.select(remaining):
                    name = key.data
                    chunk = os.read(key.fileobj.fileno(), min(65536, limits[name] - len(captured[name]) + 1))
                    if not chunk:
                        selector.unregister(key.fileobj)
                        continue
                    captured[name].extend(chunk)
                    if len(captured[name]) > limits[name]:
                        result['status'] = 'OUTPUT_LIMIT'
                        raise ValueError('Fact command output limit exceeded')
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError('Fact command deadline exceeded')
            result['exit_code'] = process.wait(timeout=remaining)
            result['status'] = 'OK' if result['exit_code'] == 0 else 'EXIT_NONZERO'
    except (TimeoutError, subprocess.TimeoutExpired):
        result['status'] = 'TIMEOUT'
    except ValueError:
        if result['status'] != 'OUTPUT_LIMIT':
            raise
    finally:
        if result['status'] in ('TIMEOUT', 'OUTPUT_LIMIT') or process.poll() is None:
            # Only this newly launched read-only query group, never a service.
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        process.wait(timeout=5)
        process.stdout.close()
        process.stderr.close()
    for name, value in captured.items():
        raw = bytes(value)
        result[name + '_base64'] = base64.b64encode(raw).decode('ascii')
        result[name + '_bytes'] = len(raw)
        result[name + '_sha256'] = sha256(raw)
    return result


def output(result):
    return base64.b64decode(result.get('stdout_base64', ''), validate=True)


def parse_release(raw):
    fields = {}
    for line in raw.decode('utf-8').splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        key, separator, value = line.partition('=')
        tokens = shlex.split(value, comments=True)
        if not separator or not re.fullmatch(r'[A-Z][A-Z0-9_]*', key) or key in fields or len(tokens) != 1:
            raise ValueError('Invalid or duplicate OS release field')
        fields[key] = tokens[0]
    return fields


def parse_packages(raw):
    if not raw or not raw.endswith(b'\n'):
        raise ValueError('Empty or incomplete dpkg inventory')
    packages = {}
    lines = raw.decode('utf-8').splitlines()
    if len(lines) > 20000:
        raise ValueError('dpkg row limit exceeded')
    for line in lines:
        fields = line.split('\t')
        if len(fields) != 4 or not all(fields[:3]) or len(fields[3]) != 3 or fields[0] in packages:
            raise ValueError('Malformed or duplicate dpkg inventory row')
        packages[fields[0]] = dict(zip(('version', 'architecture', 'status'), fields[1:]))
    return packages


def pending_updates():
    root = Path('/var/lib/dpkg/updates')
    if root.is_symlink():
        raise ValueError('Symlinked dpkg updates directory')
    entries = []
    with os.scandir(root) as children:
        for child in children:
            entries.append(child.name)
            if len(entries) > 128:
                raise ValueError('dpkg updates inventory bound exceeded')
    return sorted(entries)


def collect(expected_vm_uuid, *, reader=read_file, runner=run_command,
            updates=pending_updates, host=None):
    report = {'schema': 1, 'scope': 'Private read-only native baseline; no installation or acceptance verdict',
              'utc_reported_not_independently_synchronized': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'collection_status': 'INCOMPLETE', 'commands': [], 'errors': [],
              'B17_passed': False, 'phase7_gate': 'BLOCKED', 'phase8_gate': 'BLOCKED'}
    deadline = time.monotonic() + 45

    def command(argv, required=True):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise ValueError('Collection command budget exceeded')
        result = runner(argv, timeout=min(10, remaining))
        report['commands'].append(result)
        if result['status'] in ('TIMEOUT', 'OUTPUT_LIMIT'):
            raise ValueError('Fact command exceeded its time or output bound: ' + argv[0])
        if required and (result['status'] != 'OK' or base64.b64decode(result.get('stderr_base64', ''), validate=True).strip()):
            raise ValueError('Required fact command incomplete: ' + argv[0])
        return result

    try:
        expected = str(uuid.UUID(expected_vm_uuid))
        release = parse_release(reader('/usr/lib/os-release', 65536))
        host = host or {'system': platform.system(), 'machine': platform.machine(),
                        'implementation': platform.python_implementation(), 'python': list(platform.python_version_tuple())}
        report['os_release'] = release
        report['host'] = host
        if (release.get('ID') != 'ubuntu' or release.get('VERSION_ID') != '24.04'
                or host['system'] != 'Linux' or host['machine'] != 'x86_64'
                or host['implementation'] != 'CPython' or host['python'][:2] != ['3', '12']):
            raise ValueError('Requires native Ubuntu 24.04 x86_64 / CPython 3.12 guest')
        actual_uuid = str(uuid.UUID(reader('/sys/devices/virtual/dmi/id/product_uuid', 4096).decode('ascii').strip()))
        report['vm_uuid'] = actual_uuid
        report['expected_vm_uuid'] = expected
        if actual_uuid != expected:
            raise ValueError('Guest VM UUID differs from reviewed target')
        for name, path, pattern in (
                ('machine_id', '/etc/machine-id', r'[0-9a-f]{32}'),
                ('boot_id', '/proc/sys/kernel/random/boot_id', r'[0-9a-f-]{36}')):
            value = reader(path, 128).decode('ascii').strip()
            if not re.fullmatch(pattern, value) or (name == 'machine_id' and value == '0' * 32):
                raise ValueError('Invalid native ' + name)
            if name == 'boot_id':
                value = str(uuid.UUID(value))
            report[name] = value
        virt = output(command(['systemd-detect-virt', '--vm'])).strip()
        if virt not in (b'kvm', b'qemu'):
            raise ValueError('Native target is not a QEMU/KVM VM')
        if output(command(['dpkg', '--print-architecture'])).strip() != b'amd64':
            raise ValueError('Native package architecture is not amd64')
        if updates():
            raise ValueError('Pending dpkg updates block stable baseline acquisition')
        status_before = reader('/var/lib/dpkg/status', 32 * 1024**2)
        first = command(PACKAGE_QUERY)
        packages = parse_packages(output(first))
        report['package_count'] = len(packages)
        report['required_package_observations'] = {
            name: packages.get(name, packages.get(name + ':amd64', {'status': 'NOT_PRESENT'}))
            for name in REQUIRED_PACKAGES}
        audit = command(['dpkg', '--audit'])
        if output(audit).strip():
            raise ValueError('dpkg audit reports incomplete package state')
        second = command(PACKAGE_QUERY)
        status_after = reader('/var/lib/dpkg/status', 32 * 1024**2)
        report['dpkg_status_sha256_before'] = sha256(status_before)
        report['dpkg_status_sha256_after'] = sha256(status_after)
        if status_before != status_after or output(first) != output(second) or updates():
            raise ValueError('Package database changed during baseline collection')
        for argv in (['docker', '--version'], ['docker', 'compose', 'version'],
                     ['findmnt', '--json', '--target', '/'],
                     ['timedatectl', 'show', '-p', 'NTPSynchronized', '-p', 'NTP', '-p', 'Timezone']):
            command(argv, required=False)
        if reader('/var/lib/dpkg/status', 32 * 1024**2) != status_after or updates():
            raise ValueError('Package database changed before collection completed')
        if reader('/proc/sys/kernel/random/boot_id', 128).decode('ascii').strip() != report['boot_id']:
            raise ValueError('Boot identity changed during collection')
        report['collection_status'] = 'COMPLETE_BASELINE_ONLY'
    except (OSError, ValueError, UnicodeError, subprocess.SubprocessError) as error:
        report['errors'].append({'type': type(error).__name__, 'message': str(error)})
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected-vm-uuid', required=True, help='UUID from the separately reviewed VM transaction')
    args = parser.parse_args()
    report = collect(args.expected_vm_uuid)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report['collection_status'] == 'COMPLETE_BASELINE_ONLY' else 2


if __name__ == '__main__':
    raise SystemExit(main())
