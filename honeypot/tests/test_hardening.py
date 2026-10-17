import copy
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import guard_policy as policy
import guard_watch
import hp_common
import ops
from incidentd import Engine, normalize
from pipeline_health import drop_rate, snapshot, source_paths

# Independent nft JSON fixture. Kernel serialization is checked by firewall-netns.py.
def fixture():
    def m(left,right,op='=='): return {'match':{'op':op,'left':left,'right':right}}
    def ip(field): return {'payload':{'protocol':'ip','field':field}}
    def prefix(addr,length): return {'prefix':{'addr':addr,'len':length}}
    bridge={'set':['br-hp-cowrie','br-hp-canary']}
    incoming=m({'meta':{'key':'iifname'}},bridge)
    outgoing=m({'meta':{'key':'oifname'}},bridge)
    state=m({'ct':{'key':'state'}},{'set':['established','related']},'in')
    rules={
        'outbound':[[state,{'accept':None}],
                    [m(ip('daddr'),prefix('192.168.0.0',16)),{'counter':{'packets':7,'bytes':700}},{'drop':None}],
                    [m(ip('daddr'),{'set':[prefix('10.0.0.0',8),prefix('172.16.0.0',12),prefix('192.168.0.0',16),prefix('169.254.0.0',16)]}),{'drop':None}],
                    [incoming,m({'payload':{'protocol':'udp','field':'dport'}},53),{'drop':None}],
                    [incoming,m({'payload':{'protocol':'tcp','field':'dport'}},53),{'drop':None}],
                    [{'counter':{'packets':9,'bytes':900}},{'drop':None}]],
        'forward':[[outgoing,m(ip('saddr'),'@blocked4'),{'drop':None}],
                   [outgoing,m({'payload':{'protocol':'ip6','field':'saddr'}},'@blocked6'),{'drop':None}],
                   [incoming,{'jump':{'target':'outbound'}}]],
        'input':[[incoming,state,{'accept':None}],[incoming,{'counter':{'packets':11,'bytes':1100}},{'drop':None}]]}
    rows=[{'table':{'family':'inet','name':'hp_guard'}}]
    for name,expressions in rules.items():
        c={'family':'inet','table':'hp_guard','name':name}
        if name!='outbound': c.update(type='filter',hook=name,prio=-10,policy='accept')
        rows.append({'chain':c})
        rows.extend({'rule':{'family':'inet','table':'hp_guard','chain':name,'expr':expr}} for expr in expressions)
    return {'nftables':rows}

class GuardTests(unittest.TestCase):
    def setUp(self): self.cfg={'PROTECTED_SUBNET':'192.168.0.0/16'}
    def test_valid_policy_and_counters(self):
        r=policy.evaluate(fixture(),self.cfg)
        self.assertTrue(r['ok'],r)
        self.assertEqual(r['counters'],{'protected_drop':7,'egress_drop':9,'host_drop':11})
    def test_loss_and_semantic_drift(self):
        for kind in ('table','chain','final_drop','dns','jump','early_accept','hook','dormant'):
            doc=fixture();rows=doc['nftables']
            if kind=='table': rows.clear()
            elif kind=='chain': rows[:]=[x for x in rows if x.get('chain',{}).get('name')!='input']
            elif kind in ('final_drop','dns','jump'):
                target=({'drop':None} if kind=='final_drop' else {'jump':{'target':'outbound'}})
                if kind=='dns':
                    rows[:]=[x for x in rows if not any(e.get('match',{}).get('right')==53 for e in x.get('rule',{}).get('expr',[]))]
                else:
                    for x in rows[:]:
                        r=x.get('rule',{})
                        if (kind=='final_drop' and r.get('chain')=='outbound' and r.get('expr')[-1:]==[target] and len(r['expr'])==2) or (kind=='jump' and target in r.get('expr',[])):
                            rows.remove(x)
            elif kind=='early_accept': rows.insert(2,{'rule':{'family':'inet','table':'hp_guard','chain':'outbound','expr':[{'accept':None}]}})
            elif kind=='hook': next(x['chain'] for x in rows if x.get('chain',{}).get('name')=='forward')['prio']=0
            else: rows[0]['table']['flags']=['dormant']
            with self.subTest(kind=kind): self.assertFalse(policy.evaluate(doc,self.cfg)['ok'])
    def test_table_deleted_unit_still_active_stops_only_decoys(self):
        commands=[]
        def fake(argv,**kwargs):
            commands.append(argv)
            if argv[0]=='nft': return subprocess.CompletedProcess(argv,1,'','table absent')
            if argv[0]=='systemctl': return subprocess.CompletedProcess(argv,0,'active\n','')
            return subprocess.CompletedProcess(argv,0,'','')
        with patch.object(policy,'run',side_effect=fake),patch.object(guard_watch,'run',side_effect=fake),patch.object(guard_watch,'require_root'),patch.object(guard_watch,'audit') as audit:
            report=guard_watch.check(True)
        self.assertTrue(report['would_stop_decoys']);self.assertTrue(report['decoys_stopped'])
        self.assertIn(['docker','compose','stop','cowrie','opencanary'],commands)
        self.assertFalse(any(x[0]=='systemctl' for x in commands))
        self.assertEqual(audit.call_args.args[0],'guard.table_missing')
    def test_valid_guard_does_not_stop_decoys(self):
        good=policy.evaluate(fixture(),self.cfg)
        self.assertTrue(good['ok'])
        with patch.object(guard_watch,'inspect_guard',return_value=good),patch.object(guard_watch,'run') as run,patch.object(guard_watch,'audit') as audit:
            report=guard_watch.check(True)
        self.assertFalse(report['would_stop_decoys'])
        self.assertNotIn('decoys_stopped', report)
        run.assert_not_called()
        audit.assert_not_called()
        joined=' '.join(str(part) for call in run.call_args_list for part in call.args)
        for service in ('grafana','loki','alloy','incidentd'):
            self.assertNotIn(service, joined)
    def test_preview_never_stops_and_stop_failure_is_reported(self):
        bad=policy.evaluate({'nftables':[]},self.cfg)
        with patch.object(guard_watch,'inspect_guard',return_value=bad),patch.object(guard_watch,'run') as run,patch.object(guard_watch,'audit'),patch.object(guard_watch,'require_root'):
            self.assertTrue(guard_watch.check()['would_stop_decoys']);run.assert_not_called()
            run.return_value=subprocess.CompletedProcess([],1,'','')
            self.assertFalse(guard_watch.check(True)['decoys_stopped'])
    def test_compose_dns_constants(self):
        text=(ROOT/'docker-compose.yml').read_text()
        for name,expected in policy.DNS.items():
            section=re.search(r'^  '+name+r':\n(.*?)(?=^  \w+:)',text,re.M|re.S).group(1)
            self.assertEqual(re.findall(r'^      - (172\.29\.\d+\.254)$',section,re.M),[expected])
    def test_runtime_dns_rejects_extra_resolver(self):
        row=[{'HostConfig':{'Dns':['172.29.40.254','8.8.8.8']}}]
        with patch.object(policy,'run',return_value=subprocess.CompletedProcess([],0,json.dumps(row),'')):
            self.assertFalse(policy.inspect_dns()['cowrie'])
    def test_verdict_only_strips_log_limit(self):
        from firewall import render, verdict_only
        text=render(self.cfg)
        slim=verdict_only(text)
        self.assertIn('counter drop', slim)
        self.assertNotIn('limit rate', slim)
        self.assertNotIn('log prefix', slim)
        self.assertIn('table inet hp_guard', slim)
    def test_rollback_rejects_other_tables_and_include(self):
        from firewall import scoped_snapshot, render
        scoped_snapshot(render(self.cfg))
        for text in ('table inet other {}','table inet hp_guard {} table inet other {}',
                     'table inet hp_guard { include "other.nft" }','flush ruleset'):
            with self.subTest(text=text),self.assertRaises(ValueError): scoped_snapshot(text)
    def test_unreadable_policy_is_unsafe(self):
        for text in ('[]','null','{}','broken'):
            with patch.object(policy,'run',return_value=subprocess.CompletedProcess([],0,text,'')),patch.object(policy,'config',return_value=self.cfg):
                self.assertFalse(policy.inspect_guard()['ok'])

class StartupTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.patch=patch.object(ops,'ROOT',self.root);self.patch.start()
        daemon=patch.object(ops,'require_local_daemon',return_value={'ok':True})
        daemon.start();self.addCleanup(daemon.stop)
        (self.root/'state').mkdir()
    def tearDown(self): self.patch.stop();self.tmp.cleanup()
    def ready(self,age=0): (self.root/'state/readiness.json').write_text(json.dumps({'ready':True,'checked_epoch':time.time()-age}))
    def write_approval(self,bind='203.0.113.10'):
        (self.root/'state/wan-approval.json').write_text(json.dumps({
            'approved':True,'approver':'unit-test','timestamp':'2026-09-30T00:00:00Z',
            'allowed_ports':[2222,2223,8080,2121],'bind_address':bind,
            'test_source_cidr':'203.0.113.0/24','residual_risk_acknowledged':True}))
    def test_exposure_requires_both_flag_and_fresh_pass(self):
        self.ready()
        with self.assertRaises(SystemExit): ops.exposure_gate('203.0.113.10')
        with self.assertRaises(SystemExit): ops.exposure_gate('0.0.0.0',True)
        with self.assertRaises(SystemExit): ops.exposure_gate('203.0.113.10',True)
        self.write_approval()
        ops.exposure_gate('203.0.113.10',True)
        self.ready(86401)
        with self.assertRaises(SystemExit): ops.exposure_gate('203.0.113.10',True)
        self.ready(-60)
        with self.assertRaises(SystemExit): ops.exposure_gate('203.0.113.10',True)
    def test_start_stops_before_compose_when_guard_missing(self):
        (self.root/'secrets').mkdir();(self.root/'secrets/grafana_admin_password').touch()
        with patch.object(ops,'require_root'),patch.object(ops,'config',return_value={}),patch.object(ops,'require_guard',side_effect=SystemExit('missing')),patch.object(ops,'compose') as compose,patch.object(hp_common,'audit'):
            with self.assertRaises(SystemExit): ops.start()
            compose.assert_not_called()
    def rendered(self):
        return {'services':{name:{'dns':[dns],'ports':[{'host_ip':'127.0.0.1'}],'networks':{network:{}}} for name,dns,network in [('cowrie',policy.DNS['cowrie'],'cowrie'),('opencanary',policy.DNS['opencanary'],'canary')]},
                'networks':{n:{'driver_opts':{'com.docker.network.bridge.name':b}} for n,b in [('cowrie','br-hp-cowrie'),('canary','br-hp-canary')]}}
    def test_rendered_dns_and_actual_hostip_gates(self):
        good=self.rendered();ops.rendered_start_gate(good)
        for kind in ('dns','host_ip','management','network'):
            doc=copy.deepcopy(good)
            if kind=='dns': doc['services']['cowrie']['dns']=[]
            elif kind=='host_ip': doc['services']['cowrie']['ports'][0]['host_ip']='0.0.0.0'
            elif kind=='management': doc['services']['grafana']={'ports':[{'host_ip':'0.0.0.0'}]}
            else: doc['services']['cowrie']['networks']={'management':{}}
            with self.subTest(kind=kind),self.assertRaises(SystemExit): ops.rendered_start_gate(doc)
    def test_explicit_start_can_create_and_stops_on_postcheck_failure(self):
        (self.root/'secrets').mkdir();(self.root/'secrets/grafana_admin_password').touch()
        cfg={'MANAGEMENT_BIND':'127.0.0.1','DECOY_BIND':'127.0.0.1'}
        for postcheck in (True,False):
            with patch.object(ops,'require_root'),patch.object(ops,'config',return_value=cfg),patch.object(ops,'require_guard'),patch.object(ops,'run',return_value=subprocess.CompletedProcess([],0,json.dumps(self.rendered()),'')),patch.object(ops,'inspect_dns',return_value={'cowrie':postcheck,'opencanary':True}),patch.object(ops,'compose') as compose,patch.object(hp_common,'audit'),contextlib.redirect_stdout(io.StringIO()):
                if postcheck: ops.start()
                else:
                    with self.assertRaises(SystemExit): ops.start()
                self.assertIn('up',compose.call_args_list[0].args)
                if not postcheck: compose.assert_called_with('stop','cowrie','opencanary',check=False)
    def test_boot_inspection_failure_after_start_stops_only_decoys(self):
        (self.root/'secrets').mkdir();(self.root/'secrets/grafana_admin_password').touch()
        def run(argv,**kwargs):
            if argv[0]=='systemctl': return subprocess.CompletedProcess(argv,0,'','')
            name=argv[-1].removeprefix('honeypot-')
            row={'HostConfig':{'Dns':[policy.DNS[name]],'PortBindings':{'2222/tcp':[{'HostIp':'127.0.0.1'}]}}}
            return subprocess.CompletedProcess(argv,0,json.dumps([row]),'')
        with patch.object(ops,'require_root'),patch.object(ops,'config',return_value={'MANAGEMENT_BIND':'127.0.0.1','DECOY_BIND':'127.0.0.1'}),patch.object(ops,'require_guard'),patch.object(ops,'run',side_effect=run),patch.object(ops,'_start_existing_decoys',side_effect=ValueError('bad inspection')),patch.object(ops,'compose') as compose,patch.object(hp_common,'audit'):
            with self.assertRaises(ValueError): ops.boot_start()
            compose.assert_called_with('stop','cowrie','opencanary',check=False)
            self.assertFalse(any('up' in c.args or 'build' in c.args for c in compose.call_args_list))

class TelemetryTests(unittest.TestCase):
    def test_password_never_enters_searchable_stream(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            import shutil
            shutil.copytree(ROOT/'detections',root/'detections')
            engine=Engine(root)
            for source,raw in [('cowrie',{'password':'SYNTHETIC-COWRIE','eventid':'cowrie.login.failed'}),('opencanary',{'logdata':{'PASSWORD':'SYNTHETIC-CANARY'}})]:
                engine.process(source,raw,source)
                event=normalize(source,raw)
                self.assertTrue(event['password_present']);self.assertNotIn('password',event)
            searchable=''.join(p.read_text() for p in (root/'logs/normalized').glob('*'))
            self.assertNotIn('SYNTHETIC-',searchable)
            evidence=''.join(p.read_text() for p in (root/'incidents').rglob('events.jsonl'))
            self.assertIn('SYNTHETIC-COWRIE',evidence);self.assertIn('SYNTHETIC-CANARY',evidence)
    def test_audit_allowlist_and_nested_redaction(self):
        with tempfile.TemporaryDirectory() as tmp,patch.object(hp_common,'ROOT',Path(tmp)):
            hp_common.audit('test',success=True,password='SECRET1',grafana_admin_password='SECRET2',raw=b'SECRET3',
                            observed={'token':'SECRET4','nested':[{'password':'SECRET5'}]},approval_flags=['--apply','SECRET6'])
            text=(Path(tmp)/'logs/system/audit.jsonl').read_text();row=json.loads(text)
            self.assertNotIn('SECRET',text)
            self.assertEqual(row['approval_flags'],['--apply']);self.assertTrue(row['success'])
            self.assertIn('actor',row);self.assertIn('timestamp',row)
    def test_alloy_uses_sanitized_decoy_sources(self):
        paths=source_paths()
        self.assertEqual(paths['cowrie'],ROOT/'logs/normalized/cowrie.jsonl')
        self.assertIn('parser',paths);self.assertIn('audit',paths)
        self.assertFalse(any('secrets' in str(p) or p.suffix=='.pcap' for p in paths.values()))
    def test_drop_rate_counter_reset_and_initial_sample(self):
        self.assertIsNone(drop_rate({},100,100))
        self.assertEqual(drop_rate({'suricata_kernel_drops':100,'checked_epoch':100},100,160),0)
        self.assertEqual(drop_rate({'suricata_kernel_drops':100,'checked_epoch':100},160,160),1)
        self.assertIsNone(drop_rate({'suricata_kernel_drops':100,'checked_epoch':100},2,160))
    def test_freshness_and_parser_last_hour(self):
        import shutil
        import datetime as dt
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);shutil.copytree(ROOT/'configs',root/'configs')
            path=root/'logs/system/parser-errors.jsonl';path.parent.mkdir(parents=True)
            now=time.time()
            path.write_text('\n'.join(json.dumps({'timestamp':dt.datetime.fromtimestamp(now-age,dt.timezone.utc).isoformat()}) for age in (10,3599,3601)))
            sources,count=snapshot(root,now)
            self.assertEqual(count,2);self.assertTrue(sources['parser']['present'])
            self.assertIsNone(sources['audit']['last_write_age'])
    def test_backup_age_warning_is_optional_and_cumulative_drops_are_not_failure(self):
        import healthcheck
        import shutil
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);shutil.copytree(ROOT/'configs',root/'configs');(root/'state').mkdir()
            eve=root/'logs/suricata/eve.json';eve.parent.mkdir(parents=True)
            eve.write_text(json.dumps({'event_type':'stats','stats':{'capture':{'kernel_drops':100}}})+'\n')
            cfg=hp_common.config(ROOT)
            for required in ('false','true'):
                cfg['BACKUP_REQUIRED']=required
                with patch.object(healthcheck,'ROOT',root),patch.object(healthcheck,'config',return_value=cfg),patch.object(healthcheck,'runtime_path',return_value=root),patch.object(healthcheck,'inspect_guard',return_value={'ok':True,'counters':{}}),patch.object(healthcheck,'inspect_dns',return_value={'cowrie':True,'opencanary':True}),patch.object(healthcheck,'run',return_value=subprocess.CompletedProcess([],0,'[]','')):
                    row=healthcheck.check()
                self.assertEqual(any('Backup' in x for x in row['problems']),required=='true')
                self.assertEqual(any('Backup' in x for x in row['warnings']),required=='false')
                self.assertFalse(any('cumulative' in x for x in row['problems']))
    def test_backup_failure_is_audited(self):
        import backup
        with patch.object(backup,'_backup',side_effect=OSError('disk full')),patch.object(backup,'audit') as audit:
            with self.assertRaises(OSError): backup.backup()
            self.assertEqual(audit.call_args.args[0],'backup.finish')
            self.assertFalse(audit.call_args.kwargs['success'])
    def test_unit_preview_has_no_side_effects(self):
        spec=importlib.util.spec_from_file_location('systemd_install',ROOT/'scripts/install-systemd.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        with patch.object(sys,'argv',['install-systemd.py','--preview']),patch.object(module,'run') as run,patch.object(module,'require_root') as root,contextlib.redirect_stdout(io.StringIO()) as output:
            module.main();run.assert_not_called();root.assert_not_called()
        self.assertIn('honeypot-guard-watch.timer',output.getvalue());self.assertNotIn('@ROOT@',output.getvalue())
        with patch.object(sys,'argv',['install-systemd.py','--install-preview']),patch.object(module,'run') as run,contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit): module.main()
            run.assert_not_called()
        self.assertNotIn('honeypot-guard-watch.service',module.render_units())
    def test_approved_preview_install_never_enables_or_starts(self):
        from types import SimpleNamespace
        spec=importlib.util.spec_from_file_location('systemd_install',ROOT/'scripts/install-systemd.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        writes={}
        class Destination:
            def __init__(self,name): self.name=name
            def __truediv__(self,name): return Destination(name)
            def exists(self): return False
            def write_text(self,text): writes[self.name]=text
        group=SimpleNamespace(getgrgid=lambda gid:SimpleNamespace(gr_name='evidence'))
        units={'honeypot-guard-watch.service':'unit','honeypot-guard-watch.timer':'timer'}
        with patch.object(sys,'argv',['installer','--install-preview','--approved']),patch.dict(sys.modules,{'grp':group}),patch.object(module,'ROOT','/srv/hp'),patch.object(module,'runtime_path',return_value=SimpleNamespace(resolve=lambda:'/var/hp')),patch.object(module,'render_units',return_value=units),patch.object(module,'Path',Destination),patch.object(module,'require_root'),patch.object(module,'audit'),patch.object(module,'run') as run,contextlib.redirect_stdout(io.StringIO()):
            module.main()
        self.assertEqual(writes,units)
        self.assertEqual([call.args[0] for call in run.call_args_list],[['systemctl','daemon-reload']])

if __name__=='__main__': unittest.main()
