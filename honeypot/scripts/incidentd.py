#!/usr/bin/env python3
"""Bounded-window correlation, evidence snapshots, and unprivileged action requests.

No shell evaluation, network access, Docker socket, or direct firewall privileges.
Raw log streams remain authoritative. Journal updates can replay after a crash;
stable event IDs deduplicate incident evidence. Query logs may contain replay IDs.
"""
import collections
import copy
import datetime as dt
import hashlib
import importlib.util
import ipaddress
import json
import os
from pathlib import Path
import re
import shutil
import time
from urllib.parse import urlsplit
from hp_common import ROOT, atomic_json, append_json, runtime_path, sha256, utc, redact

from evidence_store import records as evidence_records, append as evidence_append, commit as evidence_commit, EvidenceIntegrityError, sync_directory, MAX_INCIDENT_BYTES
from evidence_store import EventLocations, ReplayIndexPending, zero_tail_ids

LEVEL={'LOW':0,'MEDIUM':1,'HIGH':2,'CRITICAL':3}
FIELDS={'source_ports':'source_port','destination_ports':'destination_port','services':'service','session_ids':'session_id','usernames':'username','password_attempts':'password','commands':'command','urls':'url','domains':'domain','user_agents':'user_agent','hashes':'sha256','suricata_signatures':'signature','fingerprints':'fingerprint'}

def valid_ip(value):
    try: return str(ipaddress.ip_address(str(value)))
    except ValueError: return ''

def timestamp(value):
    try:
        v=dt.datetime.fromisoformat(str(value).replace('Z','+00:00'))
        if not v.tzinfo: v=v.replace(tzinfo=dt.timezone.utc)
        return v.astimezone(dt.timezone.utc).isoformat().replace('+00:00','Z')
    except (ValueError,TypeError): return utc()

def normalize(source, raw):
    """Schema names are explicit; raw data never chooses a trusted input source."""
    event={'timestamp':timestamp(raw.get('timestamp') or raw.get('utc_time')), 'received_at':utc(),
           'source':source,'source_ip':'','source_port':None,'destination_port':None,
           'service':source,'session_id':'','username':'','password':'','password_present':False,
           'command':'','url':'','domain':'','user_agent':'','sha256':'','signature':'','fingerprint':'',
           'event_type':'probe','severity':'LOW','confidence':0.6,'notes':[]}
    if source == 'cowrie':
        event.update(source_ip=valid_ip(raw.get('src_ip')),source_port=raw.get('src_port'),destination_port=raw.get('dst_port'),
                     service=raw.get('protocol','ssh'),session_id=str(raw.get('session',''))[:128],
                     username=str(raw.get('username',''))[:512],password=str(raw.get('password',''))[:512],
                     password_present='password' in raw,command=str(raw.get('input',''))[:8192],
                     url=str(raw.get('url',''))[:4096],sha256=str(raw.get('shasum','')),
                     fingerprint=str(raw.get('fingerprint') or raw.get('hassh') or raw.get('version',''))[:512],
                     event_type=str(raw.get('eventid','probe')))
        typ=event['event_type']
        if any(x in typ for x in ('login.success','command.input','file_upload','file_download','direct-tcpip')):
            event['severity']='HIGH';event['confidence']=0.95
        if 'login.success' in typ: event['notes'].append('OBSERVED: successful authentication into the emulated honeypot only.')
        if event['command']: event['notes'].append('OBSERVED: emulated shell input; UNKNOWN: execution on the real host.')
    elif source=='opencanary':
        data=raw.get('logdata',{}); data=data if isinstance(data,dict) else {}
        event.update(source_ip=valid_ip(raw.get('src_host')), source_port=raw.get('src_port'),destination_port=raw.get('dst_port'),
                     event_type=str(raw.get('logtype','probe')),username=str(data.get('USERNAME',''))[:512],
                     password=str(data.get('PASSWORD',''))[:512],password_present='PASSWORD' in data,
                     user_agent=str(data.get('USERAGENT',''))[:512],url=str(data.get('PATH',''))[:4096])
        fname=str(data.get('FILENAME') or data.get('FILE') or '')[:512]
        if fname: event['filename']=fname
        event['service']={8080:'http',2121:'ftp',16379:'redis',13306:'mysql',11433:'mssql',15900:'vnc',15060:'sip',1161:'snmp'}.get(event['destination_port'],'opencanary')
        if any(x in event['url'].lower() for x in ('../','/.env','/wp-admin','/phpmyadmin')): event['severity']='MEDIUM'
    elif source=='suricata':
        alert=raw.get('alert',{}); http=raw.get('http',{}); dns=raw.get('dns',{}); tls=raw.get('tls',{})
        event.update(source_ip=valid_ip(raw.get('src_ip')),source_port=raw.get('src_port'),destination_port=raw.get('dest_port'),
                     service=raw.get('app_proto','network'),session_id=str(raw.get('flow_id','')),
                     event_type=raw.get('event_type','probe'),signature=alert.get('signature',''),
                     signature_id=alert.get('signature_id'),url=http.get('url',''),user_agent=http.get('http_user_agent',''),
                     domain=dns.get('rrname') or tls.get('sni',''),sha256=raw.get('fileinfo',{}).get('sha256',''),
                     fingerprint=tls.get('ja3',{}).get('hash',''))
        if alert: event['severity']='MEDIUM'
        if event['source_ip'].startswith(('172.29.40.','172.29.41.')):
            event['notes'].append('OBSERVED: sensor source is a workload IP; UNKNOWN: originating remote actor.')
    elif source=='firewall':
        msg=str(raw.get('MESSAGE',raw.get('message','')))
        pairs=dict(re.findall(r'\b(SRC|DST|SPT|DPT)=([^\s]+)',msg))
        event.update(source_ip=valid_ip(pairs.get('SRC')),event_type='egress.denied',service='firewall',
                     destination_ip=valid_ip(pairs.get('DST')),source_port=pairs.get('SPT'),destination_port=pairs.get('DPT'))
        event['severity']='HIGH'; event['notes'].append('OBSERVED: blocked attempt; not evidence that protected network access succeeded.')
    elif source=='containment':
        event.update(event_type=str(raw.get('action','containment')),source_ip=valid_ip(raw.get('source_ip')),service='containment')
    elif source=='artifact':
        event.update(event_type='artifact.hashed',sha256=raw.get('sha256',''),evidence_path=raw.get('evidence_path',''),service='artifact',severity='HIGH')
    elif source=='boundary':
        # Only operator/host-generated boundary.jsonl; not an attacker-facing input.
        allowed={'host.compromise','container.escape','management.access','protected.access','outbound.attack','unauthorized.host_activity'}
        if raw.get('event_type') in allowed and raw.get('verified') is True:
            event.update(event_type=raw['event_type'],severity='CRITICAL',confidence=0.99,source_ip=valid_ip(raw.get('source_ip')),notes=['OBSERVED: trusted host/operator boundary signal.'])
    if event['url'].startswith(('http://','https://')):
        try: event['domain']=urlsplit(event['url']).hostname or ''
        except ValueError: pass
    if not re.fullmatch('[0-9a-fA-F]{64}',event['sha256']): event['sha256']=''
    return redact(event)

class Engine:
    def __init__(self,root=ROOT):
        self.root=Path(root); self.statepath=self.root/'state/incidentd/state.json'
        self.rules=json.loads((self.root/'detections/correlation/rules.json').read_text())
        self.window=int(os.getenv('CORRELATION_WINDOW_SECONDS',self.rules['window_seconds']))
        if not 60<=self.window<=86400: raise ValueError('Correlation window must be 60..86400 seconds')
        try: self.state=json.loads(self.statepath.read_text())
        except FileNotFoundError: self.state={'offsets':{},'sessions':{},'groups':{},'signals':{}}
        self.incidents=runtime_path('INCIDENT_PATH','incidents',self.root)
        self.artifacts=runtime_path('ARTIFACT_PATH','artifacts',self.root)
        self.captures=runtime_path('PCAP_PATH','captures',self.root)
        self.fast_poll_until=0
        self.blocked_incidents={}
        try: self.locations = EventLocations(self.statepath.with_name('event-locations.sqlite3'), self.incidents)
        except EvidenceIntegrityError as exc:
            self.locator_failure(exc)
            raise
        self.locations_ready = self.locations.ready()
        self.location_backfill_failed = False
        self.evidence_inventory = iter(self.incidents.glob('*/*'))
        self.inspect_existing_evidence()

    def block_incident(self, path, exc):
        self.blocked_incidents[str(path)] = str(exc)
        evidence = path/'events.jsonl'
        digest = {}
        try:
            if evidence.stat().st_size > MAX_INCIDENT_BYTES:
                raise ValueError('Original digest exceeds incident read bound')
            digest['original_sha256'] = sha256(evidence)[0]
        except (OSError, ValueError) as error:
            digest['original_sha256_unavailable'] = str(error)[:200]
        append_json(self.root/'logs/system/evidence-integrity.jsonl', {
            'timestamp':utc(), 'incident_id':path.name, 'path':str(evidence),
            'action':'BLOCK_INCIDENT_WRITES', 'error':str(exc),
            'original_bytes_preserved':True, **digest}, rotate=True)

    def inspect_incident(self, directory, durable=None):
        path = directory/'events.jsonl'
        if durable is None: durable = evidence_records(path)
        metadata = directory/'incident.json'
        # A durable first record without metadata must remain available for exact-ID replay.
        if not metadata.exists(): return durable
        if metadata.is_symlink(): raise EvidenceIntegrityError('Symlink incident metadata')
        if metadata.stat().st_size > 1024**2: raise EvidenceIntegrityError('Incident metadata exceeds bound')
        meta = json.loads(metadata.read_text())
        if not isinstance(meta,dict): raise EvidenceIntegrityError('Incident metadata must be an object')
        if not isinstance(meta.get('related_events'),list) or set(meta['related_events'])-set(durable):
            raise EvidenceIntegrityError('Metadata references missing evidence')
        return durable

    def inspect_existing_evidence(self, budget=32):
        """Incremental historical inspection; active segments are also checked before use."""
        if not self.locations_ready:
            self.locations.prepare_backfill()
            for directory in self.locations.pending(budget):
                if not self.locations.unchanged_pending(directory):
                    self.block_incident(directory, 'Historical files changed since inventory; operator review required')
                    continue
                signatures = self.locations.signatures(directory)
                state, ids, reason = 'indexed', [], ''
                try:
                    if directory.is_symlink() or not directory.is_dir():
                        raise EvidenceIntegrityError('Unsafe incident directory in migration')
                    for name in ('events.jsonl', 'incident.json'):
                        file = directory/name
                        if file.is_symlink() or (file.exists() and not file.is_file()):
                            raise EvidenceIntegrityError('Non-regular or symlink migration input: '+str(file))
                    durable = self.inspect_incident(directory)
                    ids = list(durable)
                except (OSError,EvidenceIntegrityError,ValueError,KeyError,TypeError) as exc:
                    reason = str(exc)
                    try:
                        ids = zero_tail_ids(directory)
                        state = 'quarantined'
                        reason = 'Complete-prefix/NUL-tail incident fenced; original and metadata hashes pinned'
                    except (OSError,EvidenceIntegrityError,ValueError,KeyError,TypeError):
                        state = 'blocked'
                    self.block_incident(directory, reason)
                affected = self.locations.record_inspection(directory, ids, state, signatures, reason)
                for path in affected:
                    self.block_incident(path, 'Ambiguous historical event ID; originals preserved')
            self.locations_ready = self.locations.finish_backfill()
            status = self.locations.status()
            self.location_backfill_failed = bool(status['counts'].get('blocked') or status['inventory_error'])
            atomic_json(self.statepath.with_name('migration-status.json'), {'timestamp':utc(), **status})
            sync_directory(self.statepath.parent)
            return
        for _ in range(budget):
            directory = next(self.evidence_inventory, None)
            if directory is None: break
            try:
                if directory.is_symlink(): raise EvidenceIntegrityError('Symlink incident directory')
                # Index evidence even if its metadata is blocked. Replay must not
                # silently relocate an ID just because its original is unusable.
                durable = evidence_records(directory/'events.jsonl')
                self.locations.remember(directory, durable, evidenced=True)
                self.inspect_incident(directory, durable)
            except (OSError,EvidenceIntegrityError,ValueError,KeyError,TypeError) as exc:
                self.block_incident(directory, exc)

    def locator_failure(self, exc, event_id=None):
        append_json(self.root/'logs/system/event-locator-integrity.jsonl', {
            'timestamp':utc(), 'action':'HOLD_CHECKPOINT', 'event_id':event_id,
            'error':str(exc)}, rotate=True)

    def classify(self,event):
        if event['source']=='suricata':
            event['severity']=self.rules['suricata_severity'].get(str(event.get('signature_id')),event['severity'])
        for rule in self.rules['command_rules']:
            if event['command'] and re.search(rule['regex'],event['command']):
                if LEVEL[rule['severity']]>LEVEL[event['severity']]: event['severity']=rule['severity']
                event['notes'].append('INFERRED: '+rule['id']+' from emulated input, not proof of host compromise.')
        iocs=self.root/'detections/iocs/sha256.txt'
        if event['sha256'] and iocs.exists() and event['sha256'].lower() in {x.strip().lower() for x in iocs.read_text().splitlines() if not x.startswith('#')}:
            event['severity']='HIGH';event['notes'].append('OBSERVED: local reviewed SHA-256 indicator match.')
        import bait
        bait.annotate(event, self.root)
        return event

    def process(self,source,raw,event_id):
        if not self.locations_ready:
            raise ReplayIndexPending('Historical event-location backfill is incomplete; checkpoint held')
        try: located = self.locations.lookup(event_id)
        except EvidenceIntegrityError as exc:
            self.locator_failure(exc, event_id)
            raise
        event=self.classify(normalize(source,raw));event['event_id']=event_id
        sid=event['session_id'];sessions=self.state['sessions']
        if source=='cowrie' and sid:
            if event['source_ip']: sessions[sid]={'ip':event['source_ip'],'port':event['source_port'],'seen':time.time()}
            elif sid in sessions: event['source_ip']=sessions[sid]['ip'];event['source_port']=sessions[sid]['port']
        now=time.time();bucket=int(now//self.window)
        # Receipt-time windows prevent forged timestamps from spraying unbounded paths.
        identity=event['source_ip'] or (source+':'+(sid or 'unknown'))
        key=hashlib.sha256(f'{identity}:{bucket}'.encode()).hexdigest()[:24]
        segment=self.state['groups'].get(key,{'segment':0,'seen':now})
        while True:
            incident_id=f'{key}-{segment["segment"]:04d}'
            path = located[0] if located else self.incidents/dt.datetime.fromtimestamp(now,dt.timezone.utc).strftime('%Y-%m-%d')/incident_id
            incident_id = path.name
            ipath=path/'incident.json'
            if path.is_symlink(): raise EvidenceIntegrityError('Symlink incident directory')
            if str(path) in self.blocked_incidents or self.locations.blocked(path):
                if located: raise EvidenceIntegrityError('Replay location is blocked: '+str(path))
                segment['segment'] += 1
                continue
            try:
                durable = self.inspect_incident(path)
            except (OSError,EvidenceIntegrityError,ValueError,KeyError,TypeError) as exc:
                self.block_incident(path, exc)
                if located: raise EvidenceIntegrityError('Replay location is unusable: '+str(path)) from exc
                segment['segment'] += 1
                continue
            if event_id in durable:
                saved = durable[event_id]
                if saved['raw'] != raw or saved['normalized']['source'] != source:
                    raise EvidenceIntegrityError('Replay source differs from retained evidence')
                # Initialize missing metadata from the original receipt, including
                # timestamp fallbacks and session enrichment, before using it.
                event = saved['normalized'].copy()
            elif located and located[1]:
                raise EvidenceIntegrityError('Located replay evidence is missing')
            if ipath.exists(): incident=json.loads(ipath.read_text())
            else:
                incident={'incident_id':incident_id,'severity':'LOW','confidence':0.6,'timestamp_start':event['timestamp'],
                          'timestamp_end':event['timestamp'],'source_ip':event['source_ip'],'related_events':[],
                          'evidence_paths':[],'containment_actions':[],'notes':[], 'correlation_links':[], 'auth_attempt_count':0,
                          **{k:[] for k in FIELDS}}
            if set(incident['related_events'])-set(durable):
                raise EvidenceIntegrityError(f'Metadata references missing evidence: {ipath}')
            if event_id in incident['related_events']:
                evidence_append(path/'events.jsonl',durable[event_id])
                self.locations.remember(path, [event_id], evidenced=True)
                evidence_commit(ipath,incident)
                self.publish(path, incident, event)
                return
            orphan_ids=set(durable)-set(incident['related_events'])
            if orphan_ids-{event_id}:
                # Leave the orphan bytes available for operator review; never invent metadata.
                self.block_incident(path, 'Uncommitted evidence requires exact-ID replay')
                if located: raise EvidenceIntegrityError('Replay location has other uncommitted evidence')
                segment['segment'] += 1
                continue
            record = durable.get(event_id, {'event_id':event_id,'normalized':event,'raw':raw})
            record_bytes = len((json.dumps(record,ensure_ascii=True,separators=(',',':'))+'\n').encode())
            current_bytes = (path/'events.jsonl').stat().st_size if (path/'events.jsonl').exists() else 0
            if record_bytes > MAX_INCIDENT_BYTES: raise EvidenceIntegrityError('Single event exceeds evidence bound')
            if (len(incident['related_events'])<self.rules['max_events_per_incident'] and
                    (event_id in durable or current_bytes+record_bytes<=MAX_INCIDENT_BYTES)): break
            if located: raise EvidenceIntegrityError('Reserved replay location exceeds incident bounds')
            segment['segment']+=1
        if not located:
            segment['seen']=now;self.state['groups'][key]=segment
        for dst,src in FIELDS.items():
            value=event.get(src)
            if value is not None and value!='' and value not in incident[dst]:
                if len(incident[dst])<self.rules['max_field_values']: incident[dst].append(value)
                elif 'Field lists capped; inspect events.jsonl for complete values.' not in incident['notes']:
                    incident['notes'].append('Field lists capped; inspect events.jsonl for complete values.')
        if event['password_present'] or 'login.failed' in event['event_type']: incident['auth_attempt_count']+=1
        if incident['auth_attempt_count']>=self.rules['auth_threshold'] or len(incident['services'])>=self.rules['service_threshold']:
            if LEVEL[event['severity']]<1: event['severity']='MEDIUM'
        # Shared signals link separate incidents; credentials/UA alone NEVER merge identities.
        signals=self.state['signals']
        cmd=' '.join(re.sub(r'\b\d+\b','#',event['command'].lower()).split())
        for field,value in ([] if located else [(f,event.get(f,'')) for f in ('username','fingerprint','user_agent','domain','url','sha256')]+[('command_similarity',cmd)]):
            if not value: continue
            sk=hashlib.sha256((field+':'+str(value)).encode()).hexdigest()
            previous=signals.get(sk)
            if previous and previous['id']!=incident_id and now-previous['seen']<=self.window:
                link={'incident_id':previous['id'],'signal':field,'assessment':'INFERRED association; not identity proof'}
                if link not in incident['correlation_links'] and len(incident['correlation_links'])<100: incident['correlation_links'].append(link)
            signals[sk]={'id':incident_id,'seen':now}
        if LEVEL[event['severity']]>LEVEL[incident['severity']]: incident['severity']=event['severity']
        incident['confidence']=max(incident['confidence'],event['confidence'])
        incident['timestamp_end']=max(incident['timestamp_end'],event['timestamp'])
        incident['related_events'].append(event_id)
        for note in event['notes']:
            if note not in incident['notes']: incident['notes'].append(note)
        path.mkdir(parents=True,exist_ok=True)
        sync_directory(path.parent)
        sync_directory(self.incidents)
        self.locations.remember(path, [event_id])
        evidence_append(path/'events.jsonl',durable.get(event_id,{'event_id':event_id,'normalized':event,'raw':raw}))
        self.locations.remember(path, [event_id], evidenced=True)
        if event['command']:
            with (path/'commands.txt').open('a',encoding='utf-8') as f: f.write(json.dumps(event['command'])+'\n')
        (path/'hashes.txt').write_text('\n'.join(incident['hashes'])+'\n')
        if not (path/'commands.txt').exists(): (path/'commands.txt').touch(mode=0o640)
        incident['evidence_paths']=['incident.json','incident.md','events.jsonl','commands.txt','hashes.txt','metadata.json']
        if LEVEL[incident['severity']]>=2:
            self.fast_poll_until=time.time()+300
            self.preserve(path,incident,event)
        evidence_commit(ipath,incident)
        self.publish(path, incident, event)
        self.prune(now)

    def publish(self, path, incident, event):
        """At-least-once projections must complete before source checkpoints advance."""
        self.report(path,incident)
        self.publish_row('events.jsonl', event)
        if event['source'] in ('cowrie', 'opencanary'):
            self.publish_row(f"{event['source']}.jsonl", event)
        incident_id = incident['incident_id']
        self.publish_row('incidents.jsonl',{'timestamp':utc(),'incident_id':incident_id,'severity':incident['severity'],'source_ip':incident['source_ip'],'event_count':len(incident['related_events'])})
        if incident['severity']=='CRITICAL':
            atomic_json(self.root/'state/incidentd/requests'/f'{incident_id}.json',{'incident_id':incident_id,'path':str(path.relative_to(self.incidents)),'action':'quarantine-decoys','timestamp':utc()})

    def publish_row(self, name, row):
        path = self.root/'logs/normalized'/name
        append_json(path, row, rotate=True)
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        try: os.fsync(fd)
        finally: os.close(fd)
        sync_directory(path.parent)
        sync_directory(path.parent.parent)

    def prune(self,now):
        for key,limit in [('signals',20000),('sessions',10000),('groups',10000)]:
            values=self.state[key]
            self.state[key]={k:v for k,v in sorted(values.items(),key=lambda p:p[1]['seen'],reverse=True)[:limit] if now-v['seen']<self.window*2}

    def preserve(self,path,incident,event):
        for name in ('pcap','artifacts'): (path/name).mkdir(exist_ok=True)
        mp=path/'metadata.json'
        meta=json.loads(mp.read_text()) if mp.exists() else {'created_at':utc(),'copies':[],'limitations':[],'pcap_snapshotted':False}
        copied={r['source'] for r in meta['copies']}
        # Max three closed segments per incident, max 350MB. Active capture is not copied.
        if not meta.get('pcap_snapshotted',False):
            candidates=sorted([p for p in self.captures.glob('*.pcap*') if p.is_file() and not p.is_symlink()],key=lambda p:p.stat().st_mtime)
            start=dt.datetime.fromisoformat(incident['timestamp_start'].replace('Z','+00:00')).timestamp()
            selected=[p for p in candidates[:-1] if p.stat().st_mtime>=start-self.window][-3:]
            for p in selected: self.copy_evidence(p,path/'pcap',meta,350*1024**2)
            meta['pcap_snapshotted']=True
            meta['limitations'].append('Closed ring segments only, maximum three and 350MB total per snapshot; encrypted SSH contents unavailable. Snapshot may lack the event; use preserve-evidence.sh after rotation for a later snapshot.')
        if event.get('sha256'):
            manifest=self.artifacts/'sha256-manifest.jsonl'
            if manifest.exists():
                with manifest.open() as stream:
                    for line in stream:
                        try: record=json.loads(line)
                        except ValueError: continue
                        if record.get('sha256')!=event['sha256']: continue
                        p=self.artifacts/record['evidence_path']
                        try:
                            p.resolve().relative_to(self.artifacts.resolve())
                            if str(p) not in copied: self.copy_evidence(p,path/'artifacts',meta,50*1024**2)
                        except (ValueError,OSError): pass
        atomic_json(mp,meta)
        incident['evidence_paths'] += ['pcap/','artifacts/']

    def copy_evidence(self,p,dest,meta,budget):
        try:
            if p.is_symlink() or not p.is_file(): return
            if sum(x.stat().st_size for x in dest.iterdir())+p.stat().st_size>budget:
                meta['limitations'].append('Copy budget exceeded: '+p.name); return
            digest,size=sha256(p)
            target=dest/(digest+'.'+('pcapng' if dest.name=='pcap' else 'bin'))
            if target.exists(): return
            # Exclusive create and source O_NOFOLLOW through hash verification; race fails verification.
            fd=os.open(p,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0)|getattr(os,'O_NONBLOCK',0))
            import stat
            with os.fdopen(fd,'rb') as src, target.open('xb') as out:
                if not stat.S_ISREG(os.fstat(src.fileno()).st_mode): raise ValueError('Non-regular source')
                shutil.copyfileobj(src,out,1024*1024)
            os.chmod(target,0o640)
            actual,_=sha256(target)
            meta['copies'].append({'source':str(p),'destination':str(target.name),'sha256':actual,'size':size,'timestamp':utc(),'verified_stable':actual==digest})
            if actual!=digest: meta['limitations'].append('Copy changed during acquisition: '+p.name)
        except (OSError,ValueError) as exc: meta['limitations'].append(type(exc).__name__+': '+str(p))

    def report(self,path,incident):
        if not (path/'metadata.json').exists(): atomic_json(path/'metadata.json',{'created_at':utc(),'copies':[],'limitations':['PCAP preservation begins at HIGH severity.']})
        text=f"# Incident {incident['incident_id']}\n\nSeverity: **{incident['severity']}**; confidence: {incident['confidence']}\n\n"
        text+=f"OBSERVED: {len(incident['related_events'])} events; source IP `{incident['source_ip'] or 'UNKNOWN'}`; {incident['timestamp_start']} to {incident['timestamp_end']}.\n\n"
        text+='INFERRED: temporal and shared-signal associations are hypotheses. Emulated shell commands show intent, not host execution.\n\n'
        text+='UNKNOWN: human identity, external impact, and host compromise unless independently verified.\n\n'
        text+='Notes (JSON-escaped untrusted content):\n\n'+''.join('- '+json.dumps(n)+'\n' for n in incident['notes'])
        text+='\nSee incident.json, events.jsonl and metadata.json for source records, links, custody hashes and collection gaps.\n'
        (path/'incident.md').write_text(text,encoding='utf-8')

    def poll(self):
        before=copy.deepcopy(self.state)
        try:
            return self._poll()
        except Exception:
            self.state=before
            raise

    def _poll(self):
        self.inspect_existing_evidence()
        if not self.locations_ready:
            # Bounded migration work continues on later polls without reading
            # sources or claiming their checkpoints. Corruption keeps this gate shut.
            return
        modpath=Path(__file__).with_name('hash-artifacts.py')
        spec=importlib.util.spec_from_file_location('hasher',modpath);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
        mod.scan(self.artifacts)
        paths={'cowrie':'logs/cowrie/cowrie.json','opencanary':'logs/opencanary/opencanary.json','suricata':'logs/suricata/eve.json','firewall':'logs/firewall/events.jsonl','containment':'logs/system/containment.jsonl','boundary':'trusted/boundary.jsonl'}
        paths['artifact']=str(self.artifacts/'sha256-manifest.jsonl')
        for source,name in paths.items():
            p=self.root/name
            if not p.exists(): continue
            stat=p.stat();ident=f'{stat.st_dev}:{stat.st_ino}'
            old=self.state['offsets'].get(name,{})
            offset=old.get('offset',0) if old.get('inode')==ident and stat.st_size>=old.get('offset',0) else 0
            with p.open('rb') as f:
                f.seek(offset)
                for _ in range(1000):
                    pos=f.tell();line=f.readline(self.rules['max_line_bytes']+1)
                    if not line or not line.endswith(b'\n'):
                        if len(line)>self.rules['max_line_bytes']:
                            # Skip a malformed oversized line, never allocate unbounded memory.
                            while line and not line.endswith(b'\n'): line=f.readline(self.rules['max_line_bytes'])
                            append_json(self.root/'logs/system/parser-errors.jsonl',{'timestamp':utc(),'source':source,'offset':pos,'error':'oversized line skipped'},rotate=True)
                            offset=f.tell();continue
                        break
                    eid=hashlib.sha256((name+ident+str(pos)).encode()+line).hexdigest()
                    try:
                        raw=json.loads(line)
                        if not isinstance(raw,dict): raise ValueError('Object required')
                        self.process(source,raw,eid)
                    except (ValueError,TypeError,AttributeError) as exc:
                        append_json(self.root/'logs/system/parser-errors.jsonl',{'timestamp':utc(),'source':source,'offset':pos,'error':type(exc).__name__},rotate=True)
                    offset=f.tell()
            self.state['offsets'][name]={'inode':ident,'offset':offset}
        evidence_commit(self.statepath,self.state)
        hb=self.root/'state/incidentd/heartbeat';hb.parent.mkdir(parents=True,exist_ok=True);hb.touch()

if __name__=='__main__':
    os.umask(0o027)
    engine=Engine()
    while True:
        try: engine.poll()
        except Exception as exc:
            append_json(ROOT/'logs/system/incidentd-errors.jsonl',{'timestamp':utc(),'error':type(exc).__name__,'detail':str(exc)[:500]},rotate=True)
            raise
        time.sleep(1 if time.time()<engine.fast_poll_until else 5)
