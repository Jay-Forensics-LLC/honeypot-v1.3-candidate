"""Versioned HoneyTrace exchange validation. No HoneyTrace runtime connection."""
import json
import re
from pathlib import Path
from core import IngestError, MAX_RECORD, strict_json, canonical

CONTRACT = 'sentinel.honeytrace/1'
# A small explicit JSON Schema vocabulary keeps offline validation dependency-free.
SCHEMA = {
 '$schema':'https://json-schema.org/draft/2020-12/schema',
 '$id':'urn:sentinel:honeytrace:1',
 'type':'object','additionalProperties':False,
 'required':['contract','entity','id','payload'],
 'properties':{
  'contract':{'const':CONTRACT}, 'entity':{'enum':['case','source','observation','timeline','association','finding','coverage','error']},
  'id':{'type':'string','maxLength':128}, 'payload':{'type':'object'}}}
PAYLOADS = {
 'case': {'status':str,'run_id':str,'parser_version':str,'tools':dict,'configuration':dict,'privacy':dict,'limitations':list},
 'source': {'id':int,'sha256':str,'size':int,'kind':str,'parser_version':str,'metadata':dict},
 'observation': {'id':str,'source_id':int,'ordinal':int,'kind':str,'protocol':str,'context':str,
                 'time':dict,'data':dict,'provenance':dict,'duplicate_of':(str,type(None))},
 'timeline': {'event_id':str,'source_id':int,'ordinal':int,'kind':str,'protocol':str,'context':str,
              'original_utc_ns':(int,type(None)),'utc_ns':(int,type(None)),'time':dict,'storage':str,'row_id':int},
 'association': {'id':int,'relationship':str,'context':str,'left_type':str,'left_value':str,'right_type':str,
                 'right_value':str,'start_ns':(int,type(None)),'end_ns':(int,type(None)),'evidence_id':int,
                 'rule':str,'rule_version':str,'confidence':str,'explanation':str,'limitations':list,'conflicts':list},
 'finding': {'id':int,'rule':str,'rule_version':str,'context':str,'start_ns':(int,type(None)),
             'end_ns':(int,type(None)),'severity':str,'confidence':str,'explanation':str,
             'alternatives':list,'limitations':list,'evidence':dict,'metrics':dict},
 'coverage': {'name':str,'details':dict},
 'error': {'code':str,'source_id':(int,type(None)),'ordinal':(int,type(None)),'details':dict}}


def json_type(typ):
    if isinstance(typ,tuple): return {'type':[json_type(t)['type'] for t in typ]}
    return {'type':{str:'string',int:'integer',dict:'object',list:'array',type(None):'null'}[typ]}


def schema():
    result = dict(SCHEMA)
    result['allOf'] = [{'if':{'properties':{'entity':{'const':entity}}},'then':{'properties':{'payload':{
       'type':'object','additionalProperties':False,'required':list(fields),
       'properties':{key:json_type(typ) for key,typ in fields.items()}}}}} for entity,fields in PAYLOADS.items()]
    time_schema={'type':'object','additionalProperties':False,'required':['utc_ns','precision','timezone','status','clock'],
      'properties':{'utc_ns':{'type':['integer','null'],'minimum':-(2**63)+1,'maximum':2**63-1},
       'precision':{'oneOf':[{'type':'null'},
        {'type':'object','additionalProperties':False,'required':['decimal_digits'],'properties':{'decimal_digits':{'type':'integer','minimum':0,'maximum':9}}},
        {'type':'object','additionalProperties':False,'required':['numerator','denominator'],
         'properties':{'numerator':{'const':1},'denominator':{'type':'integer','minimum':1}}}]},
       'timezone':{'type':['string','null']},'status':{'enum':['missing','unresolved','normalized','timezone_unknown','invalid','outside_index_time_range']},
       'clock':{'type':'string'}}}
    result['$defs']={'time':time_schema,'provenance':{'type':'object','required':['source_id','precision'],
       'properties':{'source_id':{'type':'integer','minimum':1},'precision':{'enum':['byte','logical','archive_member_logical']},
        'byte_offset':{'type':'integer','minimum':0},'byte_length':{'type':'integer','minimum':0}},
       'if':{'properties':{'precision':{'const':'byte'}}},'then':{'required':['byte_offset','byte_length']}}}
    for item in result['allOf']:
        entity=item['if']['properties']['entity']['const']
        properties=item['then']['properties']['payload']['properties']
        if entity in ('observation','timeline'): properties['time']={'$ref':'#/$defs/time'}
        if entity=='observation': properties['provenance']={'$ref':'#/$defs/provenance'}
    return result


def validate(obj):
    if not isinstance(obj,dict) or set(obj) != {'contract','entity','id','payload'} or obj['contract'] != CONTRACT:
        raise IngestError('contract_envelope_invalid')
    if not isinstance(obj['id'],str) or not 0 < len(obj['id']) <= 128:
        raise IngestError('contract_id_invalid')
    if not isinstance(obj['entity'],str): raise IngestError('contract_entity_invalid')
    expected = PAYLOADS.get(obj['entity'])
    payload = obj['payload']
    if expected is None or not isinstance(payload,dict) or set(payload) != set(expected):
        raise IngestError('contract_payload_shape')
    for key,typ in expected.items():
        if not isinstance(payload[key],typ) or (isinstance(payload[key],bool) and (typ == int or isinstance(typ,tuple) and int in typ)):
            raise IngestError('contract_payload_type')
    if obj['entity'] == 'source' and (payload['size'] < 0 or not re.fullmatch('[0-9a-f]{64}',payload['sha256'])):
        raise IngestError('contract_source_invalid')
    if obj['entity'] == 'case' and payload['status'] not in ('COMPLETE','INCOMPLETE','FAILED','CANCELLED'):
        raise IngestError('contract_status_invalid')
    if obj['entity'] in ('observation','timeline'):
        when=payload['time']
        if set(when)!={'utc_ns','precision','timezone','status','clock'} or when.get('status') not in ('missing','unresolved','normalized','timezone_unknown','invalid','outside_index_time_range') or not isinstance(when['clock'],str) or when['timezone'] is not None and not isinstance(when['timezone'],str):
            raise IngestError('contract_time_shape')
        if when['utc_ns'] is not None and (type(when['utc_ns']) is not int or not -(2**63)<when['utc_ns']<2**63):
            raise IngestError('contract_time_range')
        precision=when['precision']
        if precision is not None:
            if not isinstance(precision,dict): raise IngestError('contract_time_precision')
            if set(precision)=={'decimal_digits'}:
                if type(precision['decimal_digits']) is not int or not 0<=precision['decimal_digits']<=9: raise IngestError('contract_time_precision')
            elif set(precision)=={'numerator','denominator'}:
                if type(precision['numerator']) is not int or precision['numerator']!=1 or type(precision['denominator']) is not int or precision['denominator']<1: raise IngestError('contract_time_precision')
            else: raise IngestError('contract_time_precision')
        if obj['entity']=='observation':
            ref=payload['provenance']
            if type(ref.get('source_id')) is not int or ref.get('source_id')<1 or ref.get('source_id')!=payload['source_id'] or ref.get('precision') not in ('byte','logical','archive_member_logical'):
                raise IngestError('contract_provenance_invalid')
            if ref['precision']=='byte' and any(type(ref.get(k)) is not int or ref[k]<0 for k in ('byte_offset','byte_length')):
                raise IngestError('contract_provenance_bounds')
    if len(canonical(obj)) > MAX_RECORD: raise IngestError('contract_record_budget')
    return obj


def validate_file(path):
    count = 0
    with Path(path).open('rb') as stream:
        while True:
            raw = stream.readline(MAX_RECORD+1)
            if not raw: break
            validate(strict_json(raw)); count += 1
    return count
