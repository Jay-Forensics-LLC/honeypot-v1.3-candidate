"""Decoy identity preparation changes presentation without changing containment."""
import configparser
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from decoy_profiles import describe_profiles, render_profile
from phase10.model import Phase10Error


class DecoyProfiles(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.source = Path(__file__).resolve().parents[1]
        shutil.copytree(self.source / 'configs/cowrie', self.root / 'configs/cowrie')
        shutil.copytree(self.source / 'configs/opencanary', self.root / 'configs/opencanary')

    @staticmethod
    def config(text):
        parser = configparser.ConfigParser(interpolation=None)
        parser.read_string(text)
        return {section: dict(parser[section]) for section in parser.sections()}

    def test_profiles_change_only_supported_identity_fields_and_never_write(self):
        original_cowrie = self.config((self.root / 'configs/cowrie/cowrie.cfg').read_text())
        original_canary = json.loads((self.root / 'configs/opencanary/opencanary.conf').read_text())
        original_files = {str(path): path.read_bytes() for path in self.root.rglob('*') if path.is_file()}
        for profile in describe_profiles():
            with self.subTest(profile=profile['id']):
                result = render_profile(self.root, profile['id'])
                self.assertEqual(result['status'], 'prepared')
                self.assertIn('no running services changed', result['note'])
                files = {file['name']: file for file in result['files']}
                self.assertEqual(set(files), {'cowrie.cfg', 'opencanary.conf'})
                cowrie = self.config(files['cowrie.cfg']['content'])
                self.assertEqual(cowrie['honeypot'].pop('hostname'), profile['id'])
                expected = {section: values.copy() for section, values in original_cowrie.items()}
                expected['honeypot'].pop('hostname')
                self.assertEqual(cowrie, expected)
                canary = json.loads(files['opencanary.conf']['content'])
                for key in ('device.node_id', 'ftp.banner', 'http.banner'):
                    canary.pop(key)
                self.assertEqual(canary, {key: value for key, value in original_canary.items()
                                          if key not in ('device.node_id', 'ftp.banner', 'http.banner')})
                for file in files.values():
                    self.assertEqual(file['sha256'], hashlib.sha256(file['content'].encode()).hexdigest())
        self.assertEqual({str(path): path.read_bytes() for path in self.root.rglob('*') if path.is_file()},
                         original_files)

    def test_disabled_services_and_explicit_restrictions_survive(self):
        path = self.root / 'configs/opencanary/opencanary.conf'
        canary = json.loads(path.read_text())
        canary['ftp.enabled'] = False
        canary['ip.ignorelist'] = ['192.0.2.1']
        canary['http.port'] = 18080
        path.write_text(json.dumps(canary))
        result = render_profile(self.root, 'webserver')
        output = json.loads(result['files'][1]['content'])
        self.assertFalse(output['ftp.enabled'])
        self.assertEqual(output['http.port'], 18080)
        self.assertEqual(output['ip.ignorelist'], ['192.0.2.1'])
        cowrie = self.config(result['files'][0]['content'])
        self.assertEqual(cowrie['ssh']['forwarding'], 'false')
        self.assertEqual(cowrie['ssh']['listen_endpoints'], 'tcp:2222:interface=0.0.0.0')
        self.assertEqual(cowrie['output_jsonlog']['enabled'], 'true')

    def test_credential_bearing_configuration_is_not_exported_or_modified(self):
        path = self.root / 'configs/opencanary/opencanary.conf'
        canary = json.loads(path.read_text())
        canary['service.password'] = 'PRIVATE_FIXTURE_CREDENTIAL'
        path.write_text(json.dumps(canary))
        original = path.read_bytes()
        with self.assertRaises(Phase10Error) as caught:
            render_profile(self.root, 'fileserver')
        self.assertNotIn('PRIVATE_FIXTURE_CREDENTIAL', str(caught.exception))
        self.assertEqual(path.read_bytes(), original)

    def test_unknown_profile_bad_configuration_and_symlink_are_rejected(self):
        for profile in ('unknown', '../webserver', None, []):
            with self.subTest(profile=profile), self.assertRaises(Phase10Error):
                render_profile(self.root, profile)
        path = self.root / 'configs/cowrie/cowrie.cfg'
        path.write_text('[invalid')
        with self.assertRaises(Phase10Error):
            render_profile(self.root, 'fileserver')
        path.unlink()
        path.symlink_to(self.source / 'configs/cowrie/cowrie.cfg')
        with self.assertRaises(Phase10Error):
            render_profile(self.root, 'fileserver')

    def test_profile_descriptions_cannot_mutate_fixed_templates(self):
        profiles = describe_profiles()
        profiles[0]['services'].clear()
        profiles[0]['limitations'].clear()
        self.assertEqual(len(describe_profiles()[0]['services']), 4)
        self.assertTrue(describe_profiles()[0]['limitations'])


if __name__ == '__main__':
    unittest.main()
