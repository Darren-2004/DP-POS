import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from app.auth import hash_pin
from app.main import create_app
from app.print_jobs import PrintJobStore
from app.schema import ensure_schema


class ShopSettingsApiTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = PrintJobStore(Path(self.temp_dir.name) / "pos.db")
        with self.store._connect() as connection:
            ensure_schema(connection)
            connection.executemany(
                'INSERT INTO "User" (id, name, pin, role, permissions, needsPinReset) VALUES (?, ?, ?, ?, ?, ?)',
                [
                    ("admin-1", "Admin", hash_pin("1234"), "ADMIN", "ALL", 0),
                    ("cashier-1", "Cashier", hash_pin("5678"), "CASHIER", "ALL", 0),
                ],
            )
        self.client = TestClient(create_app(self.store))
        self.admin_headers = self._login("admin-1", "1234")
        self.cashier_headers = self._login("cashier-1", "5678")

    def tearDown(self):
        self.client.close()
        self.temp_dir.cleanup()

    def _login(self, user_id, pin):
        response = self.client.post("/api/auth/login", json={"userId": user_id, "pin": pin})
        return {"Authorization": f"Bearer {response.json()['accessToken']}"}

    def test_shop_names_default_to_shop_labels_and_can_be_updated(self):
        initial = self.client.get("/api/settings/shop-names")
        self.assertEqual(initial.json(), {"HOMME": "Shop 1", "FEMME": "Shop 2"})

        updated = self.client.put(
            "/api/settings/shop-names",
            headers=self.admin_headers,
            json={"HOMME": "Coiffure", "FEMME": "Beauté"},
        )

        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json(), {"HOMME": "Coiffure", "FEMME": "Beauté"})
        self.assertEqual(self.client.get("/api/settings/shop-names").json(), updated.json())

    def test_shop_names_can_only_be_changed_by_admins(self):
        body = {"HOMME": "Coiffure", "FEMME": "Beauté"}
        self.assertEqual(self.client.put("/api/settings/shop-names", json=body).status_code, 401)
        self.assertEqual(
            self.client.put("/api/settings/shop-names", headers=self.cashier_headers, json=body).status_code,
            403,
        )
        self.assertEqual(
            self.client.put(
                "/api/settings/shop-names",
                headers=self.admin_headers,
                json={"HOMME": " ", "FEMME": "Beauté"},
            ).status_code,
            400,
        )


if __name__ == "__main__":
    unittest.main()
