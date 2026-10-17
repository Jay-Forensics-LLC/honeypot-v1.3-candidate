"""Synthetic comparison fixtures; no retained reports or target filesystem reads."""
import hashlib


def identity(label):
    return hashlib.sha256(('synthetic-qualification-' + label).encode()).hexdigest()


def snapshot():
    placement = {
        'cowrie': [('honeypot-cowrie-net', '192.0.2.2')],
        'opencanary': [('honeypot-canary-net', '198.51.100.2')],
        'suricata': [],
        'incidentd': [('honeypot-observability', '203.0.113.2')],
        'alloy': [('honeypot-observability', '203.0.113.3')],
        'loki': [('honeypot-observability', '203.0.113.4')],
        'grafana': [('honeypot-observability', '203.0.113.5'),
                    ('honeypot-management', '192.0.2.130')],
    }
    network_specs = {
        'honeypot-cowrie-net': ('192.0.2.0/24', '192.0.2.1', False),
        'honeypot-canary-net': ('198.51.100.0/24', '198.51.100.1', False),
        'honeypot-observability': ('203.0.113.0/24', '', True),
        'honeypot-management': ('192.0.2.128/25', '192.0.2.129', False),
    }
    networks = {
        name: {'Name': name, 'Id': identity(name), 'Driver': 'bridge',
               'Scope': 'local', 'EnableIPv4': True, 'EnableIPv6': False,
               'Internal': internal, 'Attachable': False, 'Ingress': False,
               'IPAM': {'Config': [{'Subnet': cidr, 'Gateway': gateway}]},
               'Options': {}, 'Containers': {}}
        for name, (cidr, gateway, internal) in network_specs.items()
    }
    containers = {}
    for index, (name, attachments) in enumerate(placement.items(), 1):
        endpoints = {}
        for net_name, ip in attachments:
            _, gateway, _ = network_specs[net_name]
            prefix = 25 if net_name == 'honeypot-management' else 24
            mac = '02:00:00:00:00:%02x' % index
            endpoints[net_name] = {
                'NetworkID': identity(net_name), 'EndpointID': identity(name + net_name),
                'IPAddress': ip, 'IPPrefixLen': prefix, 'Gateway': gateway,
                'MacAddress': mac, 'Aliases': [name, 'synthetic-' + name],
                'GlobalIPv6Address': '', 'GlobalIPv6PrefixLen': 0,
                'IPv6Gateway': '', 'DriverOpts': None, 'GwPriority': 0,
            }
            networks[net_name]['Containers'][identity(name)] = {
                'Name': 'synthetic-' + name,
                'EndpointID': identity(name + net_name),
                'MacAddress': mac, 'IPv4Address': ip + '/' + str(prefix),
            }
        ports = {'3000/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '3000'}]} if name == 'grafana' else {}
        containers[name] = {
            'Id': identity(name), 'Image': 'sha256:' + identity('image-' + name),
            'Created': 'synthetic-created', 'RestartCount': 0,
            'State': {'StartedAt': 'synthetic-start', 'Running': True,
                      'Health': {'Status': 'healthy'}},
            'Config': {'Env': ['FIXTURE_ONLY=1'], 'MacAddress': '', 'User': 'fixture'},
            'HostConfig': {'PortBindings': ports, 'Privileged': False,
                           'ReadonlyRootfs': True, 'CapDrop': ['ALL']},
            'Mounts': [{'Source': '/synthetic/' + name + '/state',
                        'Destination': '/state', 'RW': True, 'Type': 'bind',
                        'Propagation': 'rprivate'},
                       {'Source': '/synthetic/' + name + '/config',
                        'Destination': '/config', 'RW': False, 'Type': 'bind',
                        'Propagation': 'rprivate'}],
            'NetworkSettings': {'Networks': endpoints},
        }
    return {'containers': containers, 'networks': list(networks.values()),
            'guard': {'fingerprint': identity('guard'), 'policy': {'ok': True},
                      'rules': [{'packets': 0}]},
            'pcap': {'pid': 123, 'start_ticks': 456, 'argv': ['synthetic-capture']},
            'pcap_service_active': True, 'wan_loopback_safe': True}


def loki_history():
    return {'tests': [
        {'id': 'synthetic-' + str(i), 'start_epoch': i,
         'normalized': [{'source': source, 'event_id': identity('event-' + str(i))}]}
        for i, source in enumerate(('opencanary', 'cowrie', 'opencanary', 'cowrie'), 1)
    ]}


def compose_text():
    return 'services:\n' + ''.join('  ' + name + ': {}\n' for name in snapshot()['containers'])
