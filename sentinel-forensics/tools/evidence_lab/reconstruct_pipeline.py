"""Bounded local reference decoding and source-backed TLS classifications.

This module makes no network requests and never changes the original case.
"""
import collections
from contextlib import closing
import hashlib
import ipaddress
import json
import os
import re
from pathlib import Path
import sqlite3
import struct
import tempfile
import time
from core import IngestError, MAX_RECORD, Reader, canonical
import capture
import network
import oracle
from reconstruct_stream import ClassicCohortStream, classic_validator
from reconstruct_profile import STANDARD

MAX_BYTES=MAX_RECORD
MAX_SEGMENTS=512
MAX_LINKS=65536
MAX_REFERENCES=16384
MAX_PREFIX=65536

class ReconstructionError(IngestError):
    pass

def require(value,code):
    if not value: raise ReconstructionError(code)

def open_db(path,guard=lambda:None):
    db=sqlite3.connect(path,check_same_thread=False)
    db.execute('PRAGMA journal_mode=OFF')
    db.execute('PRAGMA synchronous=OFF')
    db.execute('PRAGMA cache_size=-4096')
    db.execute('PRAGMA temp_store=FILE')
    db.execute('PRAGMA trusted_schema=OFF')
    db.execute('PRAGMA max_page_count=16384')
    db.enable_load_extension(False)
    db.setlimit(sqlite3.SQLITE_LIMIT_LENGTH,MAX_RECORD)
    db.setlimit(sqlite3.SQLITE_LIMIT_ATTACHED,0)
    db.set_progress_handler(lambda:(guard() or 0),10000)
    return db

PREFERENCES = {'tcp.desegment_tcp_streams':'TRUE','tcp.reassemble_out_of_order':'TRUE',
    'tcp.analyze_sequence_numbers':'TRUE','tcp.check_checksum':'FALSE',
    'tcp.track_bytes_in_flight':'FALSE','tcp.calculate_timestamps':'FALSE',
    'ip.defragment':'FALSE','ipv6.defragment':'FALSE',
    'tls.desegment_ssl_records':'TRUE','tls.desegment_ssl_application_data':'FALSE',
    'tls.keylog_file':'','tls.debug_file':''}

FIELDS = ['frame.number','frame.protocols','frame.cap_len','frame.len',
    'ip.src','ip.dst','ipv6.src','ipv6.dst','tcp.srcport','tcp.dstport',
    'tcp.stream','tcp.seq_raw','tcp.len','tcp.flags',
    'sentinel_tls_scope.offset','sentinel_tls_scope.length',
    'tcp.segment','tcp.reassembled.length','tcp.segment.overlap.conflict',
    'tcp.segment.error','tcp.segment.multipletails','tcp.segment.toolongfragment',
    'tls.record.content_type','tls.record.length','tls.handshake.type','tls.handshake.length',
    'tls.handshake.fragment','tls.segment.overlap.conflict','tls.segment.error',
    'tls.handshake.cipher_suites_length','tls.handshake.ciphersuite',
    'tls.handshake.extensions.supported_version','sentinel_tls_scope.legacy_version_hex',
    'sentinel_tls_scope.server_name_hex','sentinel_tls_scope.server_name_count']

LUA = '''local p=Proto("sentinel_tls_scope","TLS scope source ranges")
local off=ProtoField.int32("sentinel_tls_scope.offset","Source TCP payload offset")
local size=ProtoField.uint32("sentinel_tls_scope.length","Captured TCP payload length")
local version_hex=ProtoField.string("sentinel_tls_scope.legacy_version_hex","Hello version source octets")
local sni_hex=ProtoField.string("sentinel_tls_scope.server_name_hex","Hello name source octets")
local sni_count=ProtoField.uint32("sentinel_tls_scope.server_name_count","Hello name field occurrences")
p.fields={off,size,version_hex,sni_hex,sni_count}
local payload=Field.new("tcp.payload")
local version=Field.new("tls.handshake.version")
local ok,legacy_version=pcall(Field.new,"tls.handshake.legacy_version")
if not ok then legacy_version=nil end
local sni=Field.new("tls.handshake.extensions_server_name")
function p.dissector(buffer,pinfo,tree)
  local info,extra=payload()
  if info==nil or extra~=nil or info.generated then return end
  local range=info.range
  if range==nil then return end
  local offset=range:tvb():offset()
  if offset<0 then return end
  tree:add(off,offset)
  tree:add(size,range:len())
  -- Prefer the legacy field only when it owns an exact source range. Newer
  -- dissectors also use that name for a generated FT_NONE warning label;
  -- the numeric version FieldInfo still owns the two original source octets.
  -- No manual TLS offset or negotiated supported-version value is substituted.
  local function source_version(get)
    if get==nil then return nil,false end
    local value,extra=get()
    if extra~=nil then return nil,true end
    if value~=nil and not value.generated and value.range~=nil and value.range:len()==2 then
      return value,false
    end
    return nil,false
  end
  local v,ambiguous=source_version(legacy_version)
  if v==nil and not ambiguous then v,ambiguous=source_version(version) end
  if v~=nil and not ambiguous then
    tree:add(version_hex,string.format("%04x",v.range:uint()))
  end
  local names={sni()}
  tree:add(sni_count,#names)
  if #names==1 and not names[1].generated and names[1].range~=nil and names[1].range:len()<=253 then
    local r=names[1].range
    local parts={}
    for i=0,r:len()-1 do parts[#parts+1]=string.format("%02x",r(i,1):uint()) end
    tree:add(sni_hex,table.concat(parts))
  end
end
register_postdissector(p)
'''

def numbers(value):
    result=[]
    for token in value.split(',') if value else []:
        require(len(result)<MAX_SEGMENTS and re.fullmatch(r'(?:0x[0-9a-fA-F]{1,8}|[0-9]{1,10})',token),
                'reference_numeric_vector_invalid_or_oversize')
        result.append(int(token,16 if token.startswith('0x') else 10))
    return result

def scalar(value):
    values = numbers(value)
    require(len(values)==1,'required_reference_scalar_missing_or_ambiguous')
    return values[0]

def flagged(value):
    require(all(token in ('1','0','True','False','true','false')
                for token in value.split(',') if token),'reference_boolean_invalid')
    return any(token in ('1','True','true') for token in value.split(','))


HELLO_FIELDS=FIELDS[-6:]


def hello_matches(native,reference):
    """Compare every emitted native Hello field with unambiguous reference data.

    Raw names are represented as hex by fixed Lua so commas/newlines cannot
    manufacture multiple fields. Client supported-version lists are not a
    selected server version. Missing/compound data never selects first/last.
    """
    try:
        require(isinstance(native,dict) and native.get('decryption') is False,
                'hello_native_shape')
        require(isinstance(reference,dict) and all(isinstance(reference.get(key),str)
                for key in HELLO_FIELDS),'hello_reference_shape')
        typ=native['handshake_type']
        require(typ in ('client_hello','server_hello'),'hello_native_type')
        fields={'handshake_type','legacy_version','decryption',
                'cipher_suite_count' if typ=='client_hello' else 'cipher_suite'}
        fields|={key for key in ('server_name','selected_version') if key in native}
        require(set(native)==fields,'hello_uncompared_native_fields')
        require(type(native['legacy_version']) is int,'hello_native_version')
        raw=reference['sentinel_tls_scope.legacy_version_hex']
        require(isinstance(raw,str) and re.fullmatch('[0-9a-fA-F]{4}',raw)
                and int(raw,16)==native['legacy_version'],'hello_version_reference')
        sizes=numbers(reference['tls.handshake.cipher_suites_length'])
        ciphers=numbers(reference['tls.handshake.ciphersuite'])
        selected=numbers(reference['tls.handshake.extensions.supported_version'])
        require(all(value<=65535 for value in ciphers+selected),'hello_reference_range')
        if typ=='client_hello':
            count=native['cipher_suite_count']
            require(type(count) is int and count>=0 and sizes==[count*2]
                    and len(ciphers)==count and 'selected_version' not in native,
                    'hello_client_cipher_reference')
        else:
            require(type(native['cipher_suite']) is int and ciphers==[native['cipher_suite']]
                    and not sizes,'hello_server_cipher_reference')
            require(selected==([native['selected_version']] if 'selected_version' in native else []),
                    'hello_selected_version_reference')
            require('selected_version' not in native or type(native['selected_version']) is int,
                    'hello_native_selected_version')
        count=numbers(reference['sentinel_tls_scope.server_name_count'])
        raw=reference['sentinel_tls_scope.server_name_hex']
        require(isinstance(raw,str) and len(raw)<=506 and len(raw)%2==0
                and re.fullmatch('[0-9a-fA-F]*',raw),'hello_name_reference_encoding')
        if 'server_name' in native:
            require(typ=='client_hello' and isinstance(native['server_name'],str)
                    and count==[1] and bytes.fromhex(raw).decode('ascii','backslashreplace')==native['server_name'],
                    'hello_name_reference')
        else:
            require(count==[0] and raw=='','hello_name_absence_reference')
        return True
    except (ReconstructionError,KeyError,ValueError,TypeError):
        return False

class FieldSink:
    """One pipe-drain thread owns its SQLite connection and bounded line buffer."""
    def __init__(self,dbpath,reference_layers,guard=lambda:None):
        self.guard=guard
        self.path,self.layers = dbpath,reference_layers
        self.buffer=b''; self.db=None; self.rows=self.tcp_rows=self.skipped=0; self.failed=None

    def write(self,chunk):
        try:
            self.guard()
            if self.db is None: self.db=open_db(self.path,self.guard)
            self.buffer += chunk
            while b'\n' in self.buffer:
                line,self.buffer = self.buffer.split(b'\n',1)
                require(len(line)<=MAX_BYTES,'reference_line_budget')
                self.row(line)
            require(len(self.buffer)<=MAX_BYTES,'reference_line_budget')
        except (ReconstructionError,sqlite3.Error) as exc:
            self.failed = str(exc) if isinstance(exc,ReconstructionError) else 'reference_sqlite_failed'
            raise ValueError('bounded_reference_sink_failed') from None

    def row(self,line):
        values=line.decode('utf-8').split('\t')
        require(len(values)<=len(FIELDS),'reference_field_count')
        fields=dict(zip(FIELDS,values+['']*(len(FIELDS)-len(values))))
        self.rows+=1
        frame=scalar(fields['frame.number'])
        require(frame==self.rows and self.db.execute('SELECT 1 FROM frames WHERE frame=?',(frame,)).fetchone(),
                'reference_frame_count_or_order_mismatch')
        stack=fields['frame.protocols'].split(':')
        require(len(stack)<=128 and len(fields['frame.protocols'])<=2048,'reference_stack_budget')
        net,transport=self.layers(fields['frame.protocols'])
        prefix=stack[:stack.index(net)] if net in stack else []
        outer=(net in ('ip','ipv6') and transport=='tcp' and
               all(layer in ('eth','ethertype','vlan','ieee8021ad','raw') for layer in prefix))
        if not outer:
            self.skipped+=1
            return
        self.tcp_rows+=1
        stream,seq,length,flags=(scalar(fields[name]) for name in
            ('tcp.stream','tcp.seq_raw','tcp.len','tcp.flags'))
        require(seq<2**32 and length<=MAX_BYTES and flags<512,'reference_tcp_bounds')
        ports=[scalar(fields[name]) for name in ('tcp.srcport','tcp.dstport')]
        require(all(port<=65535 for port in ports),'reference_tcp_port_bounds')
        addresses=[fields[name] for name in (('ip.src','ip.dst') if net=='ip' else ('ipv6.src','ipv6.dst'))]
        require(all(',' not in value and len(value)<=64 for value in addresses),'reference_endpoint_ambiguity')
        endpoints=[(ipaddress.ip_address(value).packed,port) for value,port in zip(addresses,ports)]
        require(endpoints[0]!=endpoints[1],'reference_direction_ambiguous')
        direction=int(endpoints[0]>endpoints[1])
        po=scalar(fields['sentinel_tls_scope.offset']) if fields['sentinel_tls_scope.offset'] else None
        pl=scalar(fields['sentinel_tls_scope.length']) if fields['sentinel_tls_scope.length'] else None
        require((po is None)==(pl is None),'reference_payload_range_alignment')
        if po is not None:
            require(po<=MAX_BYTES and pl<=length and po+pl<=scalar(fields['frame.cap_len']),
                    'reference_payload_range_bounds')
        if length:
            self.db.execute('INSERT INTO segments VALUES (?,?,?,?,?,?,?)',
                (frame,stream,direction,(seq+bool(flags&2))%(2**32),length,po,pl))
        refs=numbers(fields['tcp.segment'])
        if refs or fields['tls.record.content_type'] or fields['tls.handshake.type']:
            vectors=[numbers(fields[name]) for name in ('tcp.reassembled.length','tls.record.content_type',
                'tls.record.length','tls.handshake.type','tls.handshake.length','tls.handshake.fragment')]
            conflict=flagged(fields['tcp.segment.overlap.conflict']) or flagged(fields['tls.segment.overlap.conflict'])
            error=(bool(fields['tcp.segment.error'] or fields['tls.segment.error']) or
                   flagged(fields['tcp.segment.multipletails']) or flagged(fields['tcp.segment.toolongfragment']))
            self.db.execute('INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                (frame,stream,direction,json.dumps(refs),*[json.dumps(vector) for vector in vectors],int(conflict),int(error)))
        if self.rows%1000==0:self.db.commit();self.guard()

    def close(self):
        try:
            require(not self.buffer,'reference_unterminated_line')
            if self.db is not None:self.db.commit()
        finally:
            if self.db is not None:self.db.close();self.db=None


def read_packet(stream, source, reference, validator, guard=lambda:None):
    guard()
    stream.seek(reference.offset)
    raw = stream.read(reference.length)
    require(len(raw) == reference.length
            and hashlib.sha256(raw).hexdigest() == reference.sha256,
            'selected_source_record_hash_mismatch')
    packet = validator(source['header'], raw)
    require(packet.sha256 == reference.sha256 and packet.length == reference.length,
            'selected_source_record_parser_mismatch')
    return packet


def classify_batch(db, cached, source, stream, refs, validator, guard=lambda:None,limits=None):
    """Reuse v4 byte-union/reference predicate with original-reference reads."""
    windows, byframe, links = {}, collections.defaultdict(list), 0
    limits=limits or {'segments_per_candidate':MAX_SEGMENTS,'support_links':MAX_LINKS,
                      'support_references':MAX_REFERENCES}
    def indeterminate(frame, reason):
        db.execute('INSERT INTO classifications VALUES(?,?,?,?,?,?,?,?,?)',
                   (frame,'reference_indeterminate',reason,None,None,None,None,0,None))
    for frame,prefix in cached.items():
        guard()
        row = db.execute('SELECT stream,direction,seq,length,payload_offset,payload_length FROM segments WHERE frame=?',
                         (frame,)).fetchone()
        if row is None or row[4] is None or row[5] < 5:
            indeterminate(frame,'candidate_source_range_unavailable'); continue
        tcp_stream,direction,base,length,po,pl = row
        if po+5 > len(prefix) or prefix[po:po+2] != b'\x16\x03':
            indeterminate(frame,'candidate_source_header_reference_mismatch'); continue
        need = 5+int.from_bytes(prefix[po+3:po+5],'big')
        if not 5 <= need <= 18437 or need <= min(length,pl):
            indeterminate(frame,'candidate_record_extent_reference_mismatch'); continue
        cohort = refs[frame-1].cohort
        syns = db.execute('SELECT COUNT(DISTINCT seq_raw) FROM assignments WHERE stream=? AND direction=? AND flags&2!=0',
                          (tcp_stream,direction)).fetchone()[0]
        closed = False
        reopened = False
        for (flags,) in db.execute('SELECT flags FROM assignments WHERE stream=? AND direction=? ORDER BY frame',
                                  (tcp_stream,direction)):
            if flags & 2 and closed: reopened = True
            if flags & (1|4): closed = True
        window = {'bytes':bytearray(need), 'seen':bytearray(need), 'conflicts':0,
                  'identical':0, 'need':need, 'stream':tcp_stream, 'direction':direction,
                  'context':cohort, 'base':base, 'ambiguous':syns>1 or reopened,
                  'metadata_missing':False,'support':0}
        windows[frame] = window
        for other,seq,n,offset,captured,context in db.execute('''SELECT s.frame,s.seq,s.length,
                s.payload_offset,s.payload_length,f.context FROM segments s JOIN frames f USING(frame)
                WHERE s.stream=? AND s.direction=? ORDER BY s.frame''',(tcp_stream,direction)):
            if context != cohort:
                window['ambiguous'] = True; continue
            # Raw sequence half-space ambiguity is retained conservatively;
            # this probe does not reconstruct an extended sequence epoch.
            if abs(seq-base) >= 2**31:
                window['ambiguous'] = True
            rel = (seq-base) % (2**32)
            if rel >= 2**31: rel -= 2**32
            if rel+n <= 0 or rel >= need:
                continue
            if offset is None or captured is None:
                window['metadata_missing'] = True; continue
            start,end = max(0,rel),min(need,rel+captured)
            if end <= start:
                continue
            window['support'] += 1; links += 1
            require(window['support'] <= limits['segments_per_candidate'] and links <= limits['support_links'],
                    'support_segment_or_link_budget')
            require(other in byframe or len(byframe) < limits['support_references'],
                    'support_reference_budget')
            byframe[other].append((frame,start,start-rel,end-start,offset))
            db.execute('INSERT INTO support VALUES(?,?,?,?,?)',(frame,other,start,start-rel,end-start))
    cached.clear()
    for frame, selections in byframe.items():
        require(1 <= frame <= len(refs), 'support_reference_mapping_missing')
        ref = refs[frame-1]
        packet = read_packet(stream,source,ref,validator,guard)
        for target,start,skip,n,offset in selections:
            require(offset+skip+n <= len(packet.payload),'support_source_slice_bounds')
            window = windows[target]
            for pos,byte in enumerate(packet.payload[offset+skip:offset+skip+n],start):
                if window['seen'][pos]:
                    if window['bytes'][pos] != byte: window['conflicts'] += 1
                    else: window['identical'] += 1
                else:
                    window['seen'][pos] = 1; window['bytes'][pos] = byte
        db.execute('INSERT INTO references_checked VALUES(?,?,?,?,?)',
                   (frame,ref.ordinal,ref.offset,ref.length,ref.sha256))
    for frame,window in windows.items():
        guard(); missing = window['seen'].count(0); completion = None
        if window['ambiguous']:
            category,reason = 'reference_indeterminate','cohort_or_sequence_assignment_ambiguous'
        elif window['metadata_missing']:
            category,reason = 'reference_indeterminate','intersecting_payload_range_unavailable'
        elif window['conflicts']:
            category,reason = 'conflicting_overlap','source_bytes_disagree_in_overlap'
        elif missing:
            category,reason = 'source_byte_range_missing','not_covered_in_reference_connection_and_cohort'
        else:
            matched = []
            reference_ambiguity = False
            for event in db.execute('''SELECT frame,refs,reassembled,types,lengths,handshakes,
                    handshake_lengths,handshake_fragments,conflict,error FROM events
                    WHERE stream=? AND direction=? ORDER BY frame''',(window['stream'],window['direction'])):
                last,rs,total,types,ls,hs,hslen,fragments,conflict,error = event
                rs,total,types,ls,hs,hslen,fragments = map(json.loads,(rs,total,types,ls,hs,hslen,fragments))
                if frame not in rs:
                    continue
                if total != [window['need']] or types != [22] or ls != [window['need']-5] or conflict or error:
                    reference_ambiguity = True
                    continue
                if frame in rs:
                    aligned = bool(rs) and len(set(rs)) == len(rs)
                    intervals = []
                    contributors = rs if last in rs else rs+[last]
                    for ref in contributors:
                        contributor = db.execute('''SELECT s.stream,s.direction,f.context,
                            s.seq,s.length,s.payload_length FROM frames f JOIN segments s USING(frame)
                            WHERE f.frame=?''',(ref,)).fetchone()
                        if contributor is None or contributor[:3] != (
                                window['stream'],window['direction'],window['context']):
                            aligned = False; break
                        seq,n,captured = contributor[3:]
                        rel = (seq-window['base'])%(2**32)
                        # Without independently exported consumed offsets, a
                        # contributor extending before/after this exact record
                        # cannot prove the candidate is its first byte.
                        if rel >= 2**31 or captured is None or rel+n > window['need']:
                            aligned = False; break
                        intervals.append((rel,rel+captured))
                    covered = 0
                    for start,end in sorted(intervals):
                        if start > covered: aligned = False; break
                        covered = max(covered,end)
                    aligned = aligned and covered == window['need']
                    if aligned: matched.append((last,hs,hslen,fragments))
                    else: reference_ambiguity = True
            try:
                apps = network.tls(bytes(window['bytes'])); native_error = False
            except (ValueError,struct.error):
                apps = []; native_error = True
            if reference_ambiguity or len(matched) != 1 or native_error:
                category,reason = 'reference_indeterminate','complete_source_bytes_without_unambiguous_reference_record'
            else:
                completion,hs,hslen,fragments = matched[0]
                native = next((data for kind,data in apps if kind == 'tls.hello'),None)
                hello = native['handshake_type'] if native else None
                typ = {'client_hello':1,'server_hello':2}.get(hello)
                row = db.execute('SELECT fields_json FROM hello_reference WHERE frame=?',(completion,)).fetchone()
                reference=json.loads(row[0]) if row else {}
                if (typ and hs == [typ] and len(hslen) == 1 and hslen[0]+4 <= window['need']-5
                        and not fragments and hello_matches(native,reference)):
                    category,reason = 'independently_recovered_hello','complete_source_bytes_and_reference_hello'
                    db.execute('INSERT INTO classification_data VALUES(?,?)',
                               (frame,canonical(dict(native,record_bytes=window['need'],
                                handshake_bytes=hslen[0]+4)).decode()))
                elif not typ:
                    category,reason = 'complete_record_without_identified_hello','record_complete_not_a_verified_cleartext_hello'
                else:
                    category,reason = 'reference_indeterminate','hello_or_fragment_reference_alignment_ambiguous'
        db.execute('INSERT INTO classifications VALUES(?,?,?,?,?,?,?,?,?)',
            (frame,category,reason,window['need'],missing,window['conflicts'],window['identical'],window['support'],completion))
    db.commit()
    counts = dict(db.execute('SELECT category,COUNT(*) FROM classifications GROUP BY category'))
    require(sum(counts.values()) == db.execute('SELECT COUNT(*) FROM candidates').fetchone()[0],
            'selected_candidate_classification_reconciliation_failed')
    require(db.execute('SELECT COUNT(*) FROM references_checked').fetchone()[0] == len(byframe),
            'support_reference_reconciliation_failed')
    return counts,len(byframe),links


SCHEMA = '''CREATE TABLE frames(frame INTEGER PRIMARY KEY,context INTEGER);
 CREATE TABLE candidates(frame INTEGER PRIMARY KEY,ordinal INTEGER,offset INTEGER,length INTEGER,sha256 TEXT);
 CREATE TABLE segments(frame INTEGER PRIMARY KEY,stream INTEGER,direction INTEGER,seq INTEGER,length INTEGER,payload_offset INTEGER,payload_length INTEGER);
 CREATE INDEX segment_stream ON segments(stream,direction,frame);
 CREATE TABLE assignments(frame INTEGER PRIMARY KEY,stream INTEGER,direction INTEGER,seq_raw INTEGER,flags INTEGER);
 CREATE INDEX assignment_stream ON assignments(stream,direction,frame);
 CREATE TABLE events(frame INTEGER PRIMARY KEY,stream INTEGER,direction INTEGER,refs TEXT,reassembled TEXT,types TEXT,lengths TEXT,handshakes TEXT,handshake_lengths TEXT,handshake_fragments TEXT,conflict INTEGER,error INTEGER);
 CREATE INDEX event_stream ON events(stream,direction,frame);
 CREATE TABLE support(candidate INTEGER,frame INTEGER,window_start INTEGER,payload_skip INTEGER,length INTEGER);
 CREATE TABLE references_checked(frame INTEGER PRIMARY KEY,ordinal INTEGER,offset INTEGER,length INTEGER,sha256 TEXT);
 CREATE TABLE classifications(frame INTEGER PRIMARY KEY,category TEXT,reason TEXT,record_bytes INTEGER,missing_bytes INTEGER,conflicting_overlap_bytes INTEGER,identical_overlap_bytes INTEGER,support_packets INTEGER,completion_frame INTEGER);
 CREATE TABLE original_references(mini_frame INTEGER PRIMARY KEY,source_id INTEGER,ordinal INTEGER,packet_number INTEGER,offset INTEGER,length INTEGER,sha256 TEXT,cohort INTEGER,candidate INTEGER);
 CREATE TABLE classification_data(frame INTEGER PRIMARY KEY,data_json TEXT);
 CREATE TABLE hello_reference(frame INTEGER PRIMARY KEY,fields_json TEXT);
'''


class ReferenceSink(FieldSink):
    """Retain independent TCP assignments even on SYN/FIN/ACK-only frames."""
    def row(self,line):
        before=self.tcp_rows
        super().row(line)
        if self.tcp_rows==before:return
        values=line.decode().split('\t')
        fields=dict(zip(FIELDS,values+['']*(len(FIELDS)-len(values))))
        self.db.execute('INSERT INTO hello_reference VALUES(?,?)',
            (scalar(fields['frame.number']),canonical({key:fields[key] for key in HELLO_FIELDS}).decode()))
        net,_=oracle.reference_layers(fields['frame.protocols'])
        names=('ip.src','ip.dst') if net=='ip' else ('ipv6.src','ipv6.dst')
        endpoints=[(ipaddress.ip_address(fields[name]).packed,scalar(fields[port]))
                   for name,port in zip(names,('tcp.srcport','tcp.dstport'))]
        self.db.execute('INSERT INTO assignments VALUES(?,?,?,?,?)',
            (scalar(fields['frame.number']),scalar(fields['tcp.stream']),
             int(endpoints[0]>endpoints[1]),scalar(fields['tcp.seq_raw']),scalar(fields['tcp.flags'])))


def tool_version():
    """Fixed local tool inspection; no package installation or external lookup."""
    try:
        result=oracle.subprocess.run(['tshark','--version'],capture_output=True,
                                    timeout=5,check=True)
    except (OSError,oracle.subprocess.SubprocessError):
        raise ReconstructionError('local_tshark_unavailable') from None
    require(len(result.stdout)<=MAX_BYTES,'tool_version_size_budget')
    lines=result.stdout.decode('utf-8',errors='replace').splitlines()
    require(bool(lines) and lines[0].startswith('TShark '),'unsupported_reference_tool')
    return lines[0][:512]


def decode_batch(number,batch,source,output,*,guard=lambda:None,
                 begin_decoder=lambda:None,end_decoder=lambda:None,
                 register=lambda process:None,unregister=lambda process:None,decoder_seconds=60,limits=None,
                 profile=STANDARD):
    """Feed one bounded derivative while all locators remain original-source."""
    path=output/('batch-'+str(number)+'.sqlite')
    validator=classic_validator(Reader,capture.classic)
    cached={}
    with closing(open_db(path,guard)) as db:
        db.executescript(SCHEMA)
        for frame,ref in enumerate(batch['references'],1):
            guard()
            db.execute('INSERT INTO frames VALUES(?,?)',(frame,ref.cohort))
            db.execute('INSERT INTO original_references VALUES(?,?,?,?,?,?,?,?,?)',
                (frame,source['id'],ref.ordinal,ref.packet_number,ref.offset,ref.length,
                 ref.sha256,ref.cohort,int(frame in batch['candidates'])))
            if frame in batch['candidates']:
                packet=read_packet(source['stream'],source,ref,validator,guard)
                require('tls_reassembly_required' in network.decode(packet)[2],
                        'candidate_native_loss_changed')
                cached[frame]=packet.payload[:MAX_PREFIX]
                db.execute('INSERT INTO candidates VALUES(?,?,?,?,?)',
                    (frame,ref.ordinal,ref.offset,ref.length,ref.sha256))
        db.commit()
    feed=ClassicCohortStream(source['stream'],source_id=source['id'],source_size=source['size'],
        header=source['header'],references=batch['references'],validator=validator,guard=guard,profile=profile)
    config=output/('config-'+str(number));config.mkdir(mode=0o700)
    sink=ReferenceSink(path,oracle.reference_layers,guard)
    command=['tshark','-n','-r','-','-T','fields']
    for key,value in PREFERENCES.items():command+=['-o',key+':'+value]
    for field in FIELDS:command+=['-e',field]
    before=time.monotonic()
    try:
        # Only this fixed trusted Lua source enters /tmp; every byte of its
        # allocation is reserved inside the caller's scratch budget.
        with tempfile.TemporaryDirectory(prefix='sentinel-tls-ranges-',dir='/tmp') as temporary:
            lua=Path(temporary)/'ranges.lua'
            with os.fdopen(os.open(lua,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb') as handle:
                handle.write(LUA.encode())
            require(sum(max(p.stat().st_size,p.stat().st_blocks*512)
                        for p in (Path(temporary),lua))<=65536,'static_lua_reserve_exceeded')
            begin_decoder()
            try:
                environment={key:value for key,value in os.environ.items()
                             if key not in ('SSLKEYLOGFILE','SSLKEYLOG_FILE')}
                environment.update(TMPDIR=str(output),SQLITE_TMPDIR=str(output))
                result=oracle.decoder_process(command+['-X','lua_script:'+str(lua)],feed,sink,config,
                    on_start=register,on_finish=unregister,timeout=decoder_seconds,environment=environment)
            finally:end_decoder()
        require(result.returncode==0 and sink.failed is None,'independent_decoder_or_sink_failed')
        require(feed.failed is None and feed.complete and feed.emitted_bytes==feed.total_bytes==batch['bytes']
                and feed.derivative_sha256 is not None,'derivative_pipe_incomplete')
        require(sink.rows==sink.tcp_rows==len(batch['references']),
                'independent_batch_frame_coverage_mismatch')
    finally:
        sink.close()
    guard()
    with closing(open_db(path,guard)) as db:
        counts,support,links=classify_batch(db,cached,source,source['stream'],
            batch['references'],validator,guard,limits)
    return {'id':number,'source_id':source['id'],'frames':len(batch['references']),
        'candidate_packets':len(batch['candidates']),'classifications':counts,
        'support_original_records_rechecked':support,'support_links':links,
        'selected_original_record_hashes_verified':len(batch['references']),
        'derivative_bytes':feed.emitted_bytes,'derivative_sha256':feed.derivative_sha256,
        'derivative_hash_is_original_source_hash':False,
        'wall_seconds':time.monotonic()-before,'private_index':path}
