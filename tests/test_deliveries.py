import sqlite3
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path

from fastapi.testclient import TestClient

from app.deliveries import list_deliveries, list_delivery_persons, update_deliveries_bulk, update_delivery
from app.main import create_app
from app.print_jobs import PrintJobStore


class DeliveryWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "pos.db"
        self._create_tables()
        self.store = PrintJobStore(self.database_path)
        self._seed()
        self.client = TestClient(create_app(self.store))

    def tearDown(self):
        self.client.close()
        self.temp_dir.cleanup()

    @contextmanager
    def _connection(self):
        connection = sqlite3.connect(self.database_path)
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _create_tables(self):
        with self._connection() as connection:
            connection.executescript(
                """
                CREATE TABLE "User" (id TEXT PRIMARY KEY, name TEXT);
                CREATE TABLE "Client" (
                    id TEXT PRIMARY KEY, name TEXT UNIQUE, phone TEXT, createdAt TEXT, updatedAt TEXT
                );
                CREATE TABLE "DeliveryPerson" (
                    id TEXT PRIMARY KEY, name TEXT UNIQUE, phone TEXT, createdAt TEXT, updatedAt TEXT
                );
                CREATE TABLE "Invoice" (
                    id TEXT PRIMARY KEY, invoiceNumber TEXT, totalAmount REAL, paymentMethod TEXT,
                    clientName TEXT, clientPhone TEXT, isReservation INTEGER DEFAULT 0, reservationNo TEXT,
                    isDelivery INTEGER DEFAULT 0, deliveryNo TEXT, deliveryAddress TEXT, deliveryStatus TEXT,
                    deliveredAt TEXT, deliveryFee REAL DEFAULT 0, deliveryPerson TEXT, isPaid INTEGER DEFAULT 0,
                    paidAt TEXT, status TEXT DEFAULT 'VALIDATED', cancellationReason TEXT,
                    createdAt TEXT, createdById TEXT, cancelledById TEXT
                );
                CREATE TABLE "InvoiceItem" (
                    id TEXT PRIMARY KEY, invoiceId TEXT, categoryName TEXT, price REAL
                );
                """
            )

    def _seed(self):
        with self._connection() as connection:
            connection.execute('INSERT INTO "User" (id, name) VALUES (?, ?)', ("cashier-1", "Amina"))
            rows = [
                ("delivery-1", "LIV-1", "PENDING", 1, "Ada", "cashier-1"),
                ("delivery-2", "LIV-2", "DELIVERED", 1, "Bako", "cashier-1"),
                ("sale-1", "FAC-1", None, 0, "Ada", "cashier-1"),
            ]
            for invoice_id, number, status, is_delivery, client, cashier in rows:
                connection.execute(
                    '''INSERT INTO "Invoice" (
                        id, invoiceNumber, totalAmount, paymentMethod, clientName, isDelivery,
                        deliveryNo, deliveryStatus, deliveryFee, isPaid, status, createdAt,
                        createdById
                    ) VALUES (?, ?, 1000, 'CASH', ?, ?, ?, ?, 0, 0, 'VALIDATED',
                              '2026-10-04T10:00:00.000Z', ?)''',
                    (invoice_id, number, client, is_delivery, number if is_delivery else None, status, cashier),
                )
            connection.execute(
                'INSERT INTO "InvoiceItem" (id, invoiceId, categoryName, price) VALUES (?, ?, ?, ?)',
                ("item-1", "delivery-1", "Chemise", 1000),
            )

    def test_delivery_filters_and_nested_response(self):
        deliveries = list_deliveries(self.store, {"status": "PENDING", "q": "Ada"})

        self.assertEqual([delivery["id"] for delivery in deliveries], ["delivery-1"])
        self.assertEqual(deliveries[0]["createdBy"], {"id": "cashier-1", "name": "Amina"})
        self.assertEqual(deliveries[0]["items"][0]["categoryName"], "Chemise")

    def test_assign_driver_only_preserves_status(self):
        result = update_delivery(self.store, "delivery-1", {
            "action": "ASSIGN_DRIVER_ONLY",
            "deliveryPerson": "  Jules  ",
        })

        self.assertEqual(result["deliveryStatus"], "PENDING")
        self.assertEqual(result["deliveryPerson"], "Jules")
        self.assertEqual([person["name"] for person in list_delivery_persons(self.store)], ["Jules"])

    def test_delivered_marks_paid_and_updates_payment_method(self):
        result = update_delivery(self.store, "delivery-1", {
            "status": "DELIVERED",
            "deliveryPerson": "Jules",
            "paymentMethod": "ONLINE",
        })

        self.assertEqual(result["deliveryStatus"], "DELIVERED")
        self.assertTrue(result["isPaid"])
        self.assertIsNotNone(result["paidAt"])
        self.assertIsNotNone(result["deliveredAt"])
        self.assertEqual(result["paymentMethod"], "ONLINE")

    def test_bulk_update_only_mutates_deliveries_but_returns_all_requested(self):
        result = update_deliveries_bulk(self.store, {
            "ids": ["delivery-1", "sale-1"],
            "status": "IN_DELIVERY",
        })
        by_id = {delivery["id"]: delivery for delivery in result["deliveries"]}

        self.assertEqual(result["message"], "2 livraison(s) mise(s) à jour")
        self.assertEqual(by_id["delivery-1"]["deliveryStatus"], "IN_DELIVERY")
        self.assertIsNone(by_id["sale-1"]["deliveryStatus"])

    def test_invalid_delivery_status_returns_400(self):
        response = self.client.put(
            "/api/deliveries/delivery-1/status",
            json={"status": "SHIPPED"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "Statut de livraison invalide")


if __name__ == "__main__":
    unittest.main()