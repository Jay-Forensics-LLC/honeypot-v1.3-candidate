"""Explicit local Phase 10 operations; all integrations default to disabled."""
import json
import os
from pathlib import Path

from .model import Phase10Error


def configure_parser(subparsers):
    parser = subparsers.add_parser('integrations', help='Optional offline report imports and local analysis')
    parser.add_argument('--policy', type=Path)
    parser.add_argument('--store', type=Path)
    commands = parser.add_subparsers(dest='integration_action', required=True)
    for name in ('status', 'inventory', 'policy-check', 'export'):
        commands.add_parser(name)
    load = commands.add_parser('import')
    load.add_argument('--plugin', required=True)
    load.add_argument('--format', required=True, dest='format_name')
    load.add_argument('--input', type=Path, required=True)
    enrich = commands.add_parser('enrich')
    enrich.add_argument('--provider', required=True)
    enrich.add_argument('--type', required=True, dest='indicator_type')
    enrich.add_argument('--value', required=True)
    enrich.add_argument('--mock-response', type=Path, required=True)
    forensic = commands.add_parser('forensic-export')
    forensic.add_argument('--input', type=Path, required=True)
    sentinel = commands.add_parser('sentinel')
    sentinel.add_argument('--bundle', type=Path, required=True)
    imazing = commands.add_parser('imazing')
    imazing.add_argument('--backup', type=Path, required=True)


def dispatch(args, root):
    from .policy import Policy
    from .registry import PLUGINS

    action = args.integration_action
    policy_path = args.policy or Path(root) / 'configs/phase10.json'
    store = args.store or Path(root) / 'state/phase10'
    try:
        policy = Policy.load(policy_path)
        if action not in ('status', 'inventory', 'policy-check') and os.geteuid() == 0:
            raise Phase10Error('Integration operations require an unprivileged operator')
        if action in ('status', 'policy-check'):
            result = {'enabled': policy.enabled, 'plugins': list(policy.plugins),
                      'available_plugins': sorted(PLUGINS), 'mode': 'offline',
                      'network_execution': False, 'active_assessment': False}
        elif action == 'inventory':
            from .inventory import inventory
            result = inventory()
        elif action == 'import':
            from .service import import_report
            result = import_report(store, policy, args.plugin, args.format_name, args.input)
        elif action == 'export':
            from .store import Store
            if not policy.enabled:
                raise Phase10Error('Integrations are disabled')
            result = {'schema_version': 1, 'findings': Store(store, policy).export()}
        elif action == 'enrich':
            from .intel import MockEnricher
            from .io import parse_json, read_regular
            policy.require('mock-ti')
            response = parse_json(read_regular(args.mock_response, policy.max_bytes))
            result = MockEnricher(policy).enrich(args.provider, args.indicator_type,
                                                args.value, response=response)
        elif action == 'forensic-export':
            from .forensics import export_copy
            result = export_copy(store, policy, args.input)
        elif action == 'sentinel':
            from .service import import_sentinel
            result = import_sentinel(store, policy, args.bundle)
        elif action == 'imazing':
            from .imazing import import_backup
            result = import_backup(store, policy, args.backup)
        else:
            raise Phase10Error('Unknown integration action')
        print(json.dumps(result, ensure_ascii=True, allow_nan=False, indent=2))
        return 0
    except (Phase10Error, OSError, ValueError):
        # Never echo a report, credential, URL or private source path in errors.
        print(json.dumps({'status': 'error', 'error': 'Integration operation rejected'}))
        return 1
