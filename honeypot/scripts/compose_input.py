"""One explicit Compose input and image-bound effective execution checks."""
from decimal import Decimal
import json
import os
from pathlib import Path
import re

OVERRIDES=('compose.override.yml','compose.override.yaml','docker-compose.override.yml','docker-compose.override.yaml')
INPUT_ENV=('COMPOSE_FILE','COMPOSE_ENV_FILES','COMPOSE_PROFILES','COMPOSE_PROJECT_NAME','COMPOSE_DISABLE_ENV_FILE')


def require_single_input(root, cfg):
    if any(os.environ.get(key) or cfg.get(key) for key in INPUT_ENV):
        raise ValueError('Additional Compose environment inputs require separate review')
    if any(os.path.lexists(Path(root)/name) for name in OVERRIDES):
        raise ValueError('Additional Compose override file requires separate review')


def argv(root, *arguments, file=None):
    return ['docker','compose','--project-directory',str(root),'--project-name','honeypot',
            '-f',str(file if file is not None else Path(root)/'docker-compose.yml'),*arguments]


def approved_image_configs(approval, runner):
    identities={row['id'] for row in approval['images'].values()}
    rows=json.loads(runner(['docker','image','inspect',*sorted(identities)]).stdout)
    if (type(rows) is not list or any(type(row) is not dict for row in rows) or len(rows)!=len(identities) or
            {row.get('Id') for row in rows}!=identities or
            any(type(row.get('Config')) is not dict for row in rows)):
        raise ValueError('Approved immutable image execution metadata unavailable')
    return {row['Id']:row['Config'] for row in rows}


def literal(value):
    # Compose's canonical JSON escapes dollars for reuse as input. Actual Docker
    # Config fields contain the once-interpolated literal value.
    return value.replace('$$','$')


def arguments(value):
    if value is None or value=='':return []
    if type(value) is not list or any(type(item) is not str for item in value):
        raise ValueError('Canonical Compose execution arguments must be string arrays')
    return value


def environment(values):
    result={}
    for value in values or []:
        if type(value) is not str or '=' not in value:
            raise ValueError('Malformed image/container execution environment')
        key,item=value.split('=',1)
        if not key or key in result:raise ValueError('Ambiguous execution environment')
        result[key]=item
    return result


def duration(value):
    if type(value) is int:
        if value<0 or value>2**63-1:raise ValueError('Invalid execution health duration')
        return value
    if type(value) is not str:raise ValueError('Invalid execution health duration')
    units={'h':3600*10**9,'m':60*10**9,'s':10**9,'ms':10**6,'us':1000,'µs':1000,'ns':1}
    pieces=re.findall(r'(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)',value)
    if not pieces or ''.join(number+unit for number,unit in pieces)!=value:
        raise ValueError('Invalid execution health duration')
    total=sum(Decimal(number)*units[unit] for number,unit in pieces)
    if total!=total.to_integral_value() or not 0<=total<=2**63-1:
        raise ValueError('Invalid execution health duration')
    return int(total)


HEALTH_FIELDS={'interval':'Interval','timeout':'Timeout','retries':'Retries',
               'start_period':'StartPeriod','start_interval':'StartInterval'}


def health(value):
    value=value or {}
    if type(value) is not dict or set(value)-{'Test',*HEALTH_FIELDS.values()}:
        raise ValueError('Unsupported image/container health configuration')
    row={'Test':arguments(value.get('Test'))}
    for field in HEALTH_FIELDS.values():
        item=value.get(field,0)
        if type(item) is not int or item<0:raise ValueError('Invalid execution health setting')
        row[field]=item
    return row


def execution_problems(rendered, containers, images):
    """Compare actual immutable container fields, never a self-reported label."""
    problems=[]
    for name, container in containers.items():
        spec=rendered['services'][name];image=images[container['Image']];actual=container['Config']
        entry=spec.get('entrypoint')
        expected_entry=arguments(image.get('Entrypoint')) if entry is None else [literal(v) for v in arguments(entry)]
        command=spec.get('command')
        expected_command=(arguments(image.get('Cmd')) if entry is None else []) if command is None else [literal(v) for v in arguments(command)]
        for field,expected in (('Entrypoint',expected_entry),('Cmd',expected_command)):
            if arguments(actual.get(field))!=expected:problems.append(name+': execution '+field+' differs from reviewed model and approved image')
        expected_env=environment(image.get('Env'))
        declared=spec.get('environment') or {}
        if type(declared) is not dict or any(type(k) is not str or type(v) is not str for k,v in declared.items()):
            raise ValueError('Unresolved Compose execution environment')
        expected_env.update({k:literal(v) for k,v in declared.items()})
        if environment(actual.get('Env'))!=expected_env:
            problems.append(name+': execution environment differs from reviewed model and approved image')
        expected_health=health(image.get('Healthcheck'));declared=spec.get('healthcheck') or {}
        if type(declared) is not dict or set(declared)-{'test','disable',*HEALTH_FIELDS}:
            raise ValueError('Unsupported Compose health configuration')
        if declared.get('disable') is True:
            expected_health=health({'Test':['NONE']})
        else:
            if declared.get('test') is not None:expected_health['Test']=[literal(v) for v in arguments(declared['test'])]
            for key,field in HEALTH_FIELDS.items():
                if key in declared:
                    item=declared[key]
                    if key=='retries':
                        if type(item) is not int or item<0:raise ValueError('Invalid Compose health retries')
                    else:item=duration(item)
                    expected_health[field]=item
        if health(actual.get('Healthcheck'))!=expected_health:
            problems.append(name+': execution Healthcheck differs from reviewed model and approved image')
        for key,field in (('working_dir','WorkingDir'),('stop_signal','StopSignal')):
            expected=literal(spec[key]) if spec.get(key) else image.get(field,'')
            if (actual.get(field) or '')!=(expected or ''):
                problems.append(name+': execution '+field+' differs from reviewed model and approved image')
    return problems
