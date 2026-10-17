from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from guard_policy import canonical
from runtime_inventory import fingerprint


class GuardCanonical(unittest.TestCase):
    def test_live_logging_prefix_preserved(self):
        document={'nftables':[{'rule':{'expr':[{'log':{'prefix':'HP_PROTECTED_DENY '}},{'drop':None}]}}]}
        self.assertEqual(canonical(document),document)
        self.assertEqual(len(fingerprint(canonical(document))),64)

    def test_address_prefix_normalization_preserved(self):
        self.assertEqual(canonical({'prefix':{'addr':'192.0.2.1','len':32}}),'192.0.2.1')
        subnet={'prefix':{'addr':'192.0.2.0','len':24}}
        self.assertEqual(canonical(subnet),subnet)

    def test_logging_and_verdict_changes_remain_visible(self):
        original={'log':{'prefix':'HP_EGRESS_DENY '},'verdict':{'drop':None}}
        for changed in ({'log':{'prefix':'OTHER '},'verdict':{'drop':None}},
                        {'log':{'prefix':'HP_EGRESS_DENY '},'verdict':{'accept':None}}):
            self.assertNotEqual(fingerprint(canonical(original)),fingerprint(canonical(changed)))


if __name__=='__main__':unittest.main()
