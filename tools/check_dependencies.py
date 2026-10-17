#!/usr/bin/env python3
"""Check dependency declarations without Docker, network access or installation."""
import json
from pathlib import Path
import re

import yaml

ROOT = Path(__file__).resolve().parents[1]
SERVICES = {'COWRIE_IMAGE': 'cowrie', 'LOKI_IMAGE': 'loki',
            'ALLOY_IMAGE': 'alloy', 'GRAFANA_IMAGE': 'grafana'}
BUILDS = {'PYTHON_IMAGE': ('opencanary', 'incidentd'), 'UBUNTU_IMAGE': ('suricata',)}
PIN = re.compile(r'[a-z0-9][a-z0-9./_-]*:[\w.-]+@sha256:[0-9a-f]{64}')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def fallback(value, key):
    require(isinstance(value, str), f'{key}: missing image reference')
    match = re.fullmatch(r'\$\{' + re.escape(key) + r':-(.+)\}', value)
    require(match is not None, f'{key}: expected an explicit Compose fallback')
    return match.group(1)


def check(root=ROOT):
    app = Path(root) / 'honeypot'
    env = dict(line.split('=', 1) for line in (app / '.env.example').read_text().splitlines()
               if line and not line.startswith('#'))
    compose = yaml.safe_load((app / 'docker-compose.yml').read_text())
    for key in SERVICES.keys() | BUILDS.keys():
        require(PIN.fullmatch(env.get(key, '')) is not None, f'{key}: tag and SHA-256 pin required')
    for key, service in SERVICES.items():
        actual = fallback(compose['services'][service]['image'], key)
        require(actual == env[key], f'{key}: Compose fallback differs from .env.example')
    for key, services in BUILDS.items():
        for service in services:
            build = compose['services'][service]['build']
            require(fallback(build['args'][key], key) == env[key],
                    f'{key}: {service} build argument differs from .env.example')
            dockerfile = app / build['dockerfile']
            match = re.search(r'^ARG ' + key + r'=(.+)$', dockerfile.read_text(), re.MULTILINE)
            require(match is not None and match.group(1) == env[key],
                    f'{key}: {service} Dockerfile default differs from .env.example')
    metadata = json.loads((app / 'docs/IMAGE_REFERENCES.json').read_text())['images']
    references = {row['reference'] for row in metadata}
    require(len(references) == len(metadata), 'Duplicate image metadata references')
    require(references == {env[key] for key in SERVICES.keys() | BUILDS.keys()},
            'Image-reference metadata differs from declared pins; registry observations need separate verification')
    for row in metadata:
        require(row['reference'] == row['image'] + '@' + row['digest'], 'Inconsistent image metadata')
    build = compose['services']['opencanary']['build']
    context = (app / build['context']).resolve()
    requirement = context / 'docker/opencanary/requirements.txt'
    require(requirement.is_file() and requirement.resolve().is_relative_to(context),
            'OpenCanary requirements absent from build context')
    require(re.fullmatch(r'opencanary==\d+\.\d+\.\d+\n', requirement.read_text()) is not None,
            'OpenCanary requires an explicit direct version pin')
    print('PASS: six image pins agree across Compose, example environment, Dockerfiles and image metadata')
    return True


if __name__ == '__main__':
    check()
