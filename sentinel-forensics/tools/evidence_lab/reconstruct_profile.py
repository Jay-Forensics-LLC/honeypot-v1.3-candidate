"""Named, fixed input envelopes; profile selection never raises resource budgets."""
from core import IngestError

STANDARD = 'standard-v1'
SOLO = 'solo-large-cohort-v1'
STREAM_ENVELOPES = {
    STANDARD: {'frames': 16384, 'bytes': 16777216, 'cohorts': 4},
    SOLO: {'frames': 32768, 'bytes': 33554432, 'cohorts': 1},
}


def envelope(name):
    if type(name) is not str or name not in STREAM_ENVELOPES:
        raise IngestError('tls_unknown_analysis_profile')
    return dict(STREAM_ENVELOPES[name])


def specification(name=STANDARD, cohort_id=None):
    envelope(name)
    if name == STANDARD:
        if cohort_id is not None:
            raise IngestError('tls_cohort_selector_requires_solo_profile')
    elif type(cohort_id) is not int or not 1 <= cohort_id <= 2048:
        raise IngestError('tls_solo_cohort_id_invalid')
    return {'schema': 'sentinel.tls-analysis-profile/1', 'profile': name,
            'cohort_id': cohort_id, 'continuation_supported': name == STANDARD}
