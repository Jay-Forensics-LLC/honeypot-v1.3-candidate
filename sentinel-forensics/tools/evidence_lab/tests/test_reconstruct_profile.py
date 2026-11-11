"""Named profile boundaries; no capture evidence or decoder execution."""
import unittest

from core import IngestError
import reconstruct as driver
from reconstruct_profile import STANDARD, SOLO, envelope, specification


class ProfileConfigurationTests(unittest.TestCase):
    def test_default_standard_limits_and_selector_contract_are_unchanged(self):
        self.assertEqual(driver.configuration(),driver.DEFAULT_LIMITS)
        self.assertEqual(envelope(STANDARD),{'frames':16384,'bytes':16777216,'cohorts':4})
        self.assertEqual(specification(),{'schema':'sentinel.tls-analysis-profile/1',
            'profile':STANDARD,'cohort_id':None,'continuation_supported':True})
        with self.assertRaisesRegex(IngestError,'tls_parser_cap_exceeded'):
            driver.configuration({'batch_frames':16385})
        with self.assertRaisesRegex(IngestError,'tls_cohort_selector_requires_solo_profile'):
            specification(STANDARD,1)

    def test_solo_fixed_envelope_retains_all_resource_and_support_caps(self):
        limits=driver.configuration(profile=SOLO)
        self.assertEqual({name:limits[name] for name in
            ('max_batches','batch_cohorts','batch_frames','batch_bytes','total_frames')},
            {'max_batches':1,'batch_cohorts':1,'batch_frames':32768,
             'batch_bytes':33554432,'total_frames':32768})
        for name in ('rss_bytes','timeout_seconds','decoder_seconds','scratch_bytes',
                     'candidates','packet_rows','support_references','support_links','segments_per_candidate'):
            self.assertEqual(limits[name],driver.DEFAULT_LIMITS[name])
        for name in limits:
            with self.subTest(name=name),self.assertRaises(IngestError):
                driver.configuration({name:limits[name]+1},profile=SOLO)
        self.assertEqual(driver.configuration({'total_frames':20000},profile=SOLO)['total_frames'],20000)
        self.assertEqual(specification(SOLO,2)['cohort_id'],2)

    def test_selector_and_profile_types_cannot_alias_integer_or_default(self):
        for value in (None,True,False,0,-1,2049,1.0,'1',[],{}):
            with self.subTest(value=value),self.assertRaisesRegex(IngestError,'tls_solo_cohort_id_invalid'):
                specification(SOLO,value)
        for value in (None,True,1,{},'solo',''):
            with self.subTest(value=value),self.assertRaisesRegex(IngestError,'tls_unknown_analysis_profile'):
                driver.configuration(profile=value)
        for value in (True,0,-1,1.0):
            with self.subTest(value=value),self.assertRaisesRegex(IngestError,'tls_positive_integer_limits_required'):
                driver.configuration({'batch_frames':value},profile=SOLO)

    def test_profile_and_selector_are_rejected_before_output_or_case_access(self):
        for args,code in [({'profile':SOLO,'cohort_id':1,'continue_from':'/unopened'},
                           'tls_solo_continuation_unsupported'),
                          ({'profile':SOLO},'tls_solo_cohort_id_invalid'),
                          ({'cohort_id':1},'tls_cohort_selector_requires_solo_profile')]:
            with self.subTest(args=args),self.assertRaisesRegex(IngestError,code):
                driver.reconstruct('/unopened',{},'/unopened-output',**args)


if __name__=='__main__':unittest.main()
