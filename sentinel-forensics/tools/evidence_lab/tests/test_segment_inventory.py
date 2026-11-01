"""Complete segment sets must remain stable as well as their original files."""
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import qualify as module


class SegmentInventory(unittest.TestCase):
    def test_segment_added_between_workers_cannot_pass_unchanged_file_hashes(self):
        with tempfile.TemporaryDirectory() as name:
            root=Path(name); source=root/'segments';source.mkdir()
            module.generate(source/'first.pcap',3)
            original=module.measured_process
            added=[False]
            def run_then_add(*args,**kwargs):
                result=original(*args,**kwargs)
                if not added[0]:
                    module.generate(source/'later.pcap',2)
                    added[0]=True
                return result
            with patch.object(module,'capinfos_count',return_value=None),patch.object(module,'measured_process',side_effect=run_then_add):
                report=module.qualify(source,root/'case',profile='synthetic',expected_packets=3,min_free_bytes=0)
            self.assertEqual(report['status'],'FAILED')
            self.assertFalse(report['checks']['dataset_inventory_unchanged'])
            self.assertTrue(report['checks']['source_unchanged'])
            self.assertTrue(report['checks']['reproducible_records'])
            self.assertEqual(report['final_inventory_sources'],2)
            self.assertNotIn('later.pcap',str(report))


if __name__=='__main__': unittest.main()
