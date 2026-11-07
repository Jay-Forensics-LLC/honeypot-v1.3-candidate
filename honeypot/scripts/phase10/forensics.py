"""Hash-preserving local handoff; never invokes a processor or uploads evidence."""
import hashlib

from .io import read_regular
from .model import make_finding
from .service import utc
from .store import Store


def export_copy(root, policy, path):
    policy.require('forensics')
    raw = read_regular(path, policy.max_bytes)
    digest = hashlib.sha256(raw).hexdigest()
    imported_at = utc()
    finding = make_finding('forensics', digest, 'file', digest,
                           policy.context(digest, imported_at))
    manifest = Store(root, policy).save('forensics', 'binary', raw, [finding], imported_at)
    return {'manifest': manifest, 'source_sha256': digest, 'size_bytes': len(raw),
            'external_upload': False, 'processor_execution': False,
            'local_analysis': 'Use the preserved copy in an offline local analysis tool. '
                              'ExifTool execution requires a separately qualified sandbox.'}
