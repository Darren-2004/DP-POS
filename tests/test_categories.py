import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.print_jobs import PrintJobStore
from app.schema import ensure_schema


class CategoryShopAssignmentTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = PrintJobStore(Path(self.temp_dir.name) / "pos.db")
        with self.store._connect() as connection:
            ensure_schema(connection)
        self.client = TestClient(create_app(self.store))

    def tearDown(self):
        self.client.close()
        self.temp_dir.cleanup()

    def test_create_and_duplicate_category_keep_shop_assignment(self):
        created = self.client.post(
            "/api/categories",
            json={"name": "Barber", "shopType": "HOMME"},
        )

        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()["shopType"], "HOMME")
        listed = self.client.get("/api/categories").json()
        self.assertEqual(next(category for category in listed if category["id"] == created.json()["id"])["shopType"], "HOMME")

        duplicated = self.client.post(
            f"/api/categories/{created.json()['id']}/duplicate",
            json={"newName": "Barber copie"},
        )

        self.assertEqual(duplicated.status_code, 201)
        self.assertEqual(duplicated.json()["shopType"], "HOMME")


if __name__ == "__main__":
    unittest.main()
