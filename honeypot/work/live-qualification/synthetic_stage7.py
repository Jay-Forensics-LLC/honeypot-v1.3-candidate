"""Constructed unit-test data. No retained packets, logs, runtime or evidence."""
import copy


def snapshot():
    placements = {
        'cowrie': ('honeypot-cowrie-net',),
        'opencanary': ('honeypot-canary-net',),
        'suricata': ('host',),
        'incidentd': ('honeypot-observability',),
        'loki': ('honeypot-observability',),
        'alloy': ('honeypot-observability',),
        'grafana': ('honeypot-management', 'honeypot-observability'),
    }
    subnets = {'honeypot-cowrie-net': '172.29.40', 'honeypot-canary-net': '172.29.41',
               'honeypot-observability': '172.29.42', 'honeypot-management': '172.29.43',
               'host': ''}
    containers = {}
    networks = []
    for name, prefix in subnets.items():
        networks.append({'Name': name, 'Id': 'unit-network-' + name, 'Created': 'unit-created',
                         'Driver': 'host' if name == 'host' else 'bridge', 'Scope': 'local',
                         'EnableIPv4': True, 'EnableIPv6': False,
                         'Internal': name == 'honeypot-observability', 'Attachable': False,
                         'Ingress': False, 'IPAM': {'Config': [{'Subnet': prefix + '.0/24'}] if prefix else []},
                         'Options': {}, 'ConfigFrom': {'Network': ''}, 'ConfigOnly': False,
                         'Containers': {}})
    for index, (service, names) in enumerate(placements.items(), 2):
        cid = format(index, '064x')
        endpoints = {}
        for name in names:
            prefix = subnets[name]
            address = prefix + '.' + str(index) if prefix else ''
            endpoint = {'NetworkID': 'unit-network-' + name, 'EndpointID': 'unit-endpoint-' + cid,
                        'IPAddress': address, 'IPPrefixLen': 24 if prefix else 0,
                        'GlobalIPv6Address': '', 'GlobalIPv6PrefixLen': 0,
                        'Gateway': '', 'IPv6Gateway': '', 'MacAddress': '02:00:00:00:00:' + format(index, '02x'),
                        'Aliases': ['honeypot-' + service, service], 'DriverOpts': None,
                        'GwPriority': 0, 'IPAMConfig': None}
            endpoints[name] = endpoint
            network = next(n for n in networks if n['Name'] == name)
            network['Containers'][cid] = {'Name': 'honeypot-' + service, 'EndpointID': endpoint['EndpointID'],
                                          'MacAddress': endpoint['MacAddress'],
                                          'IPv4Address': address + '/24' if address else '', 'IPv6Address': ''}
        containers[service] = {'Id': cid, 'Image': 'unit-image-' + service, 'Created': 'unit-created',
            'RestartCount': 0, 'State': {'StartedAt': 'unit-started', 'Running': True, 'Health': {'Status': 'healthy'}},
            'Config': {'Image': 'unit-tag', 'Env': ['SYNTHETIC=true'], 'User': 'unit-user',
                       'WorkingDir': '/unit', 'Entrypoint': ['unit-entrypoint'], 'Cmd': ['unit-command'],
                       'Healthcheck': {'Test': ['CMD', 'unit-health']}},
            'HostConfig': {'ReadonlyRootfs': True, 'CapDrop': ['ALL'], 'CapAdd': [],
                           'SecurityOpt': ['no-new-privileges:true'], 'GroupAdd': [], 'Tmpfs': {},
                           'NetworkMode': names[0], 'Privileged': False,
                           'PortBindings': {'3000/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '3000'}]} if service == 'grafana' else {},
                           'Dns': [], 'DnsOptions': [], 'DnsSearch': [], 'Memory': 1,
                           'NanoCpus': 1, 'PidsLimit': 10, 'RestartPolicy': {'Name': 'on-failure'}},
            'Mounts': [{'Type': 'bind', 'Source': '/unit/config', 'Destination': '/unit/config',
                        'RW': True, 'Propagation': 'rprivate'},
                       {'Type': 'bind', 'Source': '/unit/state', 'Destination': '/unit/state',
                        'RW': True, 'Propagation': 'rprivate'}],
            'AppArmorProfile': 'unit-apparmor', 'NetworkSettings': {'Networks': endpoints}}
    return {'containers': containers, 'networks': networks,
            'guard': {'fingerprint': 'unit-guard', 'policy': {'ok': True},
                      'rules': [{'packets': 0, 'bytes': 0, 'expression': 'unit-drop'}]},
            'pcap': {'pid': 123, 'start_ticks': 456, 'argv': ['unit-dumpcap']},
            'pcap_service_active': True, 'wan_loopback_safe': True}


def mount_order_pair():
    old = snapshot()
    current = copy.deepcopy(old)
    current['containers']['incidentd']['Mounts'].reverse()
    return old, current


def loki_report():
    return {'tests': [{'id': 'unit-' + str(i), 'start_epoch': 1700000000 + i, 'normalized': [
        {'source': source, 'event_id': 'unit-event-' + str(i)}]}
        for i, source in enumerate(('opencanary', 'cowrie', 'opencanary', 'cowrie'))]}
