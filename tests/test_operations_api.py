import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import create_app
from app.print_jobs import PrintJobStore


class OperationsApiTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.database_path = self.root / "dev.db"
        connection = sqlite3.connect(self.database_path)
        try:
            connection.execute("CREATE TABLE sample (value INTEGER)")
            connection.execute("INSERT INTO sample VALUES (42)")
            connection.commit()
        finally:
            connection.close()
        self.store = PrintJobStore(self.database_path)
        self.root_patch = patch("app.main.ROOT", self.root)
        self.database_patch = patch("app.main.database_path", return_value=self.database_path)
        self.root_patch.start()
        self.database_patch.start()
        self.client = TestClient(create_app(self.store))

    def tearDown(self):
        self.client.close()
        self.database_patch.stop()
        self.root_patch.stop()
        self.temp_dir.cleanup()

    def test_debug_is_read_only_and_reports_integrity(self):
        response = self.client.get("/api/debug")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["quickCheck"], "ok")
        self.assertEqual(response.json()["dbExists"], True)
        check = sqlite3.connect(self.database_path)
        try:
            self.assertEqual(check.execute("SELECT value FROM sample").fetchone()[0], 42)
        finally:
            check.close()

    def test_manual_backup_and_backup_listing(self):
        empty = self.client.get("/api/admin/backups")
        created = self.client.post("/api/admin/backup")
        listed = self.client.get("/api/admin/backups")

        self.assertEqual(empty.json(), [])
        self.assertEqual(created.status_code, 200)
        self.assertIn("filename", created.json())
        self.assertEqual(listed.json()[0]["filename"], created.json()["filename"])

    def test_printer_discovery_response(self):
        with patch("app.main.list_windows_printers", return_value={
            "configured": "Receipt USB",
            "printers": [{"Name": "Receipt USB", "Default": True, "PrinterStatus": 0}],
        }):
            response = self.client.get("/api/printers")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["printers"][0]["Name"], "Receipt USB")


if __name__ == "__main__":
    unittest.main()