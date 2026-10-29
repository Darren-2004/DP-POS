import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from app.auth import hash_pin, verify_pin
from app.main import create_app
from app.print_jobs import PrintJobStore


class PrintApiTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        store = PrintJobStore(Path(self.temp_dir.name) / "pos.db")
        with store._connect() as connection:
            connection.execute(
                'CREATE TABLE "User" (id TEXT PRIMARY KEY, name TEXT NOT NULL, pin TEXT NOT NULL, role TEXT NOT NULL, permissions TEXT NOT NULL DEFAULT \'ALL\', needsPinReset INTEGER NOT NULL DEFAULT 1)'
            )
            connection.execute(
                'INSERT INTO "User" (id, name, pin, role, permissions, needsPinReset) VALUES (?, ?, ?, ?, ?, ?)',
                ("admin-1", "Administrateur", hash_pin("1234"), "ADMIN", "ALL", 0),
            )
        self.station = store.create_station("Cashier 1")
        self.client = TestClient(create_app(store))

    def tearDown(self):
        self.client.close()
        self.temp_dir.cleanup()

    def test_station_list_never_exposes_agent_token(self):
        response = self.client.get("/api/print/stations")

        self.assertEqual(response.status_code, 200)
        station = response.json()[0]
        self.assertEqual(station["id"], self.station["stationId"])
        self.assertEqual(station["name"], "Cashier 1")
        self.assertFalse(station["online"])
        self.assertIsNone(station["lastSeen"])
        self.assertNotIn(self.station["agentToken"], response.text)

    def test_agent_heartbeat_updates_station_health(self):
        headers = {"Authorization": f"Bearer {self.station['agentToken']}"}
        heartbeat = self.client.post(
            "/api/print/agent/heartbeat",
            headers=headers,
            json={
                "hostName": "POS-1",
                "printerName": "Receipt Printer",
                "agentVersion": "1.0.0",
            },
        )

        self.assertEqual(heartbeat.status_code, 200)
        station = self.client.get("/api/print/stations").json()[0]
        self.assertTrue(station["online"])
        self.assertEqual(station["hostName"], "POS-1")
        self.assertEqual(station["printerName"], "Receipt Printer")

    def test_admin_can_revoke_a_print_station(self):
        second_station = self.client.post('/api/print/stations', json={'name': 'Cashier 2'}).json()
        self.assertEqual(second_station['name'], 'Cashier 2')

        response = self.client.delete(
            f"/api/print/stations/{second_station['stationId']}",
            headers={'x-admin-pin': '1234'},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['stationId'], second_station['stationId'])
        self.assertEqual(self.client.get('/api/print/stations').json(), [
            {
                'id': self.station['stationId'],
                'name': 'Cashier 1',
                'lastSeen': None,
                'hostName': None,
                'printerName': None,
                'agentVersion': None,
                'online': False,
                'duplicatePrinter': False,
            }
        ])
        revoked_agent = self.client.get(
            '/api/print/agent/next',
            headers={'Authorization': f"Bearer {second_station['agentToken']}"},
        )
        self.assertEqual(revoked_agent.status_code, 401)

    def test_test_print_queues_station_targeted_job_without_invoice(self):
        queued = self.client.post("/api/print/test", json={"stationId": self.station["stationId"]})
        self.assertEqual(queued.status_code, 202)
        self.assertEqual(queued.json()["stationId"], self.station["stationId"])

        headers = {"Authorization": f"Bearer {self.station['agentToken']}"}
        claimed = self.client.get("/api/print/agent/next", headers=headers).json()["job"]
        self.assertTrue(claimed["payload"]["testPage"])
        self.assertEqual(claimed["payload"]["stationName"], "Cashier 1")
        self.assertIsNone(claimed["invoiceId"])

    def test_test_print_rejects_unknown_station(self):
        response = self.client.post("/api/print/test", json={"stationId": "missing"})
        self.assertEqual(response.status_code, 404)

    def test_agent_claims_and_acknowledges_station_job(self):
        queued = self.client.post(
            "/api/print",
            json={
                "stationId": self.station["stationId"],
                "idempotencyKey": "invoice:invoice-1",
                "invoiceData": {"id": "invoice-1"},
            },
        )
        self.assertEqual(queued.status_code, 202)

        headers = {"Authorization": f"Bearer {self.station['agentToken']}"}
        claimed = self.client.get("/api/print/agent/next", headers=headers)
        self.assertEqual(claimed.status_code, 200)
        job = claimed.json()["job"]
        self.assertEqual(job["payload"]["invoiceData"]["id"], "invoice-1")

        printing = self.client.post(
            f"/api/print/agent/jobs/{job['jobId']}/printing",
            headers=headers,
            json={"leaseToken": job["leaseToken"]},
        )
        printed = self.client.post(
            f"/api/print/agent/jobs/{job['jobId']}/printed",
            headers=headers,
            json={"leaseToken": job["leaseToken"]},
        )
        self.assertEqual(printing.status_code, 200)
        self.assertEqual(printed.json()["status"], "printed")

    def test_station_credentials_are_required_to_claim_jobs(self):
        response = self.client.get("/api/print/agent/next")
        self.assertEqual(response.status_code, 401)

    def test_connected_agent_receives_new_jobs_over_websocket(self):
        headers = {"Authorization": f"Bearer {self.station['agentToken']}"}
        with self.client.websocket_connect("/api/print/agent/ws", headers=headers) as socket:
            queued = self.client.post(
                "/api/print",
                json={
                    "stationId": self.station["stationId"],
                    "invoiceData": {"id": "invoice-ws"},
                    "idempotencyKey": "invoice:invoice-ws",
                },
            )
            delivered = socket.receive_json()

        self.assertEqual(queued.status_code, 202)
        self.assertEqual(delivered["payload"]["invoiceData"]["id"], "invoice-ws")


class LoginAndCategoryApiTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        database_path = Path(self.temp_dir.name) / "pos.db"
        self.store = PrintJobStore(database_path)
        with self.store._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE "User" (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, pin TEXT NOT NULL, role TEXT NOT NULL,
                    permissions TEXT NOT NULL DEFAULT 'ALL', needsPinReset INTEGER NOT NULL DEFAULT 1,
                    shopType TEXT NOT NULL DEFAULT 'ALL'
                );
                CREATE TABLE "Category" (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, shopType TEXT NOT NULL DEFAULT 'ALL');
                CREATE TABLE "SubCategory" (id TEXT PRIMARY KEY, name TEXT NOT NULL, categoryId TEXT NOT NULL, price REAL NOT NULL DEFAULT 0);
                """
            )
            connection.execute(
                'INSERT INTO "User" (id, name, pin, role, permissions, needsPinReset) VALUES (?, ?, ?, ?, ?, ?)',
                ("user-1", "Cashier", hash_pin("1234"), "CASHIER", "DIRECT_SALE", 1),
            )
            connection.execute('INSERT INTO "Category" (id, name, color) VALUES (?, ?, ?)', ("cat-1", "Chemises", "blue"))
            connection.execute(
                'INSERT INTO "SubCategory" (id, name, categoryId) VALUES (?, ?, ?)',
                ("sub-1", "Coton", "cat-1"),
            )
        self.client = TestClient(create_app(self.store))

    def tearDown(self):
        self.client.close()
        self.temp_dir.cleanup()

    def test_user_list_and_login_keep_frontend_fields(self):
        users = self.client.get("/api/users")
        login = self.client.post("/api/auth/login", json={"userId": "user-1", "pin": "1234"})

        self.assertEqual(users.json(), [{
            "id": "user-1",
            "name": "Cashier",
            "role": "CASHIER",
            "permissions": "DIRECT_SALE",
            "needsPinReset": True,
            "shopType": "ALL",
        }])
        self.assertEqual(login.status_code, 200)
        self.assertEqual(login.json()["permissions"], "DIRECT_SALE")
        self.assertTrue(login.json()["accessToken"])
        self.assertNotIn("pin", login.json())

    def test_user_management_requires_authorized_session(self):
        body = {"name": "New cashier", "pin": "5678", "role": "CASHIER", "shopType": "ALL"}
        self.assertEqual(self.client.post("/api/users", json=body).status_code, 401)

        cashier_login = self.client.post(
            "/api/auth/login", json={"userId": "user-1", "pin": "1234"}
        ).json()
        cashier_headers = {"Authorization": f"Bearer {cashier_login['accessToken']}"}
        self.assertEqual(
            self.client.post("/api/users", json=body, headers=cashier_headers).status_code,
            403,
        )

        with self.store._connect() as connection:
            connection.execute(
                'INSERT INTO "User" (id, name, pin, role, permissions, needsPinReset) VALUES (?, ?, ?, ?, ?, ?)',
                ("admin-1", "Admin", hash_pin("9876"), "ADMIN", "ALL", 0),
            )
        admin_login = self.client.post(
            "/api/auth/login", json={"userId": "admin-1", "pin": "9876"}
        ).json()
        admin_headers = {"Authorization": f"Bearer {admin_login['accessToken']}"}
        created = self.client.post("/api/users", json=body, headers=admin_headers)
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()["name"], "New cashier")

    def test_manager_can_only_manage_cashiers_in_assigned_shop(self):
        with self.store._connect() as connection:
            connection.executemany(
                'INSERT INTO "User" (id, name, pin, role, permissions, needsPinReset, shopType) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [
                    ("manager-1", "Manager", hash_pin("9876"), "MANAGER", "ALL", 0, "HOMME"),
                    ("cashier-1", "Shop cashier", hash_pin("1234"), "CASHIER", "ALL", 0, "HOMME"),
                    ("cashier-2", "Other cashier", hash_pin("1234"), "CASHIER", "ALL", 0, "FEMME"),
                ],
            )
        login = self.client.post(
            "/api/auth/login", json={"userId": "manager-1", "pin": "9876"}
        ).json()
        headers = {"Authorization": f"Bearer {login['accessToken']}"}

        self.assertEqual(
            self.client.put(
                "/api/users/cashier-1",
                json={"name": "Updated cashier", "role": "CASHIER", "shopType": "HOMME"},
                headers=headers,
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.put(
                "/api/users/cashier-2",
                json={"name": "Should not update"},
                headers=headers,
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.post(
                "/api/users",
                json={"name": "Admin attempt", "role": "ADMIN", "shopType": "ALL"},
                headers=headers,
            ).status_code,
            403,
        )

    def test_salon_reset_requires_admin_session(self):
        self.assertEqual(self.client.post("/api/system/reset-salon").status_code, 401)
        cashier_login = self.client.post(
            "/api/auth/login", json={"userId": "user-1", "pin": "1234"}
        ).json()
        headers = {"Authorization": f"Bearer {cashier_login['accessToken']}"}
        self.assertEqual(
            self.client.post("/api/system/reset-salon", headers=headers).status_code,
            403,
        )

    def test_pin_reset_updates_legacy_hash_and_flag(self):
        response = self.client.post(
            "/api/auth/reset-pin",
            json={"userId": "user-1", "oldPin": "1234", "newPin": "5678"},
        )

        self.assertEqual(response.status_code, 200)
        with self.store._connect() as connection:
            user = connection.execute('SELECT pin, needsPinReset FROM "User" WHERE id = ?', ("user-1",)).fetchone()
        self.assertTrue(verify_pin("5678", user["pin"]))
        self.assertFalse(user["needsPinReset"])

    def test_category_response_contains_subcategories(self):
        response = self.client.get("/api/categories")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["subCategories"][0]["name"], "Coton")


if __name__ == "__main__":
    unittest.main()