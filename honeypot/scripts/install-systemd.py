#!/usr/bin/env python3
"""Render without side effects; approved preview installs never enable decoy boot."""
import argparse
import os
from pathlib import Path
import re
from hp_common import ROOT, runtime_path, require_root, run, audit
from evidence_group import evidence_group_name, render_unit_template


def render_units(root=ROOT, pcap=None, evidence_group='honeypot-evidence', preview_units=False):
    pcap = pcap or runtime_path('PCAP_PATH', 'captures')
    sources = sorted((root/'systemd').glob('honeypot-*'))
    if preview_units: sources += sorted((root/'systemd/preview').glob('*.in'))
    result = {}
    for src in sources:
        if not src.is_file() or not src.name.endswith(('.in', '.timer')): continue
        text = render_unit_template(src.read_text(), root, pcap, evidence_group)
        result[src.name.removesuffix('.in')] = text
    return result


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--preview', action='store_true')
    ap.add_argument('--install', action='store_true')
    ap.add_argument('--install-preview', action='store_true')
    ap.add_argument('--approved', action='store_true')
    a = ap.parse_args()
    import grp
    group = evidence_group_name()
    units = render_units(evidence_group=group, preview_units=a.preview or a.install_preview)
    if a.preview:
        for name, content in units.items(): print('# ' + name + '\n' + content)
        return
    if not (a.install or a.install_preview): ap.error('Use --preview or --install')
    if a.install_preview and not a.approved: ap.error('--install-preview requires --approved')
    require_root()
    for value in (str(ROOT), str(runtime_path('PCAP_PATH', 'captures').resolve()), group):
        if not re.fullmatch(r'[A-Za-z0-9_/.-]+', value): raise SystemExit('Unit paths/group must have no spaces or special characters')
    for name, content in units.items():
        dest = Path('/etc/systemd/system')/name
        if dest.exists() and dest.read_text() != content:
            raise SystemExit('Existing unit differs; review and back it up first: ' + str(dest))
    flags = [x for x in ('--install' if a.install else '', '--install-preview' if a.install_preview else '', '--approved' if a.approved else '') if x]
    try: grp.getgrgid(2000)
    except KeyError: run(['groupadd', '--gid', '2000', group])
    for name, content in units.items():
        success = False
        try:
            (Path('/etc/systemd/system')/name).write_text(content)
            success = True
        finally: audit('systemd.install', unit=name, success=success, approval_flags=flags)
    run(['systemctl', 'daemon-reload'])
    if a.install:
        for timer in sorted((ROOT/'systemd').glob('*.timer')):
            success = False
            try:
                run(['systemctl', 'enable', '--now', timer.name]); success = True
            finally: audit('systemd.enable', unit=timer.name, success=success, approval_flags=flags)
    print('Preview guard/stack/watch units, if selected, are installed only; not started or enabled.')
    print('Start PCAP explicitly after bridges exist. Automatic decoy boot remains OFF.')


if __name__ == '__main__':
    os.umask(0o027)
    main()
