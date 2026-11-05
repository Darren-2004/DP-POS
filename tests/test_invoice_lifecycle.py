import sqlite3
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path

from fastapi.testclient import TestClient

from app.auth import hash_pin
from app.invoices import create_invoice
from app.main import create_app
from app.print_jobs import PrintJobStore


class InvoiceLifecycleApiTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        database_path = Path(self.temp_dir.name) / "pos.db"
        self._create_tables(database_path)
        self.store = PrintJobStore(database_path)
        self.station = self.store.create_station("Cashier 1")
        with self._connection(database_path) as connection:
            connection.executemany(
                'INSERT INTO "User" (id, name, pin, role, permissions, needsPinReset, shopType) VALUES (?, ?, ?, ?, ?, 0, ?)',
                [
                    ("cashier-1", "Cashier", hash_pin("1234"), "CASHIER", "ALL", "FEMME"),
                    ("cashier-h", "Cashier Homme", hash_pin("2222"), "CASHIER", "ALL", "HOMME"),
                    ("admin-1", "Admin", hash_pin("9876"), "ADMIN", "ALL", "ALL"),
                    ("manager-h", "Manager Homme", hash_pin("1111"), "MANAGER", "ALL", "HOMME"),
                    ("manager-f", "Manager Femme", hash_pin("3333"), "MANAGER", "ALL", "FEMME"),
                ],
            )
        self.client = TestClient(create_app(self.store))
        self.admin_headers = self._login("admin-1", "9876")
        self.cashier_headers = self._login("cashier-1", "1234")
        self.manager_headers = self._login("manager-h", "1111")
        self.manager_femme_headers = self._login("manager-f", "3333")
        self.invoice = create_invoice(self.store, {
            "totalAmount": 1000,
            "paymentMethod": "CASH",
            "items": [{"categoryName": "Chemise", "price": 1000}],
            "createdById": "cashier-1",
            "stationId": self.station["stationId"],
        })

    def tearDown(self):
        self.client.close()
        self.temp_dir.cleanup()

    def _login(self, user_id, pin):
        response = self.client.post("/api/auth/login", json={"userId": user_id, "pin": pin})
        self.assertEqual(response.status_code, 200, response.text)
        return {"Authorization": f"Bearer {response.json()['accessToken']}"}

    @staticmethod
    @contextmanager
    def _connection(database_path):
        connection = sqlite3.connect(database_path)
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    @staticmethod
    def _create_tables(database_path):
        with InvoiceLifecycleApiTests._connection(database_path) as connection:
            connection.executescript(
                """
                CREATE TABLE "User" (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, pin TEXT NOT NULL,
                    role TEXT NOT NULL, permissions TEXT, needsPinReset INTEGER, shopType TEXT DEFAULT 'ALL'
                );
                CREATE TABLE "Invoice" (
                    id TEXT PRIMARY KEY, invoiceNumber TEXT UNIQUE, totalAmount REAL, paymentMethod TEXT,
                    clientName TEXT, clientPhone TEXT, shopType TEXT DEFAULT 'FEMME', isReservation INTEGER DEFAULT 0, reservationNo TEXT,
                    isDelivery INTEGER DEFAULT 0, deliveryNo TEXT, deliveryAddress TEXT, deliveryStatus TEXT,
                    deliveredAt TEXT, deliveryFee REAL DEFAULT 0, deliveryPerson TEXT, isPaid INTEGER DEFAULT 0,
                    paidAt TEXT, status TEXT DEFAULT 'VALIDATED', cancellationReason TEXT, cancelledAt TEXT,
                    createdAt TEXT, createdById TEXT, cancelledById TEXT
                );
                CREATE TABLE "InvoiceItem" (
                    id TEXT PRIMARY KEY, invoiceId TEXT, categoryName TEXT, price REAL, qty INTEGER DEFAULT 1, itemType TEXT DEFAULT 'SERVICE'
                );
                CREATE TABLE "Client" (
                    id TEXT PRIMARY KEY, name TEXT UNIQUE, phone TEXT, createdAt TEXT, updatedAt TEXT
                );
                """
            )

    def test_admin_can_cancel_invoice_and_ticket_remains_in_journal(self):
        response = self.client.post(
            f"/api/invoices/{self.invoice['id']}/cancel",
            headers=self.admin_headers,
            json={"pin": "9876", "cancellationReason": "Erreur de saisie"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "CANCELLED")
        self.assertEqual(response.json()["cancelledBy"]["name"], "Admin")
        self.assertEqual(response.json()["cancellationReason"], "Erreur de saisie")
        self.assertTrue(response.json()["cancelledAt"])
        listed = self.client.get("/api/invoices?status=CANCELLED", headers=self.admin_headers)
        self.assertEqual(listed.status_code, 200)
        self.assertEqual([row["id"] for row in listed.json()], [self.invoice["id"]])
        duplicate = self.client.post(
            f"/api/invoices/{self.invoice['id']}/cancel",
            headers=self.admin_headers,
            json={"pin": "9876", "cancellationReason": "Double saisie"},
        )
        self.assertEqual(duplicate.status_code, 400)

    def test_cashier_cannot_cancel_invoice_and_manager_is_shop_scoped(self):
        response = self.client.post(
            f"/api/invoices/{self.invoice['id']}/cancel",
            headers=self.cashier_headers,
            json={"cancellationReason": "Erreur"},
        )
        self.assertEqual(response.status_code, 403)

        denied = self.client.post(
            f"/api/invoices/{self.invoice['id']}/cancel",
            headers=self.manager_headers,
            json={"pin": "1111", "cancellationReason": "Hors salon"},
        )
        self.assertEqual(denied.status_code, 403)

        manager_invoice = create_invoice(self.store, {
            "totalAmount": 2000,
            "paymentMethod": "CASH",
            "items": [{"categoryName": "Coupe", "price": 2000}],
            "createdById": "cashier-h",
            "shopType": "HOMME",
            "stationId": self.station["stationId"],
        })
        allowed = self.client.post(
            f"/api/invoices/{manager_invoice['id']}/cancel",
            headers=self.manager_headers,
            json={"pin": "1111", "cancellationReason": "Annulation du gérant"},
        )
        self.assertEqual(allowed.status_code, 200, allowed.text)
        self.assertEqual(allowed.json()["status"], "CANCELLED")

    def test_manager_cancellation_requires_the_current_managers_pin(self):
        manager_invoice = create_invoice(self.store, {
            "totalAmount": 2000,
            "paymentMethod": "CASH",
            "items": [{"categoryName": "Coupe", "price": 2000}],
            "createdById": "cashier-h",
            "shopType": "HOMME",
            "stationId": self.station["stationId"],
        })
        wrong_pin = self.client.post(
            f"/api/invoices/{manager_invoice['id']}/cancel",
            headers=self.manager_headers,
            json={"pin": "9876", "cancellationReason": "Erreur"},
        )
        self.assertEqual(wrong_pin.status_code, 401)
        self.assertIn("PIN du gérant connecté", wrong_pin.json()["error"])

        missing_pin = self.client.post(
            f"/api/invoices/{manager_invoice['id']}/cancel",
            headers=self.manager_headers,
            json={"cancellationReason": "Erreur"},
        )
        self.assertEqual(missing_pin.status_code, 400)
        self.assertIn("PIN du gérant", missing_pin.json()["error"])

        with self.store._connect() as connection:
            status = connection.execute(
                'SELECT status FROM "Invoice" WHERE id = ?', (manager_invoice["id"],)
            ).fetchone()["status"]
        self.assertEqual(status, "VALIDATED")

    def test_invoice_delete_endpoint_cannot_remove_a_ticket(self):
        deleted = self.client.delete(
            f"/api/invoices/{self.invoice['id']}",
            headers=self.admin_headers,
        )
        self.assertEqual(deleted.status_code, 405)
        with self.store._connect() as connection:
            self.assertIsNotNone(
                connection.execute('SELECT id FROM "Invoice" WHERE id = ?', (self.invoice["id"],)).fetchone()
            )

    def test_cashier_can_see_manager_cancellation_in_selected_period(self):
        manager_invoice = create_invoice(self.store, {
            "totalAmount": 2000,
            "paymentMethod": "CASH",
            "items": [{"categoryName": "Coupe", "price": 2000}],
            "createdById": "cashier-1",
            "shopType": "FEMME",
            "stationId": self.station["stationId"],
        })
        manager_cancelled = self.client.post(
            f"/api/invoices/{manager_invoice['id']}/cancel",
            headers=self.manager_femme_headers,
            json={"pin": "3333", "cancellationReason": "Ticket créé par erreur"},
        )
        self.assertEqual(manager_cancelled.status_code, 200, manager_cancelled.text)
        day = manager_invoice["createdAt"][:10]
        response = self.client.get(
            f"/api/invoices?date={day}&status=CANCELLED&cashierId=admin-1",
            headers=self.cashier_headers,
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([row["id"] for row in response.json()], [manager_invoice["id"]])
        self.assertEqual(response.json()[0]["cancellationReason"], "Ticket créé par erreur")

    def test_invoice_list_requires_authentication_and_cashier_cannot_view_another_cashier(self):
        self.assertEqual(self.client.get("/api/invoices").status_code, 401)
        manager_invoice = create_invoice(self.store, {
            "totalAmount": 2000,
            "paymentMethod": "CASH",
            "items": [{"categoryName": "Coupe", "price": 2000}],
            "createdById": "admin-1",
            "shopType": "FEMME",
            "stationId": self.station["stationId"],
        })
        response = self.client.get(
            "/api/invoices?cashierId=admin-1",
            headers=self.cashier_headers,
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertNotIn(manager_invoice["id"], [row["id"] for row in response.json()])


if __name__ == "__main__":
    unittest.main()