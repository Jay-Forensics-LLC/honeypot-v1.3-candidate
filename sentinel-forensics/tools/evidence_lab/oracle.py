"""Local independent Wireshark comparison on an explicitly selected small corpus.

No downloading; no name resolution. Keep corpus and reports outside Git.
"""
import argparse
import hashlib
import itertools
import json
import math
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import threading
import time
from core import (IngestError, Reader, source_file, canonical, MAX_RECORD,
                  atomic_json, fingerprint, VERSION)
from capture import classic, pcapng, MAGICS
from network import decode

FIELDS=['frame.number','frame.time_epoch','frame.cap_len','frame.len','ip.src','ip.dst','ipv6.src','ipv6.dst',
        'tcp.srcport','tcp.dstport','udp.srcport','udp.dstport','dns.qry.name','dns.a','dhcp.ip.your','tls.handshake.extensions_server_name',
        'tcp.flags','vlan.id','ieee8021ad.id','arp.src.proto_ipv4','arp.src.hw_mac',
        'icmpv6.type','icmpv6.nd.na.target_address','icmpv6.opt.src_linkaddr','icmpv6.opt.target_linkaddr',
        'dhcp.type','dhcp.option.dhcp','dhcp.hw.mac_addr','dhcp.option.ip_address_lease_time',
        'dns.aaaa','dns.resp.type','dns.resp.class','dns.resp.ttl','frame.protocols','tls.handshake.type',
        'igmp.type','igmp.version','igmp.checksum','igmp.checksum.status','igmp.maddr',
        'igmp.max_resp','igmp.max_resp.exp','igmp.max_resp.mant','igmp.s','igmp.qrv','igmp.qqic',
        'igmp.num_src','igmp.saddr','igmp.num_grp_recs','igmp.record_type','igmp.aux_data_len',
        'eth.len','vlan.len','llc.dsap','llc.ssap','llc.control','llc.control.p','llc.control.f',
        'basicxid.llc.xid.format','basicxid.llc.xid.types','basicxid.llc.xid.wsize',
        'sentinel_xid_raw.types','sentinel_xid_raw.window']
MAX_MISMATCH_DETAILS = 100
ORACLE_VERSION = '2.0.9'
DECODER_TIMEOUT_SECONDS = 60

# Wireshark 4.2 does not support the newer "-e @field" raw-value syntax.
# FieldInfo.range is the independent dissector's source range, including bits
# it masks from displayed values. This fixed helper copies two scalar octets;
# it never parses a header, retains packet state, or executes capture content.
RAW_OCTET_LUA = '''local raw = Proto("sentinel_xid_raw", "Sentinel XID source octets")
local types = ProtoField.string("sentinel_xid_raw.types", "XID types source octet")
local window = ProtoField.string("sentinel_xid_raw.window", "XID window source octet")
raw.fields = {types, window}
local get_types = Field.new("basicxid.llc.xid.types")
local get_window = Field.new("basicxid.llc.xid.wsize")
local function copy_one(get, field, tree)
    local info, extra = get()
    if info == nil or extra ~= nil or info.generated then return end
    local range = info.range
    if range == nil or range:len() ~= 1 then return end
    tree:add(field, string.format("%02x", range:uint()))
end
function raw.dissector(buffer, pinfo, tree)
    copy_one(get_types, types, tree)
    copy_one(get_window, window, tree)
end
register_postdissector(raw)
'''


def epoch_ns(value):
    """Parse tshark's decimal epoch without exponent expansion or float rounding."""
    if not re.fullmatch(r'-?[0-9]{1,20}(?:\.[0-9]{1,9})?',value):
        raise IngestError('oracle_timestamp_invalid')
    negative=value.startswith('-')
    seconds,_,fraction=value.lstrip('-').partition('.')
    result=int(seconds)*10**9+int(fraction.ljust(9,'0') or '0')
    return -result if negative else result


def reference_layers(value):
    """Select outer network/transport from reference dissection, never ours."""
    layers=value.split(':')
    networks=('ip','ipv6','arp')
    for index,layer in enumerate(layers):
        if layer not in networks: continue
        for child in layers[index+1:]:
            if child in networks: break
            if child in ('tcp','udp','icmp','icmpv6'): return layer,child
            if child=='igmp' and layer=='ip': return layer,child
        return layer,None
    return None,None


def compare_llc_xid(meta, apps, fields, eligible, equal):
    """Compare outer basic XID, including raw octets hidden by reference masks.

    Wireshark's basic-XID dissector supplies fields without adding basicxid to
    frame.protocols. LLC inside an IP/UDP tunnel cannot establish outer scope.
    No whole protocol payload is requested from the independent decoder.
    """
    messages=[data for kind,data in apps if kind=='llc.xid']
    layers=fields['frame.protocols'].split(':')
    outer=False
    if layers and layers[0]=='eth' and 'llc' in layers:
        prefix=layers[1:layers.index('llc')]
        outer=all(layer in ('ethertype','vlan','ieee8021ad') for layer in prefix)
    candidate=eligible and outer and bool(fields['basicxid.llc.xid.format'])
    def number(name):
        value=fields[name]
        if not re.fullmatch(r'(?:0x[0-9a-fA-F]{1,4}|[0-9]{1,5})',value):
            raise IngestError('oracle_llc_required_numeric_field')
        return int(value,16 if value.startswith('0x') else 10)

    def octet(name):
        value=fields[name]
        if not re.fullmatch(r'[0-9a-fA-F]{2}',value):
            raise IngestError('oracle_llc_required_raw_octet')
        return int(value,16)

    expected=False
    values={}
    if (eligible and outer and not candidate
            and all(fields[name] for name in ('llc.dsap','llc.ssap','llc.control'))
            and number('llc.dsap')==0xaa and number('llc.ssap')==0xaa
            and number('llc.control') in (0xaf,0xbf)):
        # Some Wireshark versions dispatch this SAP pair as SNAP before
        # recognizing XID. Preserve a non-passing reference limitation.
        raise IngestError('oracle_llc_snap_sap_reference_unsupported')
    if not (messages or candidate): return
    if candidate:
        lengths=[name for name in ('eth.len','vlan.len') if fields[name]]
        if len(lengths)!=1: raise IngestError('oracle_llc_required_length_field')
        length=number(lengths[0])
        dsap,ssap,control=(number(name) for name in ('llc.dsap','llc.ssap','llc.control'))
        fmt=number('basicxid.llc.xid.format')
        capability=number('basicxid.llc.xid.types')
        window=number('basicxid.llc.xid.wsize')
        types_raw=octet('sentinel_xid_raw.types')
        window_raw=octet('sentinel_xid_raw.window')
        if capability!=(types_raw&31) or window!=window_raw>>1:
            raise IngestError('oracle_llc_reference_masks_inconsistent')
        null_saps=(dsap&254)==0 and (ssap&254)==0
        response=bool(ssap&1);group=bool(dsap&1);poll_final=bool(control&16)
        expected=(length==6 and control in (0xaf,0xbf) and fmt==0x81
                  and dsap<=255 and ssap<=255 and not types_raw&0xe0
                  and not window_raw&1 and not (response and group)
                  and capability in ((1,3,5,7) if null_saps else range(1,8)))
        if expected:
            # An unset P/F bit can have no field at all in Wireshark. The
            # independent full control value still proves its false value.
            selected=fields['llc.control.f' if response else 'llc.control.p']
            if selected not in ('','0','1','False','True','false','true'):
                raise IngestError('oracle_llc_reference_boolean_field')
            if poll_final and selected not in ('1','True','true'):
                raise IngestError('oracle_llc_reference_poll_final_missing')
            if not poll_final and selected in ('1','True','true'):
                raise IngestError('oracle_llc_reference_poll_final_inconsistent')
            values={'declared_length':length,'dsap':dsap,'ssap':ssap,'control':control,
                    'response':response,'poll_final':poll_final,'group':group,'format':fmt,
                    'types_octet':types_raw,'capability_code':capability,
                    'receive_window_octet':window_raw,'receive_window':window}
    equal('llc_xid_message_count',len(messages),1 if expected else 0)
    if not expected: return
    equal('llc_protocol',meta['protocol'],'llc')
    for message in messages:
        for name,value in values.items():
            actual=message.get(name)
            equal('llc_xid_'+name,(type(actual).__name__,actual),(type(value).__name__,value))


def compare_igmp(apps, fields, eligible, equal):
    """Compare complete supported outer IPv4 IGMP, including empty reports.

    Reference field vectors retain occurrence order and duplicates. Per-record
    source counts restore report grouping, rather than comparing only a set of
    addresses. IGMP fields inside an ICMP quotation cannot establish eligibility.
    """
    messages=[data for kind,data in apps if kind=='igmp.message']
    records=[data for kind,data in apps if kind=='igmp.group_record']
    supported_types=(0x11,0x12,0x16,0x17,0x22)

    def numbers(name):
        values=fields[name].split(',') if fields[name] else []
        if any(not re.fullmatch(r'(?:0x[0-9a-fA-F]+|[0-9]+)',v) for v in values):
            raise IngestError('oracle_igmp_numeric_field')
        return [int(v,16 if v.startswith('0x') else 10) for v in values]

    def one(name):
        values=numbers(name)
        if len(values)!=1: raise IngestError('oracle_igmp_required_field')
        return values[0]

    types=numbers('igmp.type') if eligible else []
    expected=eligible and len(types)==1 and types[0] in supported_types
    if not (messages or records or expected): return
    equal('igmp_message_count',len(messages),1 if expected else 0)
    if not expected:
        equal('igmp_group_record_count',len(records),0)
        return
    typ=types[0]
    version=one('igmp.version')
    checksum=one('igmp.checksum')
    checksum_status=one('igmp.checksum.status')
    for message in messages:
        equal('igmp_type',message.get('message_type'),typ)
        equal('igmp_version',message.get('version'),version)
        equal('igmp_checksum',message.get('checksum'),checksum)
        equal('igmp_checksum_valid',message.get('checksum_valid'),checksum_status==1)

    addresses=fields['igmp.maddr'].split(',') if fields['igmp.maddr'] else []
    sources=fields['igmp.saddr'].split(',') if fields['igmp.saddr'] else []
    source_counts=numbers('igmp.num_src')
    if typ==0x22:
        count=one('igmp.num_grp_recs')
        record_types=numbers('igmp.record_type')
        auxiliary=numbers('igmp.aux_data_len')
        if not len(addresses)==len(source_counts)==len(record_types)==len(auxiliary)==count or sum(source_counts)!=len(sources):
            raise IngestError('oracle_igmp_group_field_alignment')
        expected_sources=[]
        position=0
        for size in source_counts:
            expected_sources.append(sources[position:position+size])
            position+=size
        for message in messages:
            equal('igmp_declared_group_records',message.get('group_record_count'),count)
        equal('igmp_group_record_count',len(records),count)
        equal('igmp_group_record_indices',[d.get('record_index') for d in records],list(range(count)))
        equal('igmp_group_record_types',[d.get('record_type') for d in records],record_types)
        equal('igmp_group_addresses',[d.get('address') for d in records],addresses)
        equal('igmp_group_source_counts',[d.get('source_count') for d in records],source_counts)
        equal('igmp_group_sources',[d.get('source_addresses') for d in records],expected_sources)
        equal('igmp_group_auxiliary_words',[d.get('auxiliary_words') for d in records],auxiliary)
        return

    equal('igmp_group_record_count',len(records),0)
    if len(addresses)!=1: raise IngestError('oracle_igmp_group_field_alignment')
    for message in messages: equal('igmp_address',message.get('address'),addresses[0])
    if typ!=0x11: return
    # Wireshark exposes decoded deciseconds in igmp.max_resp for v3. Its
    # exponent/mantissa fields independently recover the original high-bit code.
    if version==1:
        response_code,response_tenths=0,None
    else:
        response_tenths=one('igmp.max_resp')
        exponents,mantissas=numbers('igmp.max_resp.exp'),numbers('igmp.max_resp.mant')
        if version==3 and (exponents or mantissas):
            if len(exponents)!=1 or len(mantissas)!=1 or not 0<=exponents[0]<=7 or not 0<=mantissas[0]<=15:
                raise IngestError('oracle_igmp_response_code_alignment')
            response_code=0x80 | (exponents[0]<<4) | mantissas[0]
        else: response_code=response_tenths
    for message in messages:
        equal('igmp_max_response_code',message.get('max_response_code'),response_code)
        equal('igmp_max_response_tenths',message.get('max_response_tenths'),response_tenths)
    if version!=3: return
    if len(source_counts)!=1 or source_counts[0]!=len(sources):
        raise IngestError('oracle_igmp_query_field_alignment')
    # TShark prints FT_BOOLEAN as True/False, unlike its integer bitfields.
    suppress_token=fields['igmp.s']
    if suppress_token not in ('True','False','1','0'):
        raise IngestError('oracle_igmp_boolean_field')
    suppress=suppress_token in ('True','1')
    robustness,interval=one('igmp.qrv'),one('igmp.qqic')
    seconds=interval if interval<128 else ((interval&15)|16)<<(((interval>>4)&7)+3)
    for message in messages:
        equal('igmp_query_source_count',message.get('source_count'),source_counts[0])
        equal('igmp_query_sources',message.get('source_addresses'),sources)
        equal('igmp_query_suppress',message.get('suppress'),suppress)
        equal('igmp_query_robustness',message.get('robustness'),robustness)
        equal('igmp_query_interval_code',message.get('query_interval_code'),interval)
        equal('igmp_query_interval_seconds',message.get('query_interval_seconds'),seconds)


class OwnedSessionProcess:
    """Serialize observed-child reaping and group cleanup on Linux.

    Every completion is first observed with WNOWAIT. The original unreaped
    leader reserves its PID/PGID while group signals are sent, so a recycled
    unrelated group is never signalled after reaping. Only this adapter may
    wait/poll the wrapped Popen; callers receive the adapter in lifecycle hooks.
    """
    def __init__(self,process):
        self._process=process
        self._lock=threading.RLock()

    @property
    def pid(self):return self._process.pid

    @property
    def returncode(self):return self._process.returncode

    def signal_owned_group(self,sig):
        with self._lock:
            if self.returncode is not None:return False
            try:os.killpg(self.pid,sig)
            except ProcessLookupError:pass
            return True

    def _poll_locked(self):
        if self.returncode is not None:return self.returncode
        try:
            event=os.waitid(os.P_PID,self.pid,os.WEXITED|os.WNOHANG|os.WNOWAIT)
        except ChildProcessError:
            raise IngestError('oracle_owned_child_lifetime_unavailable') from None
        if event is None:return None
        # Even an exited leader remains unreaped here. Kill remaining members
        # of its process group before releasing that group identity via wait.
        self.signal_owned_group(signal.SIGKILL)
        return self._process.wait()

    def poll(self):
        with self._lock:return self._poll_locked()

    def wait(self,timeout=None):
        deadline=None if timeout is None else time.monotonic()+timeout
        while True:
            with self._lock:
                result=self._poll_locked()
                if result is not None:return result
            remaining=None if deadline is None else deadline-time.monotonic()
            if remaining is not None and remaining<=0:
                raise subprocess.TimeoutExpired('owned-local-decoder',timeout)
            time.sleep(0.002 if remaining is None else min(0.002,remaining))


def decoder_process(cmd, input_stream, destination, config, *,
                    on_start=None, on_finish=None, timeout=None, environment=None):
    """Keep both inherited decoder descriptors as pipes, streaming bounded chunks.

    Local confinement can forbid tshark access to inherited home-path file
    descriptors. Python retains read-only source and private output descriptors;
    tshark sees only anonymous pipes. No whole-source or decoded-output buffer is
    accumulated, and no profile or host security setting is changed.
    """
    observed=any(value is not None for value in (on_start,on_finish,timeout,environment))
    if observed and not all(hasattr(os,name) for name in ('waitid','P_PID','WEXITED','WNOHANG','WNOWAIT')):
        raise IngestError('oracle_owned_wait_unavailable')
    if ((on_start is not None and not callable(on_start))
            or (on_finish is not None and not callable(on_finish))
            or (timeout is not None and (type(timeout) not in (int,float)
                or not math.isfinite(timeout) or timeout<=0))):
        raise IngestError('oracle_transport_options_invalid')
    input_read, input_write = os.pipe()
    output_read, output_write = os.pipe()
    errors = []

    def feed():
        try:
            with os.fdopen(input_write, 'wb') as pipe:
                for chunk in iter(lambda: input_stream.read(MAX_RECORD), b''):
                    pipe.write(chunk)
        except BrokenPipeError:
            errors.append('decoder_closed_input')
        except Exception:
            errors.append('source_read_failed')

    def drain():
        try:
            with os.fdopen(output_read, 'rb') as pipe:
                for chunk in iter(lambda: pipe.read(MAX_RECORD), b''):
                    destination.write(chunk)
        except Exception:
            errors.append('private_output_failed')

    feeding = threading.Thread(target=feed)
    draining = threading.Thread(target=drain)
    feeding.start()
    draining.start()
    try:
        with os.fdopen(input_read, 'rb') as source_pipe, os.fdopen(output_write, 'wb') as output_pipe:
            if not observed:
                # Preserve the existing transport path and callers unchanged.
                result = subprocess.run(cmd, stdin=source_pipe, stdout=output_pipe,
                                        stderr=subprocess.DEVNULL, timeout=DECODER_TIMEOUT_SECONDS,
                                        env=dict(os.environ, LC_ALL='C', WIRESHARK_CONFIG_DIR=str(config.resolve())))
            else:
                proc=None
                try:
                    proc=OwnedSessionProcess(subprocess.Popen(cmd,stdin=source_pipe,stdout=output_pipe,
                        stderr=subprocess.DEVNULL,start_new_session=True,
                        env=dict(os.environ if environment is None else environment,
                                 LC_ALL='C',WIRESHARK_CONFIG_DIR=str(config.resolve()))))
                    if on_start is not None:on_start(proc)
                    code=proc.wait(timeout=DECODER_TIMEOUT_SECONDS if timeout is None else timeout)
                    result=subprocess.CompletedProcess(cmd,code)
                finally:
                    if proc is not None:
                        if proc.poll() is None:
                            proc.signal_owned_group(signal.SIGTERM)
                            try:proc.wait(timeout=0.1)
                            except subprocess.TimeoutExpired:
                                proc.signal_owned_group(signal.SIGKILL)
                                proc.wait()
                        if on_finish is not None:on_finish(proc)
    finally:
        feeding.join()
        draining.join()
    if errors and result.returncode == 0:
        raise IngestError('oracle_pipe_transport_failed')
    return result


def decode_fields(input_stream, destination, config):
    """Load only fixed local Lua; temporary helper contains no evidence bytes."""
    cmd=['tshark','-n','-r','-','-o','tcp.desegment_tcp_streams:FALSE','-o','ip.defragment:FALSE',
         '-o','ipv6.defragment:FALSE','-o','tcp.analyze_sequence_numbers:FALSE','-T','fields']
    for field in FIELDS: cmd+=['-e',field]
    # A system temporary directory also works with local decoder confinement
    # that forbids opening private evidence paths. Captures still use pipes.
    with tempfile.TemporaryDirectory(prefix='sentinel-oracle-lua-') as temporary:
        helper=Path(temporary)/'raw-octets.lua'
        with os.fdopen(os.open(helper,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w') as stream:
            stream.write(RAW_OCTET_LUA)
        return decoder_process(cmd+['-X','lua_script:'+str(helper)],input_stream,destination,config)


def compare_file(path, stdout, config, entry):
    # Hash the entire source independently of parser progress. In particular, a
    # failed comparison must never label a partially consumed digest as file SHA.
    with source_file(path) as (input_stream,input_stat):
        digest=hashlib.sha256()
        for chunk in iter(lambda:input_stream.read(MAX_RECORD),b''): digest.update(chunk)
        entry.update(sha256=digest.hexdigest(),bytes=input_stat.st_size)
        input_stream.seek(0)
        with os.fdopen(os.open(stdout,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb') as dest:
            proc=decode_fields(input_stream,dest,config)
        if proc.returncode: raise IngestError('oracle_decoder_failed')
    with source_file(path) as (stream,st),stdout.open('rb') as independent:
        if fingerprint(st)!=fingerprint(input_stat): raise IngestError('oracle_source_changed')
        magic=stream.read(4); stream.seek(0); reader=Reader(stream)
        packets=(p for p in (classic if magic in MAGICS else pcapng)(reader) if p.kind=='packet')
        lines=iter(lambda:independent.readline(MAX_RECORD+1),b'')
        def mismatch(field):
            entry['mismatch_count']+=1
            if len(entry['mismatches'])<MAX_MISMATCH_DETAILS:
                entry['mismatches'].append({'packet':max(entry['packets'],entry['independent_packets']),'field':field})
        def equal(name,ours,theirs):
            entry['field_comparisons']+=1
            entry['compared_fields'][name]=entry['compared_fields'].get(name,0)+1
            if ours!=theirs: mismatch(name)
        for packet,line in itertools.zip_longest(packets,lines):
            if packet is not None:
                entry['packets']+=1
                meta,apps,losses=decode(packet)
                entry['limited_packets' if losses else 'supported_packets']+=1
            if line is not None:
                entry['independent_packets']+=1
                if len(line)>MAX_RECORD: raise IngestError('oracle_line_budget')
            if packet is None or line is None:
                mismatch('packet_count')
                continue
            values=line.decode('utf-8').rstrip('\n').split('\t')
            if len(values)>len(FIELDS): raise IngestError('oracle_field_count')
            values+=['']*(len(FIELDS)-len(values)); fields=dict(zip(FIELDS,values))
            outer_network,outer_transport=reference_layers(fields['frame.protocols'])
            equal('packet_number',packet.metadata.get('packet_number',packet.ordinal),int(fields['frame.number']))
            equal('captured_length',len(packet.payload),int(fields['frame.cap_len']))
            equal('original_length',packet.original,int(fields['frame.len']))
            if packet.time['utc_ns'] is not None:
                equal('timestamp_ns',packet.time['utc_ns'],epoch_ns(fields['frame.time_epoch']))
            for key,v4,v6 in [('src','ip.src','ipv6.src'),('dst','ip.dst','ipv6.dst')]:
                if meta[key] is not None or (not losses and outer_network in ('ip','ipv6')):
                    # ICMP errors can quote another family. The reference
                    # protocol stack establishes which field belongs outside.
                    field=v6 if outer_network=='ipv6' else v4
                    expected=fields[field].split(',')[0] if outer_network in ('ip','ipv6') else None
                    if not losses and not expected: raise IngestError('oracle_reference_ip_field_missing')
                    equal(key,meta[key],expected)
            if not losses and outer_transport is not None:
                equal('outer_transport',meta['protocol'],outer_transport)
            reference_ports=[]
            for key in ('sport','dport'):
                expected=None
                if outer_transport in ('tcp','udp'):
                    field=outer_transport+'.'+('srcport' if key=='sport' else 'dstport')
                    expected=fields[field].split(',')[0] or None
                reference_ports.append(expected)
                if meta[key] is not None or (not losses and outer_transport in ('tcp','udp')):
                    if not losses and expected is None: raise IngestError('oracle_reference_port_field_missing')
                    equal(key,str(meta[key]) if meta[key] is not None else None,expected)
            if meta['tcp_flags'] is not None or (not losses and outer_transport=='tcp'):
                # The supported TCP metadata records the low eight flag bits.
                expected=int(fields['tcp.flags'].split(',')[0],0)&255 if outer_transport=='tcp' else None
                equal('tcp_flags',meta['tcp_flags'],expected)
            vlan_values=','.join(v for v in (fields['vlan.id'],fields['ieee8021ad.id']) if v)
            if meta['vlan'] or vlan_values:
                # tshark separates 802.1Q and 802.1ad fields, losing mixed-tag order.
                equal('vlan_ids_unordered',sorted(meta['vlan']),sorted(int(v) for v in vlan_values.split(',') if v))
            compare_igmp(apps,fields,not losses and outer_network=='ip' and outer_transport=='igmp',equal)
            compare_llc_xid(meta,apps,fields,not losses,equal)
            arp_maps=[d for k,d in apps if k=='arp.mapping']
            expected_arp=not losses and outer_network=='arp' and fields['arp.src.proto_ipv4'] not in ('','0.0.0.0')
            if arp_maps or expected_arp:
                equal('arp_addresses',','.join(d['address'] for d in arp_maps),fields['arp.src.proto_ipv4'])
                equal('arp_macs',','.join(d['mac'] for d in arp_maps),fields['arp.src.hw_mac'])
            ndp_maps=[d for k,d in apps if k=='ndp.mapping']
            expected_ndp=not losses and outer_transport=='icmpv6' and fields['icmpv6.type'] in ('135','136') and (
                fields['icmpv6.opt.target_linkaddr'] if fields['icmpv6.type']=='136' else
                fields['icmpv6.opt.src_linkaddr'] if fields['ipv6.src']!='::' else '')
            if ndp_maps or expected_ndp:
                typ=int(fields['icmpv6.type'].split(',')[0])
                address=(fields['icmpv6.nd.na.target_address'] if typ==136 else fields['ipv6.src']).split(',')[0]
                macs=fields['icmpv6.opt.target_linkaddr'] if typ==136 else fields['icmpv6.opt.src_linkaddr']
                expected=[(address,value,typ) for value in macs.split(',') if value]
                equal('ndp_mappings',[(d['address'],d['mac'],d['message_type']) for d in ndp_maps],expected)
            dns_names=[d['name'] for k,d in apps if k=='dns.question']
            dns_eligible=not losses and outer_transport in ('tcp','udp') and '53' in reference_ports
            if dns_names or (dns_eligible and fields['dns.qry.name']): equal('dns_questions',','.join(dns_names),fields['dns.qry.name'])
            addresses=[d['address'] for k,d in apps if k=='dns.address' and ':' not in d['address']]
            if addresses or (dns_eligible and fields['dns.a']): equal('dns_ipv4_answers',','.join(addresses),fields['dns.a'])
            addresses6=[d['address'] for k,d in apps if k=='dns.address' and ':' in d['address']]
            if addresses6 or (dns_eligible and fields['dns.aaaa']): equal('dns_ipv6_answers',','.join(addresses6),fields['dns.aaaa'])
            address_records=[d for k,d in apps if k=='dns.address']
            if address_records or (dns_eligible and (fields['dns.a'] or fields['dns.aaaa'])):
                # OPT uses its CLASS/TTL bytes for EDNS and has no response
                # class/TTL fields. Exclude it before aligning ordinary RRs.
                types=[int(v) for v in fields['dns.resp.type'].split(',') if v and int(v)!=41]
                classes=[int(v,0) for v in fields['dns.resp.class'].split(',') if v]
                ttls=[int(v) for v in fields['dns.resp.ttl'].split(',') if v]
                if not len(types)==len(classes)==len(ttls): raise IngestError('oracle_dns_field_alignment')
                expected=[ttl for typ,cls,ttl in zip(types,classes,ttls) if typ in (1,28) and cls==1]
                equal('dns_address_ttls',[d['ttl'] for d in address_records],expected)
            dhcp_messages=[d for k,d in apps if k=='dhcp.message']
            if not losses and outer_transport=='udp' and set(reference_ports)=={'67','68'} and fields['dhcp.type']:
                equal('dhcp_message_count',len(dhcp_messages),1)
            for kind,data in apps:
                if kind=='dhcp.message':
                    equal('dhcp_yiaddr',data['assigned_ip'],fields['dhcp.ip.your'])
                    equal('dhcp_op',data['op'],int(fields['dhcp.type']))
                    equal('dhcp_message_type',data['message_type'],int(fields['dhcp.option.dhcp'] or '0'))
                    # Wireshark also emits this field for option 61; its first
                    # occurrence is the fixed BOOTP chaddr that we decode.
                    equal('dhcp_client_mac',data['client_mac'],fields['dhcp.hw.mac_addr'].split(',')[0])
                    equal('dhcp_lease_seconds',data['lease_seconds'],int(fields['dhcp.option.ip_address_lease_time']) if fields['dhcp.option.ip_address_lease_time'] else None)
            our_sni=next((d['server_name'] for k,d in apps if k=='tls.hello' and d.get('server_name')),None)
            expected_sni=(fields['tls.handshake.extensions_server_name'].split(',')[0] or None) if outer_transport=='tcp' else None
            expected_client_hello=fields['tls.handshake.type'].split(',')[0]=='1'
            if our_sni is not None or (not losses and expected_client_hello and expected_sni is not None):
                equal('tls_sni',our_sni,expected_sni)
        entry['after_sha256']=reader.sha.hexdigest()
        complete_content=(entry['sha256']==entry['after_sha256'] and reader.offset==entry['bytes'])
        if not complete_content: raise IngestError('oracle_source_changed')
    entry['complete_source_verified']=True


def compare(paths,output):
    output=Path(output)
    if output.resolve().is_relative_to(Path(__file__).resolve().parents[2]) or Path(os.path.abspath(output))!=output.resolve():
        raise IngestError('oracle_output_must_be_private_external_directory')
    output.mkdir(mode=0o700)
    report={'schema':'sentinel.decoder-comparison/1','status':'IN_PROGRESS','files':[],
            'parser_version':VERSION,'oracle_version':ORACLE_VERSION,'tool_version':None,
            'raw_field_extraction':{'method':'fixed_lua_postdissector_field_ranges',
                                    'helper_sha256':hashlib.sha256(RAW_OCTET_LUA.encode()).hexdigest()},
            'configuration':{'tcp_sequence_analysis':False,'tcp_reassembly':False,'ip_reassembly':False,
                             'decoder_transport':'bounded_local_pipes','decoder_chunk_bytes':MAX_RECORD,
                             'decoder_timeout_seconds':DECODER_TIMEOUT_SECONDS},
            'scope':'Independent offline framing, times and supported header/application metadata; not real Packet Squirrel qualification.',
            'limitations':['Mismatch details capped at 100 per file; mismatch_count includes every mismatch.',
                           'sha256 is the initial full-file hash; complete_source_verified requires a full matching second pass.',
                           'Decoder field comparison uses complete supported messages without TCP/IP reassembly.',
                           'TCP sequence analysis is disabled so retransmitted complete messages remain independently decoded.',
                           'Outer IP family/first occurrences and the first complete TLS hello/SNI are compared; quoted inner headers and subsequent hellos are outside this metadata subset.',
                           'Flattened TLS fields can make compound hellos with different SNI coverage ambiguous; mismatches are retained for review rather than waived.',
                           'IGMP compares complete supported outer IPv4 messages and ordered group/source metadata; unsupported types, extensions, fragments and invalid checksums remain limited.',
                           'Basic XID compares complete outer IEEE 802.3 LLC metadata, including independent raw capability/window octets before masking. Unfamiliar formats and invalid reserved bits remain limited.',
                           'Reference versions that dispatch AA/AA SAP XID as SNAP fail explicitly as oracle_llc_snap_sap_reference_unsupported; this is not independent validation of that SAP combination.',
                           'Mixed 802.1Q/802.1ad VLAN IDs are compared as an unordered multiset because tshark separates those fields; tag order is not independently validated.']}
    start=time.perf_counter()
    atomic_json(output/'comparison.json',report)
    config=output/'wireshark-config'; config.mkdir(mode=0o700)
    try:
        version=subprocess.run(['tshark','--version'],capture_output=True,text=True,check=True,timeout=5)
        report['tool_version']=version.stdout.splitlines()[0]
        if not paths: raise IngestError('oracle_inputs_required')
        for ordinal,path in enumerate(paths,1):
            entry={'ordinal':ordinal,'sha256':None,'after_sha256':None,'bytes':None,'complete_source_verified':False,
                   'packets':0,'independent_packets':0,'field_comparisons':0,'supported_packets':0,
                   'limited_packets':0,'mismatch_count':0,'mismatches':[],'compared_fields':{}}
            report['files'].append(entry)
            stdout=output/f'decoder-{ordinal}.tsv'
            try: compare_file(Path(path),stdout,config,entry)
            finally: stdout.unlink(missing_ok=True)
        report['status']='PASS' if all(not f['mismatch_count'] and f['complete_source_verified'] for f in report['files']) else 'FAILED'
    except KeyboardInterrupt:
        report.update(status='CANCELLED',reason='operator_cancellation')
    except (OSError,ValueError,IngestError,subprocess.SubprocessError,IndexError) as exc:
        report.update(status='FAILED',reason=str(exc) if isinstance(exc,IngestError) else 'oracle_'+type(exc).__name__)
    report['wall_seconds']=time.perf_counter()-start
    atomic_json(output/'comparison.json',report)
    return report


def main():
    p=argparse.ArgumentParser(description=__doc__); p.add_argument('inputs',nargs='+',type=Path); p.add_argument('--output',required=True,type=Path); a=p.parse_args()
    try:
        report=compare(a.inputs,a.output)
        print(json.dumps({'status':report['status'],'files':len(report['files']),'comparisons':sum(f['field_comparisons'] for f in report['files']),'reason':report.get('reason')}))
        return 0 if report['status']=='PASS' else 130 if report['status']=='CANCELLED' else 2
    except (OSError,ValueError,IngestError) as exc:
        print(str(exc) if isinstance(exc,IngestError) else 'oracle_failed_'+type(exc).__name__); return 2

if __name__=='__main__': raise SystemExit(main())
