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
                'INSERT INTO "User" (id, name, pin, role, permissions, needsPinReset) VALUES (?, ?, ?, ?, ?, 0)',
                [
                    ("cashier-1", "Cashier", hash_pin("1234"), "CASHIER", "ALL"),
                    ("admin-1", "Admin", hash_pin("9876"), "ADMIN", "ALL"),
                ],
            )
        self.client = TestClient(create_app(self.store))
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
                    role TEXT NOT NULL, permissions TEXT, needsPinReset INTEGER
                );
                CREATE TABLE "Invoice" (
                    id TEXT PRIMARY KEY, invoiceNumber TEXT UNIQUE, totalAmount REAL, paymentMethod TEXT,
                    clientName TEXT, clientPhone TEXT, isReservation INTEGER DEFAULT 0, reservationNo TEXT,
                    isDelivery INTEGER DEFAULT 0, deliveryNo TEXT, deliveryAddress TEXT, deliveryStatus TEXT,
                    deliveredAt TEXT, deliveryFee REAL DEFAULT 0, deliveryPerson TEXT, isPaid INTEGER DEFAULT 0,
                    paidAt TEXT, status TEXT DEFAULT 'VALIDATED', cancellationReason TEXT,
                    createdAt TEXT, createdById TEXT, cancelledById TEXT
                );
                CREATE TABLE "InvoiceItem" (
                    id TEXT PRIMARY KEY, invoiceId TEXT, categoryName TEXT, price REAL
                );
                CREATE TABLE "Client" (
                    id TEXT PRIMARY KEY, name TEXT UNIQUE, phone TEXT, createdAt TEXT, updatedAt TEXT
                );
                """
            )

    def test_admin_can_cancel_invoice_and_second_cancel_is_rejected(self):
        response = self.client.post(
            f"/api/invoices/{self.invoice['id']}/cancel",
            json={"adminId": "admin-1", "adminPin": "9876", "cancellationReason": "Erreur de saisie"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "CANCELLED")
        self.assertEqual(response.json()["cancelledBy"]["name"], "Admin")
        duplicate = self.client.post(
            f"/api/invoices/{self.invoice['id']}/cancel",
            json={"adminId": "admin-1", "adminPin": "9876", "cancellationReason": "Double saisie"},
        )
        self.assertEqual(duplicate.status_code, 400)

    def test_cancel_requires_admin_role_and_valid_pin(self):
        response = self.client.post(
            f"/api/invoices/{self.invoice['id']}/cancel",
            json={"adminId": "cashier-1", "adminPin": "1234", "cancellationReason": "Erreur"},
        )
        self.assertEqual(response.status_code, 403)

    def test_delete_requires_pin_and_removes_invoice(self):
        missing_pin = self.client.delete(f"/api/invoices/{self.invoice['id']}")
        self.assertEqual(missing_pin.status_code, 400)

        deleted = self.client.delete(
            f"/api/invoices/{self.invoice['id']}",
            headers={"x-admin-id": "admin-1", "x-admin-pin": "9876"},
        )
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(deleted.json()["message"], "Facture supprimée avec succès")

    def test_cashier_pin_cannot_delete_invoice(self):
        response = self.client.delete(
            f"/api/invoices/{self.invoice['id']}",
            headers={"x-admin-id": "cashier-1", "x-admin-pin": "1234"},
        )
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()