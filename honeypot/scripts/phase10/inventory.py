"""Read-only host inventory. Finding a path does not verify an installation."""
import platform
import shutil
import sys


TOOLS = {
    'phoneinfoga': 'osint', 'recon-ng': 'osint', 'spiderfoot': 'osint',
    'sherlock': 'osint', 'maigret': 'osint', 'holehe': 'casework',
    'bbot': 'osint', 'maltego': 'graph', 'subfinder': 'osint', 'amass': 'osint',
    'nmap': 'assessment', 'nuclei': 'assessment', 'caido': 'external-workflow',
    'whatweb': 'assessment', 'wafw00f': 'assessment', 'testssl.sh': 'assessment',
    'trufflehog': 'restricted-casework', 'exiftool': 'forensics',
    'jq': 'utility', 'rg': 'utility', 'tshark': 'forensics',
    'wireshark': 'external-workflow', 'cloudfox': 'cloud',
    'bloodhound': 'isolated-lab', 'gophish': 'aggregate-import-only',
    'king-phisher': 'aggregate-import-only',
}
EXCLUDED = ('evilginx3', 'muraena', 'modlishka', 'setoolkit')


def inventory():
    rows = []
    for name, category in sorted(TOOLS.items()):
        path = shutil.which(name)
        rows.append({'tool': name, 'category': category, 'path': path,
                     'status': 'present_unverified' if path else 'not_on_path',
                     'version': None, 'license': 'not_verified'})
    return {'schema_version': 1,
            'host': {'system': platform.system(), 'release': platform.release(),
                     'machine': platform.machine(), 'python': sys.version.split()[0]},
            'tools': rows, 'excluded': list(EXCLUDED),
            'containers': 'not_inspected', 'other_hosts': 'not_inspected',
            'method': 'PATH lookup only; no binaries executed or packages installed'}
