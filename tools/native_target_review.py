#!/usr/bin/env python3
"""Check a closed native-facts transport offline; never issue installation acceptance."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import uuid

HEADER = b'HONEYTRACE_NATIVE_FACTS_V1\n'
TRAILER = b'\nHONEYTRACE_NATIVE_FACTS_END\n'
MAX_BODY = 32 * 1024**2
PACKAGE_QUERY = ['dpkg-query', '-W', '-f=${binary:Package}\t${Version}\t${Architecture}\t${db:Status-Abbrev}\n']
COMMANDS = [['systemd-detect-virt', '--vm'], ['dpkg', '--print-architecture'],
            PACKAGE_QUERY, ['dpkg', '--audit'], PACKAGE_QUERY,
            ['docker', '--version'], ['docker', 'compose', 'version'],
            ['findmnt', '--json', '--target', '/']]
PACKAGES = ('python3', 'python3.12', 'python3-yaml', 'docker.io', 'docker-ce',
            'docker-compose-v2', 'docker-compose-plugin', 'chrony', 'nftables',
            'tcpdump', 'tshark', 'logrotate')
LOCK_PATHS = ['/var/lib/dpkg/lock-frontend', '/var/lib/dpkg/lock']


def require(value, message):
    if not value:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def valid_digest(value):
    return isinstance(value, str) and re.fullmatch(r'[0-9a-f]{64}', value) is not None


def strict_json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'Duplicate JSON field')
            result[key] = value
        return result

    def invalid_constant(value):
        raise ValueError('Non-finite JSON number')

    try:
        return json.loads(raw.decode('utf-8'), object_pairs_hook=pairs, parse_constant=invalid_constant)
    except (UnicodeError, RecursionError) as error:
        raise ValueError('Invalid JSON encoding or nesting') from error


def uuid_text(value):
    require(isinstance(value, str), 'Missing UUID')
    parsed = uuid.UUID(value)
    require(parsed.int != 0 and str(parsed) == value, 'Noncanonical or zero UUID')
    return value


def command_bytes(row, name):
    limit = 8 * 1024**2 if name == 'stdout' else 64 * 1024
    encoded = row.get(name + '_base64')
    count = row.get(name + '_bytes')
    require(isinstance(encoded, str) and len(encoded) <= 4 * ((limit + 2) // 3), 'Missing or oversized command bytes')
    raw = base64.b64decode(encoded, validate=True)
    require(type(count) is int and count == len(raw) <= limit
            and row.get(name + '_sha256') == digest(raw), 'Command byte count/digest mismatch')
    return raw


def inventory(raw):
    require(raw and raw.endswith(b'\n'), 'Missing or incomplete package inventory')
    lines = raw.decode('utf-8').splitlines()
    require(len(lines) <= 20000, 'Package inventory row bound exceeded')
    result = {}
    for line in lines:
        fields = line.split('\t')
        require(len(fields) == 4 and all(fields[:3]) and len(fields[3]) == 3
                and fields[0] not in result, 'Malformed or duplicate package inventory row')
        result[fields[0]] = dict(zip(('version', 'architecture', 'status'), fields[1:]))
    return result


def check_baseline(report, expected_vm_uuid):
    require(type(report.get('schema')) is int and report['schema'] == 1, 'Unknown report schema')
    require(report.get('vm_uuid') == report.get('expected_vm_uuid') == expected_vm_uuid, 'Native target UUID mismatch')
    release = report.get('os_release')
    host = report.get('host')
    require(isinstance(release, dict) and release.get('ID') == 'ubuntu'
            and release.get('VERSION_ID') == '24.04', 'Unsupported native OS')
    require(isinstance(host, dict) and host.get('system') == 'Linux' and host.get('machine') == 'x86_64'
            and host.get('implementation') == 'CPython' and isinstance(host.get('python'), list)
            and len(host['python']) == 3 and host['python'][:2] == ['3', '12']
            and all(isinstance(v, str) and v.isdigit() for v in host['python']), 'Unsupported native Python/platform')
    machine = report.get('machine_id')
    require(isinstance(machine, str) and re.fullmatch(r'[0-9a-f]{32}', machine) is not None
            and machine != '0' * 32, 'Missing or invalid machine identity')
    uuid_text(report.get('boot_id'))
    require(report.get('errors') == [] and report.get('package_transaction_window_reserved') is False,
            'Incomplete report or unsupported package transaction claim')
    rows = report.get('commands')
    require(isinstance(rows, list) and len(rows) == len(COMMANDS), 'Missing or extra native queries')
    outputs = []
    for index, (row, expected) in enumerate(zip(rows, COMMANDS)):
        require(isinstance(row, dict) and row.get('command') == expected, 'Native query order/arguments differ')
        status = row.get('status')
        if index >= 5 and status == 'NOT_INSTALLED':
            require(set(row) == {'command', 'status', 'exit_code'} and row['exit_code'] is None,
                    'Missing-tool record contains incompatible execution data')
            outputs.append(None)
            continue
        code = row.get('exit_code')
        require(type(code) is int and ((status == 'OK' and code == 0)
                or (index >= 5 and status == 'EXIT_NONZERO' and code != 0)), 'Incomplete native query status')
        require(row.get('cleanup_status') == 'COMPLETE' and row.get('process_reaped') is True
                and type(row.get('pid')) is int and row['pid'] > 0, 'Missing or incomplete query cleanup')
        stdout = command_bytes(row, 'stdout')
        stderr = command_bytes(row, 'stderr')
        require(index >= 5 or (status == 'OK' and not stderr.strip()), 'Required query failed or emitted diagnostics')
        outputs.append(stdout)
    require(outputs[0].strip() in (b'kvm', b'qemu') and outputs[1].strip() == b'amd64',
            'Virtualization or package architecture mismatch')
    require(not outputs[3].strip(), 'dpkg audit reports incomplete package state')
    require(outputs[2] == outputs[4], 'Repeated package inventories differ')
    packages = inventory(outputs[2])
    require(type(report.get('package_count')) is int and report['package_count'] == len(packages),
            'Package count differs from retained inventory')
    required = {name: packages.get(name, packages.get(name + ':amd64', {'status': 'NOT_PRESENT'}))
                for name in PACKAGES}
    require(report.get('required_package_observations') == required, 'Package observations differ from retained inventory')
    before = report.get('dpkg_status_sha256_before')
    require(valid_digest(before) and before == report.get('dpkg_status_sha256_after'), 'Package status digests missing/different')
    probes = report.get('package_lock_observations')
    require(isinstance(probes, list) and len(probes) == 5, 'Missing package lock observations')
    identities = None
    for probe in probes:
        require(isinstance(probe, list) and len(probe) == 2, 'Incomplete package lock observation')
        for row, path in zip(probe, LOCK_PATHS):
            require(isinstance(row, dict) and row.get('path') == path and row.get('locked') is False
                    and type(row.get('lock_type')) is int and row['lock_type'] == 2
                    and row.get('holder_pid') is None, 'Package lock unavailable or held')
            require(all(type(row.get(k)) is int and row[k] >= 0 for k in ('device', 'inode', 'whence', 'start', 'length'))
                    and row['inode'] > 0 and row['whence'] == row['start'] == row['length'] == 0,
                    'Invalid package lock identity/range')
        current = [(row['device'], row['inode']) for row in probe]
        if identities is None:
            identities = current
        require(current == identities, 'Package lock files changed between observations')
    return len(packages)


def review_transport(data, *, expected_vm_uuid, expected_collector_sha256):
    expected_vm_uuid = uuid_text(expected_vm_uuid)
    require(valid_digest(expected_collector_sha256), 'External reviewed collector digest required')
    require(isinstance(data, bytes) and len(data) <= MAX_BODY + 1024
            and data.startswith(HEADER) and data.endswith(TRAILER), 'Incomplete, oversized or unframed transport')
    metadata_bytes, separator, rest = data[len(HEADER):].partition(b'\n')
    require(separator and len(metadata_bytes) <= 512, 'Incomplete or oversized transport metadata')
    metadata = strict_json(metadata_bytes)
    require(isinstance(metadata, dict), 'Transport metadata is not an object')
    body = rest[:-len(TRAILER)]
    require(type(metadata.get('bytes')) is int and 0 < len(body) <= MAX_BODY
            and metadata['bytes'] == len(body) and metadata.get('sha256') == digest(body)
            and metadata.get('collector_sha256') == expected_collector_sha256
            and type(metadata.get('exit_code')) is int, 'Transport count/digest/source/status mismatch')
    report = strict_json(body)
    require(isinstance(report, dict), 'Native report is not an object')
    require(report.get('B17_passed') is False and report.get('phase7_gate') == 'BLOCKED'
            and report.get('phase8_gate') == 'BLOCKED', 'Unsupported acceptance claim in baseline-only report')
    summary = {'schema': 1, 'transport': 'COMPLETE', 'transport_sha256': digest(data),
               'body_sha256': digest(body), 'body_bytes': len(body),
               'collector_sha256': expected_collector_sha256, 'collector_exit_code': metadata['exit_code'],
               'collection_status': report.get('collection_status'), 'complete_baseline_only': False,
               'review_status': 'INCOMPLETE_BASELINE', 'errors': [],
               'B17_passed': False, 'phase7_gate': 'BLOCKED', 'phase8_gate': 'BLOCKED'}
    try:
        require(metadata['exit_code'] == 0 and report.get('collection_status') == 'COMPLETE_BASELINE_ONLY',
                'Collector did not complete a baseline')
        count = check_baseline(report, expected_vm_uuid)
        summary.update({'review_status': 'CONSISTENT_BASELINE_ONLY', 'complete_baseline_only': True,
                        'vm_uuid': expected_vm_uuid, 'machine_id': report['machine_id'],
                        'boot_id': report['boot_id'], 'package_count': count})
    except (ValueError, UnicodeError) as error:
        summary['errors'].append(str(error))
    return summary


def read_closed_log(path):
    path = Path(path).absolute()
    before = path.lstat()
    require(path.resolve() == path and stat.S_ISREG(before.st_mode)
            and before.st_size <= MAX_BODY + 1024, 'Unsafe or oversized transport file')
    signature = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        require(signature(os.fstat(stream.fileno())) == signature(before), 'Transport file replaced before read')
        data = stream.read(MAX_BODY + 1025)
        require(signature(os.fstat(stream.fileno())) == signature(before), 'Transport file changed during read')
    require(len(data) == before.st_size and signature(path.lstat()) == signature(before)
            and path.resolve() == path, 'Transport file changed during read')
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('closed_log', type=Path)
    parser.add_argument('--expected-vm-uuid', required=True)
    parser.add_argument('--expected-collector-sha256', required=True)
    args = parser.parse_args()
    try:
        summary = review_transport(read_closed_log(args.closed_log), expected_vm_uuid=args.expected_vm_uuid,
                                   expected_collector_sha256=args.expected_collector_sha256)
    except (OSError, ValueError, RecursionError) as error:
        summary = {'review_status': 'INVALID_TRANSPORT', 'complete_baseline_only': False,
                   'errors': [str(error)], 'B17_passed': False, 'phase7_gate': 'BLOCKED', 'phase8_gate': 'BLOCKED'}
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0 if summary['complete_baseline_only'] else 2


if __name__ == '__main__':
    raise SystemExit(main())
