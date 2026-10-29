import sqlite3
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path

from app.invoices import InvoiceError, create_invoice
from app.print_jobs import PrintJobStore


class InvoicePrintOutboxTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "pos.db"
        self._create_legacy_tables()
        self.store = PrintJobStore(self.database_path)
        self.station = self.store.create_station("Cashier 1")
        with self._connection() as connection:
            connection.execute('INSERT INTO "User" (id, name) VALUES (?, ?)', ("user-1", "Cashier"))

    def tearDown(self):
        self.temp_dir.cleanup()

    def _create_legacy_tables(self):
        with self._connection() as connection:
            connection.executescript(
                """
                CREATE TABLE "User" (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
                CREATE TABLE "Invoice" (
                    id TEXT PRIMARY KEY, invoiceNumber TEXT NOT NULL UNIQUE, totalAmount REAL NOT NULL,
                    paymentMethod TEXT NOT NULL, clientName TEXT, clientPhone TEXT,
                    isReservation INTEGER NOT NULL DEFAULT 0, reservationNo TEXT,
                    isDelivery INTEGER NOT NULL DEFAULT 0, deliveryNo TEXT, deliveryAddress TEXT,
                    deliveryStatus TEXT, deliveredAt TEXT, deliveryFee REAL DEFAULT 0,
                    isPaid INTEGER NOT NULL DEFAULT 0, paidAt TEXT, status TEXT NOT NULL DEFAULT 'VALIDATED',
                    cancellationReason TEXT, createdAt TEXT NOT NULL, createdById TEXT NOT NULL,
                    cancelledById TEXT
                );
                CREATE TABLE "InvoiceItem" (
                    id TEXT PRIMARY KEY, invoiceId TEXT NOT NULL, categoryName TEXT NOT NULL, price REAL NOT NULL
                );
                CREATE TABLE "Client" (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, phone TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
                );
                """
            )

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

    def _sale_body(self, station_id):
        return {
            "totalAmount": 1500,
            "paymentMethod": "CASH",
            "items": [{"categoryName": "Chemise", "price": 1500}],
            "createdById": "user-1",
            "clientName": "Client de passage",
            "stationId": station_id,
        }

    def test_invoice_and_print_job_are_committed_together(self):
        invoice = create_invoice(self.store, self._sale_body(self.station["stationId"]))

        self.assertEqual(invoice["printJob"]["status"], "queued")
        self.assertEqual(invoice["createdBy"], {"name": "Cashier"})
        self.assertEqual(len(invoice["items"]), 1)
        self.assertEqual(self.store.claim_next(self.station["stationId"])["payload"]["invoiceData"]["id"], invoice["id"])

    def test_invalid_station_rolls_back_invoice_and_items(self):
        with self.assertRaises(InvoiceError):
            create_invoice(self.store, self._sale_body("not-a-station"))

        with self._connection() as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM "Invoice"').fetchone()[0], 0)
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM "InvoiceItem"').fetchone()[0], 0)
        self.assertIsNone(self.store.claim_next(self.station["stationId"]))


if __name__ == "__main__":
    unittest.main()