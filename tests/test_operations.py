import sqlite3
import tempfile
import unittest
from pathlib import Path

from app.operations import get_backups_list, perform_database_backup


class BackupOperationTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.database_path = self.root / "dev.db"
        self.backups = self.root / "backups"

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_online_backup_includes_committed_wal_data(self):
        writer = sqlite3.connect(self.database_path)
        writer.execute("PRAGMA journal_mode = WAL")
        writer.execute("CREATE TABLE sales (id INTEGER PRIMARY KEY, total INTEGER)")
        writer.execute("INSERT INTO sales (total) VALUES (1250)")
        writer.commit()

        filename = perform_database_backup(self.database_path, force=True, backups_directory=self.backups)
        writer.close()

        self.assertIsNotNone(filename)
        snapshot = sqlite3.connect(self.backups / filename)
        try:
            self.assertEqual(snapshot.execute("SELECT total FROM sales").fetchone()[0], 1250)
            self.assertEqual(snapshot.execute("PRAGMA quick_check").fetchone()[0], "ok")
        finally:
            snapshot.close()

    def test_corrupt_database_is_not_backed_up(self):
        self.database_path.write_bytes(b"not sqlite")

        result = perform_database_backup(self.database_path, force=True, backups_directory=self.backups)

        self.assertIsNone(result)
        self.assertEqual(list(self.backups.glob("dev_backup_*.db")), [])

    def test_manual_backup_retains_latest_ten_and_lists_metadata(self):
        connection = sqlite3.connect(self.database_path)
        try:
            connection.execute("CREATE TABLE sample (value INTEGER)")
            connection.execute("INSERT INTO sample VALUES (1)")
            connection.commit()
        finally:
            connection.close()
        self.backups.mkdir()
        for index in range(12):
            (self.backups / f"dev_backup_2026-01-{index + 1:02d}T00-00-00.db").write_bytes(b"old")

        filename = perform_database_backup(self.database_path, force=True, backups_directory=self.backups)
        backups = get_backups_list(self.backups)

        self.assertIsNotNone(filename)
        self.assertEqual(len(backups), 10)
        self.assertEqual(backups[0]["filename"], filename)
        self.assertIn("sizeFormatted", backups[0])


if __name__ == "__main__":
    unittest.main()