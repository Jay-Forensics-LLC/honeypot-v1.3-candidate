from pathlib import Path
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from capture_status import inspect_capture


class CaptureStatus(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.proc=self.root/'proc';(self.proc/'123').mkdir(parents=True)
        (self.root/'.env').write_text('PCAP_INTERFACES=br-hp-cowrie,br-hp-canary\nPCAP_SIZE_MB=100\nPCAP_FILE_COUNT=1000\nPCAP_PATH=captures\n')
        self.argv=['dumpcap','-q','-g','-i','br-hp-cowrie','-i','br-hp-canary','-s','0','-b','filesize:100000','-b','files:1000','-b','duration:300','-w',str(self.root/'captures/ring.pcapng')]
        (self.proc/'123/stat').write_text('123 (dumpcap worker) '+' '.join(['S']+['0']*18+['789']))
        self.state='ActiveState=active\nSubState=running\nMainPID=123\nResult=success\n'
    def check(self):
        (self.proc/'123/cmdline').write_bytes(('\0'.join(self.argv)+'\0').encode())
        def run(argv,**kw):
            self.assertEqual(argv[:3],['systemctl','show','honeypot-pcap.service'])
            return SimpleNamespace(stdout=self.state)
        return inspect_capture(self.root,runner=run,proc=self.proc)
    def test_actual_identity(self):
        r=self.check();self.assertTrue(r['ok']);self.assertEqual(r['start_ticks'],789);self.assertEqual(r['continuity'],'NOT TESTED')
    def test_active_service_with_wrong_process(self):
        self.argv[0]='sleep';self.assertFalse(self.check()['ok'])
    def test_missing_process(self):
        (self.proc/'123/stat').unlink();self.assertFalse(self.check()['ok'])
    def test_stopped_after_disk_guard(self):
        self.state='ActiveState=inactive\nSubState=dead\nMainPID=0\nResult=success\n';self.assertFalse(self.check()['ok'])
    def test_wrong_interface(self):
        self.argv[4]='eth0';self.assertFalse(self.check()['ok'])
    def test_unbounded_ring(self):
        self.argv[self.argv.index('files:1000')]='files:0';self.assertFalse(self.check()['ok'])
    def test_matching_invalid_budget_rejected(self):
        path=self.root/'.env'
        path.write_text(path.read_text().replace('PCAP_FILE_COUNT=1000','PCAP_FILE_COUNT=0'))
        self.argv[self.argv.index('files:1000')]='files:0'
        self.assertIn('budget',self.check()['problems'][0])
    def test_automatic_stop(self):
        self.argv+=['-a','duration:300'];self.assertFalse(self.check()['ok'])
    def test_wrong_destination(self):
        self.argv[-1]='/tmp/other.pcapng';self.assertFalse(self.check()['ok'])
    def test_permission_denied(self):
        def denied(*a,**k):raise PermissionError('denied')
        self.assertFalse(inspect_capture(self.root,runner=denied,proc=self.proc)['ok'])


class HealthWatermark(unittest.TestCase):
    def test_critical_stop_is_reflected_in_saved_capture_status(self):
        import healthcheck
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            for name in ('incidents','captures','artifacts','secrets'): (root/name).mkdir()
            cfg={'HONEYPOT_INTERFACE':'lo','PCAP_INTERFACES':'lo','DISK_CRITICAL_PERCENT':'95'}
            commands=[]
            def runner(argv,**kw):
                commands.append(argv)
                return SimpleNamespace(returncode=0,stdout='')
            with patch.object(healthcheck,'ROOT',root), patch.object(healthcheck,'config',return_value=cfg), \
                 patch.object(healthcheck,'runtime_path',side_effect=lambda key,fallback:root/fallback), \
                 patch.object(healthcheck,'inspect_guard',return_value={'ok':True,'counters':{}}), \
                 patch.object(healthcheck,'inspect_dns',return_value={}), \
                 patch.object(healthcheck,'snapshot',return_value=({},0)), \
                 patch.object(healthcheck,'inspect_capture',return_value={'ok':True,'problems':[]}), \
                 patch.object(healthcheck.shutil,'disk_usage',return_value=SimpleNamespace(total=100,used=96)), \
                 patch.object(healthcheck.os,'geteuid',return_value=0), patch.object(healthcheck,'run',side_effect=runner):
                row=healthcheck.check()
            self.assertIn(['systemctl','stop','honeypot-pcap.service'],commands)
            self.assertFalse(any('start' in argv or 'restart' in argv for argv in commands))
            self.assertTrue(row['pcap_stopped_for_disk'])
            self.assertFalse(row['pcap_running']);self.assertFalse(row['capture']['ok'])
            import json
            self.assertFalse(json.loads((root/'state/health.json').read_text())['pcap_running'])

if __name__=='__main__': unittest.main()
