"""Explicit read-only reconciliation of one preserved historical defect."""
import hashlib,json,importlib.util
from pathlib import Path
HERE=Path(__file__).resolve().parent
REPORT=HERE/'stage7-evidence-recovery-remediation-cc48cdb7f95b.json'
REPORT_HASH='45f57773e5b30dfbc908a4b7bce2454fcaba377431ab51e0a69501b1be6f678f'
ORIGINAL=Path('/home/joe/honeypot-staging/honeypot/incidents/2026-10-05/dfd9b409bd28ff3fbed5848f-0000/events.jsonl')
ORIGINAL_HASH='e8dbac89247db30367003775322427790fc905825b950bd03f53734040828d8c'
LEGACY_HERE=Path('/home/joe/honeypot-v1.3-polish2/honeypot/work/live-qualification')
EXPECTED_BUNDLE='stage7-recovery-dfd9b409bd28ff3fbed5848f-0000-c885754e4bc7'
def _require(condition, message):
 if not condition: raise AssertionError(message)
def digest(data):return hashlib.sha256(data).hexdigest()
def locate_bundle(recorded):
 # The hash-pinned report stays immutable. Resolve only its exact retained
 # bundle name after source-tree relocation; never search or change evidence.
 path=Path(recorded)
 if path.name!=EXPECTED_BUNDLE or path.parent not in (LEGACY_HERE,HERE):
  raise RuntimeError('Unexpected recovery bundle provenance path')
 bundle=HERE/path.name
 if bundle.is_symlink() or not bundle.is_dir():
  raise RuntimeError('Retained recovery bundle absent or symlink')
 return bundle
def verify():
 _require(digest(REPORT.read_bytes()) == REPORT_HASH, 'Recovery report hash drift')
 r=json.loads(REPORT.read_text());_require(r['ORIGINAL_UNCHANGED'] and r['STATUS'] == 'RECOVERY_COMPLETE_SOURCE_PATCH_TESTED_NOT_DEPLOYED', 'Historical reconciliation integrity check failed')
 bundle=locate_bundle(r['RECOVERY_BUNDLE'])
 files={p.name:digest(p.read_bytes()) for p in bundle.iterdir() if p.is_file() and not p.is_symlink()}
 _require(set(files) == {'events.recovered.jsonl', 'recovery-manifest.json', 'README.txt'}, 'Historical reconciliation integrity check failed')
 manifest=json.loads((bundle/'recovery-manifest.json').read_text())
 original=ORIGINAL.read_bytes();recovered=(bundle/'events.recovered.jsonl').read_bytes()
 _require(digest(original) == ORIGINAL_HASH == manifest['original']['sha256'], 'Historical reconciliation integrity check failed')
 _require(digest(recovered) == manifest['derivative_sha256'], 'Historical reconciliation integrity check failed')
 _require(recovered[:33944] == original[:33944] and original[33944:] == b'\x00' * 2920, 'Historical reconciliation integrity check failed')
 rows=[json.loads(x) for x in recovered.splitlines()];ids=[x['event_id'] for x in rows]
 _require(len(ids) == len(set(ids)) == 5, 'Historical reconciliation integrity check failed')
 _require(ids == [x['event_id'] for x in manifest['ordered_records']], 'Historical reconciliation integrity check failed')
 _require(set(ids) == set(json.loads((ORIGINAL.parent / 'incident.json').read_text())['related_events']), 'Historical reconciliation integrity check failed')
 _require(manifest['ordered_records'][-1]['method'] == 'RECONSTRUCTED_FROM_RAW_AND_NORMALIZED', 'Historical reconciliation integrity check failed')
 _require(manifest['raw_provenance'] == r['RAW_SOURCE_VERIFIED'] and manifest['normalized_provenance'] == r['NORMALIZED_SOURCE_VERIFIED'], 'Historical reconciliation integrity check failed')
 spec=importlib.util.spec_from_file_location('reconciled_record_verifier',HERE/'stage7-evidence-recovery-remediation.py');verifier=importlib.util.module_from_spec(spec);spec.loader.exec_module(verifier)
 spec=importlib.util.spec_from_file_location('qualified_normalized_source',HERE.parents[1]/'scripts/qualified_normalized_source.py');normalized_verifier=importlib.util.module_from_spec(spec);spec.loader.exec_module(normalized_verifier)
 norm,np=normalized_verifier.verify(verifier.ROOT,r['NORMALIZED_SOURCE_VERIFIED'],verifier.EID)
 raw,rp=verifier.source('logs/suricata/eve.json',2227815,r['RAW_SOURCE_VERIFIED']['previously_qualified_source_file_sha256'],r['RAW_SOURCE_VERIFIED']['record_sha256'])
 _require(rows[-1] == {'event_id': verifier.EID, 'normalized': norm, 'raw': raw}, 'Historical reconciliation integrity check failed')
 offset=0
 for line,entry in zip(original[:33944].splitlines(keepends=True),manifest['ordered_records'][:4]):
  _require(entry['method'] == 'ORIGINAL_INTACT' and entry['offset'] == offset and (entry['length'] == len(line)) and (entry['sha256'] == digest(line)), 'Historical reconciliation integrity check failed')
  offset+=len(line)
 return {'original_path':str(ORIGINAL),'original_sha256':ORIGINAL_HASH,'recovery_bundle':str(bundle),'recorded_recovery_bundle':r['RECOVERY_BUNDLE'],'bundle_relocated':str(bundle)!=r['RECOVERY_BUNDLE'],'bundle_hashes':files,'manifest':manifest,'records':rows,'normalized_source':np,'raw_source':rp,'policy':'Only this exact hash-pinned historical defect is reconciled; original remains corrupted and byte-preserved, derivative explicitly reconstructed.'}
def reconciled(path,diagnostics=None):
 _require(Path(path) == ORIGINAL, 'Historical reconciliation integrity check failed')
 result=verify()
 if diagnostics is not None:diagnostics.append({'historical_reconciliation':result['policy'],'original_sha256':ORIGINAL_HASH,'recovery_bundle':result['recovery_bundle']})
 return ORIGINAL.read_bytes(),result['records']
