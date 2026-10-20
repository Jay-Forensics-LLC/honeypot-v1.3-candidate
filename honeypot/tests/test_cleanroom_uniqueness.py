"""Global clean-store regression; no runtime writes, traffic or Docker calls."""
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'scripts'))
import stage7_recovery_check as recovery
import stage7_qualification as qualification
import test_qualification_context as fixtures


class CleanroomUniqueness(fixtures.ContextFixture):
    def incident(self, name, ids):
        folder=self.runtime/'incidents/2026-10-18'/name;folder.mkdir(parents=True)
        (folder/'events.jsonl').write_text(''.join(json.dumps({'event_id':eid})+'\n' for eid in ids))
        (folder/'incident.json').write_text(json.dumps({'related_events':ids}))
        return {path:path.read_bytes() for path in folder.iterdir()}

    def inspect(self, progress=None):
        with patch.object(recovery,'CONTEXT',self.load()):
            return recovery.evidence_integrity(self.runtime, progress)

    def test_unique_two_incident_control(self):
        before=self.incident('first',['one']);before.update(self.incident('second',['two']))
        result=self.inspect()
        self.assertEqual(result['status'],'VERIFIED_CLEAN')
        self.assertEqual({p:p.read_bytes() for p in before},before)

    def test_empty_incident_file_is_not_a_nonempty_store(self):
        before=self.incident('empty',[])
        with self.assertRaisesRegex(ValueError,'event inventory absent'):self.inspect()
        self.assertEqual({p:p.read_bytes() for p in before},before)

    def test_earlier_file_change_during_later_read_keeps_sweep_incomplete(self):
        self.incident('first',['one']);self.incident('second',['two'])
        first=self.runtime/'incidents/2026-10-18/first'
        def callback(path,*args):
            if path.parent.name=='second':
                (first/'events.jsonl').write_text('{"event_id": "two"}\n')
                (first/'incident.json').write_text('{"related_events": ["two"]}')
        progress={}
        with patch.object(recovery,'CONTEXT',self.load()),self.assertRaisesRegex(ValueError,'changed after read'):
            recovery.evidence_integrity(self.runtime,progress,on_incident=callback)
        self.assertEqual(progress['status'],'INCOMPLETE')

    def test_copy_restored_after_clean_startup_cannot_bypass_global_sweep(self):
        before=self.incident('first',['one']);self.assertEqual(self.inspect()['status'],'VERIFIED_CLEAN')
        audit=self.runtime/'logs/system/evidence-startup.jsonl';audit.parent.mkdir(parents=True)
        audit.write_text('{"action":"EVIDENCE_STARTUP_SCAN_COMPLETE","status":"CLEAN"}\n')
        before.update(self.incident('restored-copy',['one']));before[audit]=audit.read_bytes()
        progress={}
        with self.assertRaisesRegex(ValueError,'Ambiguous event ID'):self.inspect(progress)
        self.assertEqual(progress['status'],'INCOMPLETE')
        self.assertEqual({p:p.read_bytes() for p in before},before)

    def test_global_id_memory_bound_is_enforced_without_read_budget_increase(self):
        before=self.incident('first',['one','two','three'])
        with patch.object(recovery,'EVIDENCE_EVENT_ID_LIMIT',2,create=True):
            with self.assertRaisesRegex(ValueError,'event ID inventory exceeds bound'):self.inspect()
        self.assertEqual({p:p.read_bytes() for p in before},before)

    def test_prerequisite_cannot_accept_a_receipt_without_global_check(self):
        fixture=fixtures.CleanPrerequisiteTests();fixture.setUp();self.addCleanup(fixture.doCleanups)
        context=fixture.load();row=fixture.row(context)
        row['evidence_integrity'].pop('event_id_uniqueness',None)
        with patch.object(qualification,'CONTEXT',context),self.assertRaisesRegex(ValueError,'global event ID'):
            qualification.prerequisite_passed(row)

    def test_review_inventory_also_streams_before_enforcing_entry_limit(self):
        self.incident('first',['one']);self.incident('second',['two'])
        with patch.object(recovery,'EVIDENCE_COUNT_LIMIT',1), \
             patch.object(Path,'iterdir',side_effect=AssertionError('Unbounded iterator')):
            with self.assertRaisesRegex(ValueError,'inventory exceeds bound'):
                recovery.incident_inventory(self.runtime/'incidents')


if __name__=='__main__':unittest.main(verbosity=2)
