"""Read-only evidence-group lookup and shared systemd template rendering."""
import re


def evidence_group_name(gid=2000):
    import grp
    try:
        return grp.getgrgid(gid).gr_name
    except KeyError:
        return 'honeypot-evidence'


def render_unit_template(text, root, pcap, evidence_group=None):
    group = evidence_group_name() if evidence_group is None else evidence_group
    if not re.fullmatch(r'[A-Za-z0-9_.-]+', group):
        raise ValueError('Invalid evidence group name')
    text = text.replace('@ROOT@', str(root)).replace('@PCAP@', str(pcap)).replace('@EVIDENCE_GROUP@', group)
    if re.search(r'@[A-Z_]+@', text):
        raise ValueError('Unresolved unit token')
    return text
