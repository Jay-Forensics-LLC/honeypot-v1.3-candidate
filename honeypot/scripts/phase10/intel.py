"""Bounded, mock-only intelligence enrichment. This module never sends requests."""
from collections import OrderedDict, deque
from copy import deepcopy
import datetime as dt
import ipaddress
import math
import re
import time
from urllib.parse import urlsplit

from .model import Phase10Error, normalize_indicator

PROVIDERS = ('otx', 'abuseipdb', 'greynoise', 'virustotal', 'threatfox',
             'certificate-transparency')
_LOCAL_SUFFIXES = ('.local', '.localhost', '.internal', '.lan', '.home',
                   '.home.arpa', '.invalid', '.test', '.example', '.onion', '.arpa')


def _public_host(host):
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return ('.' in host and not host.endswith(_LOCAL_SUFFIXES)
                and host not in ('localhost', 'home.arpa'))
    return address.is_global and not address.is_multicast


def _eligible(kind, value):
    if kind == 'ip':
        return _public_host(value)
    if kind == 'domain':
        return _public_host(value)
    if kind == 'url':
        parsed = urlsplit(value)
        return (parsed.scheme in ('http', 'https') and bool(parsed.hostname)
                and parsed.username is None and parsed.password is None
                and not parsed.query and not parsed.fragment
                and _public_host(parsed.hostname))
    return kind == 'file' and bool(re.fullmatch('[0-9a-f]{64}', value))


def _integer(value, maximum=1000000):
    return value if type(value) is int and 0 <= value <= maximum else None


def _confidence(value):
    if type(value) in (int, float) and 0 <= value <= 1 and math.isfinite(value):
        return float(value)
    return None


def _response_bounds(value):
    """Reject overlarge/deep mock objects without copying arbitrary response text."""
    pending = [(value, 0)]
    count = 0
    while pending:
        item, depth = pending.pop()
        count += 1
        if count > 20000 or depth > 16:
            raise Phase10Error('Mock response exceeds structural limits')
        if isinstance(item, dict):
            if len(item) > 1000 or any(type(k) is not str or len(k) > 128 for k in item):
                raise Phase10Error('Mock response has invalid fields')
            pending.extend((v, depth + 1) for v in item.values())
        elif isinstance(item, list):
            if len(item) > 10000:
                raise Phase10Error('Mock response exceeds record limit')
            pending.extend((v, depth + 1) for v in item)
        elif isinstance(item, str):
            if len(item) > 4096:
                raise Phase10Error('Mock response exceeds text limit')
        elif item is not None and type(item) not in (bool, int, float):
            raise Phase10Error('Mock response must contain JSON values')
        elif type(item) is float and not math.isfinite(item):
            raise Phase10Error('Mock response has non-finite numeric data')


def _object(value):
    return value if isinstance(value, dict) else {}


def _details(provider, response):
    """Copy only small typed provider fields, never raw descriptions or credentials."""
    if provider == 'certificate-transparency':
        if not isinstance(response, (dict, list)):
            raise Phase10Error('Invalid certificate transparency mock')
        rows = response if isinstance(response, list) else response.get('certificates', [])
        if not isinstance(rows, list):
            raise Phase10Error('Invalid certificate transparency mock')
        return {'certificate_count': len(rows)}
    if not isinstance(response, dict):
        raise Phase10Error('Mock provider response must be an object')
    if provider == 'otx':
        return {'pulse_count': _integer(_object(response.get('pulse_info')).get('count'))}
    if provider == 'abuseipdb':
        data = _object(response.get('data'))
        return {'abuse_confidence_score': _integer(data.get('abuseConfidenceScore'), 100),
                'total_reports': _integer(data.get('totalReports'))}
    if provider == 'greynoise':
        return {'noise': response.get('noise') if type(response.get('noise')) is bool else None,
                'riot': response.get('riot') if type(response.get('riot')) is bool else None,
                'classification': response.get('classification')
                if response.get('classification') in ('benign', 'malicious', 'unknown') else None}
    if provider == 'virustotal':
        stats = _object(_object(_object(response.get('data')).get('attributes')).get('last_analysis_stats'))
        return {key: _integer(stats.get(key)) for key in
                ('harmless', 'malicious', 'suspicious', 'undetected', 'timeout')}
    rows = response.get('data', [])
    if not isinstance(rows, list):
        raise Phase10Error('Invalid ThreatFox mock')
    return {'match_count': len(rows)}


class MockEnricher:
    """In-memory mock cache and failure policy; no external adapter is installed.

    Eligibility is syntactic and performs no DNS lookup. A future live adapter
    needs its own disclosure authorization and resolved-destination checks.
    """
    def __init__(self, policy, *, clock=time.time, ttl_seconds=3600,
                 max_cache_entries=256, max_calls=100, rate_limit=10,
                 rate_window_seconds=60, backoff_seconds=5,
                 max_backoff_seconds=300):
        limits = (ttl_seconds, max_cache_entries, max_calls, rate_limit,
                  rate_window_seconds, backoff_seconds, max_backoff_seconds)
        if any(type(n) is not int or not 1 <= n <= 1000000 for n in limits):
            raise Phase10Error('Invalid mock intelligence limits')
        if max_cache_entries > 10000 or rate_limit > 10000 or max_backoff_seconds < backoff_seconds:
            raise Phase10Error('Invalid mock intelligence limits')
        self.policy, self.clock = policy, clock
        self.ttl, self.capacity, self.max_calls = ttl_seconds, max_cache_entries, max_calls
        self.rate_limit, self.rate_window = rate_limit, rate_window_seconds
        self.backoff, self.max_backoff = backoff_seconds, max_backoff_seconds
        self.cache = OrderedDict()
        self.calls = 0
        self.windows = {provider: deque() for provider in PROVIDERS}
        self.failures = {}

    def enrich(self, provider, kind, value, response=None, status=200):
        if provider not in PROVIDERS:
            raise Phase10Error('Unknown mock intelligence provider')
        if not ((type(status) is int and 100 <= status <= 599)
                or status in ('timeout', 'unavailable')):
            raise Phase10Error('Invalid mock response status')
        now = self.clock()
        if type(now) not in (int, float) or not 0 <= now <= 253402300799 or not math.isfinite(now):
            raise Phase10Error('Invalid mock clock')
        result = {'source': provider, 'mock': True, 'sharing': 'none',
                  'checked_at': dt.datetime.fromtimestamp(now, dt.timezone.utc).isoformat().replace('+00:00', 'Z'),
                  'assessment': 'possible', 'confidence': None}
        try:
            self.policy.require('mock-ti')
        except Phase10Error:
            return dict(result, status='disabled')
        try:
            # Generic report normalization strips URL queries/fragments; refuse
            # those fields here before normalization can discard their presence.
            if kind == 'url' and (type(value) is not str or not _eligible(kind, value)):
                return dict(result, status='refused', reason='ineligible_indicator')
            kind, value = normalize_indicator(kind, value)
            if not _eligible(kind, value):
                return dict(result, status='refused', reason='ineligible_indicator')
        except (Phase10Error, ValueError, TypeError):
            return dict(result, status='refused', reason='ineligible_indicator')
        result.update(indicator_type=kind, indicator_value=value)
        key = (provider, kind, value)
        for old in [key for key, (expires, _) in self.cache.items() if expires <= now]:
            del self.cache[old]
        if key in self.cache:
            _, cached = self.cache[key]
            self.cache.move_to_end(key)
            return dict(deepcopy(cached), cached=True)
        failure_count, retry_at = self.failures.get(provider, (0, 0))
        if now < retry_at:
            return dict(result, status='backoff', retry_after_seconds=math.ceil(retry_at - now))
        if self.calls >= self.max_calls:
            return dict(result, status='quota-exhausted')
        window = self.windows[provider]
        while window and window[0] <= now - self.rate_window:
            window.popleft()
        if len(window) >= self.rate_limit:
            return dict(result, status='rate-limited',
                        retry_after_seconds=math.ceil(window[0] + self.rate_window - now))
        self.calls += 1
        window.append(now)
        if status in ('timeout', 'unavailable') or (type(status) is int and not 200 <= status < 300) or response is None:
            delay = min(self.max_backoff, self.backoff * 2 ** min(failure_count, 30))
            self.failures[provider] = (failure_count + 1, now + delay)
            outcome = 'timeout' if status == 'timeout' else 'rate-limited' if status == 429 else 'unavailable'
            return dict(result, status=outcome, retry_after_seconds=delay)
        _response_bounds(response)
        details = {key: value for key, value in _details(provider, response).items() if value is not None}
        self.failures.pop(provider, None)
        result.update(status='ok', cached=False, details=details,
                      confidence=_confidence(response.get('confidence')) if isinstance(response, dict) else None)
        self.cache[key] = (now + self.ttl, deepcopy(result))
        while len(self.cache) > self.capacity:
            self.cache.popitem(last=False)
        return result
