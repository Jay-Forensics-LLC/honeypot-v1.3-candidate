"""Deterministic whole-cohort page selection; invented metadata only."""
# HoneyTrace local modification, 2026-11-01: cover permanent whole-page frame limits.
from collections import OrderedDict
import sqlite3
from types import SimpleNamespace
import unittest

from core import IngestError
from reconstruct_plan import selection, plan, materialize_batch, release_batch
from reconstruct_history import continuation_summary


LIMITS={'batch_frames':10,'batch_bytes':10000,'batch_cohorts':4,
        'max_batches':1,'total_frames':20}


def inventory(items):
    cohorts=OrderedDict()
    for ident,(frames,scope) in enumerate(items,1):
        key=((scope,'context',0,0,1,(),4),(('192.0.2.1',10000+ident),('198.51.100.1',443)))
        cohorts[key]={'id':ident,'frames':frames,'bytes':frames*100,
                      'candidates':[ident*10,ident*10+1]}
    return {'cohorts':cohorts}


class WholeCohortPageTests(unittest.TestCase):
    def test_noncontiguous_backfill_requires_completed_set(self):
        observed=inventory([(8,1),(5,1),(2,1)])
        first=selection(observed,LIMITS)
        self.assertEqual(first['selected_cohorts'],[1,3])
        self.assertEqual(first['reasons'],{2:'batch_selection_cap'})
        second=selection(observed,LIMITS,first['selected_cohorts'])
        self.assertEqual(second['selected_cohorts'],[2])
        self.assertEqual(second['reasons'],{})
        self.assertEqual(selection(observed,LIMITS,[1,2,3])['selected_cohorts'],[])

    def test_oversized_cohorts_remain_permanent_with_many_candidates(self):
        observed=inventory([(8,1),(11,1),(2,1)])
        first=selection(observed,LIMITS)
        self.assertEqual(first['selected_cohorts'],[1,3])
        self.assertEqual(first['permanent'],{2})
        self.assertEqual(first['reasons'],{2:'whole_cohort_frame_cap'})
        last=selection(observed,LIMITS,[1,3])
        self.assertEqual(last['selected_cohorts'],[])
        self.assertEqual(last['permanent'],{2})
        self.assertEqual(last['reasons'],{2:'whole_cohort_frame_cap'})
        with self.assertRaisesRegex(IngestError,'permanent_cohort_completed'):
            selection(observed,LIMITS,[2])

    def test_different_source_or_scope_never_shares_batch(self):
        observed=inventory([(2,1),(2,2),(2,1)])
        first=selection(observed,LIMITS)
        self.assertEqual(first['selected_cohorts'],[1,3])
        self.assertEqual(first['reasons'],{2:'batch_selection_cap'})
        self.assertEqual(selection(observed,LIMITS,[1,3])['selected_cohorts'],[2])

    def test_each_batch_has_one_classic_header_and_whole_record_bytes(self):
        observed=inventory([(2,1),(2,1)])
        first=selection(observed,dict(LIMITS,batch_bytes=424))
        self.assertEqual(first['selected_cohorts'],[1,2])
        self.assertEqual(first['batches'][0]['bytes'],424)
        first=selection(observed,dict(LIMITS,batch_bytes=423))
        self.assertEqual(first['selected_cohorts'],[1])
        self.assertEqual(first['reasons'],{2:'batch_selection_cap'})

    def test_total_frame_deferred_work_becomes_available_on_next_page(self):
        observed=inventory([(8,1),(5,1),(2,1)])
        limits=dict(LIMITS,total_frames=8,max_batches=2)
        first=selection(observed,limits)
        self.assertEqual(first['selected_cohorts'],[1])
        self.assertEqual(first['reasons'],{2:'total_frame_selection_cap',3:'total_frame_selection_cap'})
        self.assertEqual(selection(observed,limits,[1])['selected_cohorts'],[2,3])

    def test_cohort_larger_than_entire_page_never_advertises_an_empty_continuation(self):
        observed=inventory([(3,1),(1,1)])
        limits=dict(LIMITS,total_frames=2)
        first=selection(observed,limits)
        self.assertEqual(first['selected_cohorts'],[2])
        self.assertEqual(first['permanent'],{1})
        self.assertEqual(first['reasons'],{1:'whole_cohort_total_frame_cap'})
        last=selection(observed,limits,[2])
        self.assertEqual(last['selected_cohorts'],[])
        summary=continuation_summary(observed,limits,[2],1,None,lambda:None)
        self.assertEqual(summary['remaining_fitting_cohorts'],0)
        self.assertFalse(summary['can_continue'])
        with self.assertRaisesRegex(IngestError,'permanent_cohort_completed'):
            selection(observed,limits,[1])

    def test_completed_ids_are_exact_bounded_known_unique_integers(self):
        observed=inventory([(2,1)])
        for completed in ([1,1],[0],[True],[2],[-1],['1']):
            with self.subTest(completed=completed),self.assertRaises(IngestError):
                selection(observed,LIMITS,completed)

    def test_selection_does_not_mutate_inventory_or_lose_multiple_candidates(self):
        observed=inventory([(8,1),(5,1),(2,1)])
        before=repr(observed)
        self.assertEqual(selection(observed,LIMITS),selection(observed,LIMITS))
        selection(observed,LIMITS,[1,3])
        self.assertEqual(repr(observed),before)
        self.assertEqual(list(observed['cohorts'].values())[0]['candidates'],[10,11])

    def test_explicit_solo_selector_never_backfills_or_splits_another_cohort(self):
        observed=inventory([(8,1),(11,1),(2,1)])
        before=repr(observed)
        chosen=selection(observed,dict(LIMITS,batch_frames=12),cohort_id=2)
        self.assertEqual(chosen['selected_cohorts'],[2])
        self.assertEqual(chosen['batches'][0]['frames'],11)
        self.assertEqual(chosen['reasons'],{1:'not_selected_by_profile',3:'not_selected_by_profile'})
        excluded=selection(observed,LIMITS,cohort_id=2)
        self.assertEqual(excluded['selected_cohorts'],[])
        self.assertEqual(excluded['reasons'][2],'whole_cohort_frame_cap')
        self.assertEqual(repr(observed),before)
        for value in (True,0,4,'2'):
            with self.subTest(value=value),self.assertRaisesRegex(IngestError,'tls_solo_cohort_not_found'):
                selection(observed,LIMITS,cohort_id=value)


class ActiveBatchMaterializationTests(unittest.TestCase):
    def test_page_keeps_only_compact_ids_until_one_ordered_pk_batch_is_active(self):
        # Metadata-only planner fixture: no capture bytes or decoding is implied.
        db=sqlite3.connect(':memory:');self.addCleanup(db.close);db.row_factory=sqlite3.Row
        db.executescript('''CREATE TABLE packet_meta(id INTEGER PRIMARY KEY,source_id INTEGER,ordinal INTEGER,
          packet_number INTEGER,context TEXT,protocol TEXT,src TEXT,dst TEXT,sport INTEGER,dport INTEGER,
          utc_ns INTEGER,time_json TEXT,section INTEGER,interface INTEGER,linktype INTEGER,vlan TEXT,
          losses TEXT,captured_bytes INTEGER);
          CREATE TABLE records(source_id INTEGER,ordinal INTEGER,offset INTEGER,length INTEGER,
            sha256 TEXT,kind TEXT,PRIMARY KEY(source_id,ordinal));''')
        for index in range(1,1041):
            port=50000 if index%2 else 50001
            loss='["tls_reassembly_required"]' if index<=4 else '[]'
            db.execute('INSERT INTO packet_meta VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                (index,1,index,index,'context','tcp','192.0.2.1','198.51.100.1',port,443,
                 index,'{}',0,0,1,'[]',loss,64))
            db.execute('INSERT INTO records VALUES(?,?,?,?,?,?)',(1,index,24+(index-1)*80,80,'01'*32,'packet'))
        limits=dict(LIMITS,batch_frames=600,total_frames=1200,batch_bytes=100000,
                    batch_cohorts=1,max_batches=2,candidates=2048,packet_rows=2000000)
        bound=SimpleNamespace(db=db,sources={1:{'size':24+1040*80}})
        candidates,batches,coverage=plan(bound,limits,lambda:None)
        self.assertEqual(coverage['selected_frames'],1040)
        self.assertEqual([len(b['packet_ids']) for b in batches],[520,520])
        self.assertTrue(all(b['packet_ids'].typecode=='Q' and not b['references']
                            and not b['information'] and not b['candidates'] for b in batches))
        queries=[];db.set_trace_callback(queries.append)
        materialize_batch(bound,batches[0],candidates,limits,lambda:None)
        self.assertEqual([r.ordinal for r in batches[0]['references']],list(range(1,1041,2)))
        self.assertEqual([info['ordinal'] for info in batches[0]['information'].values()],list(range(1,1041,2)))
        self.assertEqual(batches[0]['candidates'],{1:1,2:3})
        self.assertTrue(all(not batches[1][key] for key in ('references','information','candidates')))
        lookups=[query for query in queries if query.startswith('SELECT p.')]
        self.assertEqual(len(lookups),3)
        self.assertTrue(all(' WHERE p.id IN (' in query and ' ORDER BY p.id' in query for query in lookups))
        release_batch(batches[0])
        self.assertTrue(all(not batches[0][key] for key in ('references','information','candidates','packet_ids')))
        materialize_batch(bound,batches[1],candidates,limits,lambda:None)
        self.assertEqual([r.ordinal for r in batches[1]['references']],list(range(2,1041,2)))
        self.assertEqual(batches[1]['candidates'],{1:2,2:4})
        release_batch(batches[1])


if __name__=='__main__':
    unittest.main()
