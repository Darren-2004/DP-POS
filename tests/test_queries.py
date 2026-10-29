import sqlite3
import tempfile
import unittest
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from app.print_jobs import PrintJobStore
from app.queries import client_stats, list_clients, list_invoices


class ReadQueryTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "pos.db"
        self._create_tables()
        self.store = PrintJobStore(self.database_path)
        self._seed_data()

    def tearDown(self):
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
                CREATE TABLE "User" (id TEXT PRIMARY KEY, name TEXT NOT NULL);
                CREATE TABLE "Client" (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, createdAt TEXT, updatedAt TEXT
                );
                CREATE TABLE "Invoice" (
                    id TEXT PRIMARY KEY, invoiceNumber TEXT, totalAmount REAL, paymentMethod TEXT,
                    clientName TEXT, clientPhone TEXT, isReservation INTEGER, isDelivery INTEGER,
                    deliveryNo TEXT, deliveryAddress TEXT, deliveryStatus TEXT, deliveryPerson TEXT,
                    deliveryFee REAL, isPaid INTEGER, status TEXT, createdAt TEXT,
                    createdById TEXT, cancelledById TEXT
                );
                CREATE TABLE "InvoiceItem" (
                    id TEXT PRIMARY KEY, invoiceId TEXT, categoryName TEXT, price REAL
                );
                CREATE TABLE "Reservation" (
                    id TEXT PRIMARY KEY, clientName TEXT, status TEXT, totalAmount REAL, createdAt TEXT
                );
                CREATE TABLE "ReservationPayment" (
                    id TEXT PRIMARY KEY, reservationId TEXT, amount REAL
                );
                """
            )

    def _seed_data(self):
        now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        with self._connection() as connection:
            connection.execute('INSERT INTO "User" (id, name) VALUES (?, ?)', ("cashier-1", "Amina"))
            connection.execute(
                'INSERT INTO "Client" (id, name, phone, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
                ("client-1", "Ada Ngu", "555-0123", now, now),
            )
            invoices = [
                ("sale-1", "FAC-0001", 1200, "Ada Ngu", 0, None, 0, "VALIDATED"),
                ("delivery-1", "LIV-0001", 800, "Ada Ngu", 1, "PENDING", 0, "VALIDATED"),
                ("delivery-2", "LIV-0002", 900, "Ada Ngu", 1, "DELIVERED", 0, "VALIDATED"),
                ("cancelled-1", "FAC-0002", 500, "Ada Ngu", 0, None, 0, "CANCELLED"),
            ]
            for invoice_id, number, total, client, is_delivery, delivery_status, is_paid, status in invoices:
                connection.execute(
                    """INSERT INTO "Invoice" (
                        id, invoiceNumber, totalAmount, paymentMethod, clientName, isReservation,
                        isDelivery, deliveryStatus, deliveryFee, isPaid, status, createdAt,
                        createdById, cancelledById
                    ) VALUES (?, ?, ?, 'CASH', ?, 0, ?, ?, 0, ?, ?, ?, 'cashier-1', NULL)""",
                    (invoice_id, number, total, client, is_delivery, delivery_status, is_paid, status, now),
                )
            connection.execute(
                'INSERT INTO "InvoiceItem" (id, invoiceId, categoryName, price) VALUES (?, ?, ?, ?)',
                ("item-1", "sale-1", "Chemise", 1200),
            )
            connection.execute(
                'INSERT INTO "Reservation" (id, clientName, status, totalAmount, createdAt) VALUES (?, ?, ?, ?, ?)',
                ("reservation-1", "Ada Ngu", "PENDING", 3000, now),
            )
            connection.execute(
                'INSERT INTO "ReservationPayment" (id, reservationId, amount) VALUES (?, ?, ?)',
                ("payment-1", "reservation-1", 700),
            )

    def test_client_search_and_stats_include_pending_deposits(self):
        self.assertEqual([client["id"] for client in list_clients(self.store, "555")], ["client-1"])
        stats = client_stats(self.store, "Ada Ngu")[0]

        self.assertEqual(stats["invoiceCount"], 3)
        self.assertEqual(stats["reservationCount"], 1)
        self.assertEqual(stats["totalSpent"], 3600)
        self.assertIsNotNone(stats["lastPurchaseAt"])

    def test_invoice_list_preserves_nested_records_and_delivery_filter(self):
        invoices = list_invoices(self.store, {})

        by_id = {invoice["id"]: invoice for invoice in invoices}
        self.assertEqual(set(by_id), {"sale-1", "delivery-2", "cancelled-1"})
        self.assertEqual(by_id["sale-1"]["createdBy"], {"name": "Amina"})
        self.assertEqual(by_id["sale-1"]["items"][0]["categoryName"], "Chemise")
        self.assertIsInstance(by_id["sale-1"]["isDelivery"], bool)

    def test_include_all_deliveries_and_status_filters(self):
        invoices = list_invoices(self.store, {"includeAllDeliveries": "true", "status": "VALIDATED"})

        self.assertEqual({invoice["id"] for invoice in invoices}, {"sale-1", "delivery-1", "delivery-2"})

    def test_local_date_filter_includes_current_local_day(self):
        day = datetime.now().astimezone().strftime("%Y-%m-%d")
        invoices = list_invoices(self.store, {"date": day, "includeAllDeliveries": "true"})

        self.assertEqual(len(invoices), 4)

    def test_paginated_invoice_list_returns_page_and_total_metadata(self):
        first_page = list_invoices(self.store, {
            "includeAllDeliveries": "true",
            "page": "1",
            "pageSize": "2",
        })
        second_page = list_invoices(self.store, {
            "includeAllDeliveries": "true",
            "page": "2",
            "pageSize": "2",
        })

        self.assertEqual(first_page["total"], 4)
        self.assertEqual(first_page["page"], 1)
        self.assertEqual(first_page["pageSize"], 2)
        self.assertEqual(first_page["totalPages"], 2)
        self.assertEqual(len(first_page["items"]), 2)
        self.assertEqual(len(second_page["items"]), 2)
        self.assertFalse(
            {invoice["id"] for invoice in first_page["items"]}
            & {invoice["id"] for invoice in second_page["items"]}
        )

    def test_paginated_invoice_list_preserves_filters_and_legacy_response(self):
        page = list_invoices(self.store, {
            "status": "VALIDATED",
            "cashierId": "cashier-1",
            "page": "1",
            "pageSize": "1",
        })
        self.assertEqual(page["total"], 2)
        self.assertEqual(len(page["items"]), 1)
        self.assertIsInstance(list_invoices(self.store, {}), list)


if __name__ == "__main__":
    unittest.main()