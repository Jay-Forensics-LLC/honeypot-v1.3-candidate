"""Synthetic SQLite setup failures; no real evidence or decoder execution."""
import sqlite3
import unittest
from unittest.mock import Mock, patch

import reconstruct_pipeline as pipeline


class OpenDbFailureCleanupTests(unittest.TestCase):
    def assert_failed_open_closes_once(self, error, setup_step):
        """The caller's original failure must survive a one-time DB close."""
        db = Mock()

        if setup_step == "pragma":
            def execute(query):
                if query == "PRAGMA temp_store=FILE":
                    raise error
            db.execute.side_effect = execute
        elif setup_step == "progress":
            db.set_progress_handler.side_effect = error
        else:
            self.fail("unknown synthetic failure injection")

        with patch.object(pipeline.sqlite3, "connect", return_value=db) as connect:
            with self.assertRaises(type(error)) as caught:
                pipeline.open_db(":memory:")

        self.assertIs(caught.exception, error)
        connect.assert_called_once_with(":memory:", check_same_thread=False)
        db.close.assert_called_once_with()

    def test_pragma_failure_closes_connection_and_reraises_same_sqlite_error(self):
        failure = sqlite3.OperationalError("synthetic SQLite setup failure")
        self.assert_failed_open_closes_once(failure, "pragma")

    def test_keyboard_interrupt_during_late_setup_closes_connection(self):
        failure = KeyboardInterrupt("synthetic cancellation")
        self.assert_failed_open_closes_once(failure, "progress")


if __name__ == "__main__":
    unittest.main()
