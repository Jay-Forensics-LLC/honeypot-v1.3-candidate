"""One bounded process for fixed, built-in offline report parsers."""
import base64
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main():
    import resource

    for kind, limit in ((resource.RLIMIT_AS, 256 * 1024**2),
                        (resource.RLIMIT_CPU, 10), (resource.RLIMIT_NOFILE, 32),
                        (resource.RLIMIT_FSIZE, 16 * 1024**2),
                        (resource.RLIMIT_CORE, 0)):
        soft, hard = resource.getrlimit(kind)
        bound = limit if hard == resource.RLIM_INFINITY else min(limit, hard)
        resource.setrlimit(kind, (bound, bound))
    from phase10.model import MAX_BYTES, Phase10Error
    from phase10.osint import parse_spiderfoot, parse_recon_ng, parse_bbot
    from phase10.reports import (parse_nmap, parse_nuclei, parse_cloudfox,
                                 parse_bloodhound, parse_awareness)
    from phase10.sentinel import parse_sentinel
    from phase10.imazing import parse_imazing

    parsers = {'spiderfoot': parse_spiderfoot, 'recon-ng': parse_recon_ng,
               'bbot': parse_bbot, 'nmap': parse_nmap, 'nuclei': parse_nuclei,
               'cloudfox': parse_cloudfox, 'bloodhound': parse_bloodhound,
               'awareness': parse_awareness, 'sentinel': parse_sentinel,
               'imazing': parse_imazing}
    try:
        envelope = sys.stdin.buffer.read(2 * MAX_BYTES + 1)
        if len(envelope) > 2 * MAX_BYTES:
            raise Phase10Error('Worker input exceeds quota')
        request = json.loads(envelope)
        parser = parsers.get(request['plugin'])
        if parser is None:
            raise Phase10Error('Unsupported report plugin')
        data = base64.b64decode(request['data'], validate=True)
        if len(data) > MAX_BYTES:
            raise Phase10Error('Report exceeds quota')
        findings = parser(data, request['format'], request['context'])
        output = json.dumps(findings, ensure_ascii=True, allow_nan=False).encode()
        if len(output) > MAX_BYTES:
            raise Phase10Error('Normalized findings exceed quota')
        sys.stdout.buffer.write(output)
        return 0
    except Exception as exc:
        # Input values and parser diagnostics may contain restricted source data.
        print(json.dumps({'error': type(exc).__name__}), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
