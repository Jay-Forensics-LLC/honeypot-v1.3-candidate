"""Verify the repository's bundled Sentinel tree against its manifest."""

from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from validate_sentinel_bundle import check


class SentinelRepositorySnapshot(unittest.TestCase):
    def test_repository_snapshot_matches_manifest(self):
        result = check()
        self.assertTrue(result["git_tree"])
        self.assertTrue(result["upstream_git_tree"])


if __name__ == "__main__":
    unittest.main()
