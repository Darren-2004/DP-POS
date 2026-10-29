import sqlite3
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path

from app.print_jobs import PrintJobStore
from app.reports import dashboard_stats, payment_method_breakdown, product_sales_report, z_report


class ReportParityTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "pos.db"
        self._create_tables()
        self.store = PrintJobStore(self.database_path)
        self._seed()

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
                CREATE TABLE "User" (id TEXT PRIMARY KEY, name TEXT);
                CREATE TABLE "Invoice" (
                    id TEXT PRIMARY KEY, invoiceNumber TEXT, totalAmount REAL, paymentMethod TEXT,
                    clientName TEXT, clientPhone TEXT, isReservation INTEGER, reservationNo TEXT,
                    isDelivery INTEGER, deliveryNo TEXT, deliveryAddress TEXT, deliveryStatus TEXT,
                    deliveredAt TEXT, deliveryFee REAL, deliveryPerson TEXT, isPaid INTEGER,
                    paidAt TEXT, status TEXT, cancellationReason TEXT, createdAt TEXT,
                    createdById TEXT, cancelledById TEXT, shopType TEXT DEFAULT 'HOMME'
                );
                CREATE TABLE "InvoiceItem" (
                    id TEXT PRIMARY KEY, invoiceId TEXT, categoryName TEXT, price REAL
                );
                CREATE TABLE "Reservation" (
                    id TEXT PRIMARY KEY, status TEXT, shopType TEXT DEFAULT 'HOMME'
                );
                CREATE TABLE "ReservationPayment" (
                    id TEXT PRIMARY KEY, reservationId TEXT, amount REAL, paymentMethod TEXT,
                    installmentNumber INTEGER, createdAt TEXT, createdById TEXT
                );
                """
            )

    def _seed(self):
        created_at = "2026-10-04T12:00:00.000Z"
        rows = [
            ("direct", "FAC-1", 1000, "CASH", 0, None, 0, None, 0, "VALIDATED"),
            ("paid-delivery", "LIV-1", 800, "ONLINE", 0, None, 1, "DELIVERED", 1, "VALIDATED"),
            ("unpaid-delivery", "LIV-2", 500, "CASH", 0, None, 1, "PENDING", 0, "VALIDATED"),
            ("reservation-invoice", "FAC-RES-1", 300, "CASH", 1, "RES-1", 0, None, 0, "VALIDATED"),
            ("cancelled", "FAC-2", 200, "CASH", 0, None, 0, None, 0, "CANCELLED"),
        ]
        with self._connection() as connection:
            connection.execute('INSERT INTO "User" (id, name) VALUES (?, ?)', ("cashier-1", "Amina"))
            connection.execute('INSERT INTO "Reservation" (id, status) VALUES (?, ?)', ("res-1", "PENDING"))
            for invoice_id, number, amount, method, is_reservation, reservation_no, is_delivery, delivery_status, is_paid, status in rows:
                fee = 100 if invoice_id == "paid-delivery" else 0
                connection.execute(
                    '''INSERT INTO "Invoice" (
                        id, invoiceNumber, totalAmount, paymentMethod, isReservation, reservationNo,
                        isDelivery, deliveryNo, deliveryStatus, deliveryFee, isPaid, status,
                        createdAt, createdById
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'cashier-1')''',
                    (
                        invoice_id, number, amount, method, is_reservation, reservation_no,
                        is_delivery, number if is_delivery else None, delivery_status, fee, is_paid, status, created_at,
                    ),
                )
                connection.execute(
                    'INSERT INTO "InvoiceItem" (id, invoiceId, categoryName, price) VALUES (?, ?, ?, ?)',
                    (f"item-{invoice_id}", invoice_id, invoice_id, amount),
                )
            connection.execute(
                '''INSERT INTO "ReservationPayment" (
                    id, reservationId, amount, paymentMethod, installmentNumber, createdAt, createdById
                ) VALUES (?, ?, ?, ?, ?, ?, ?)''',
                ("payment-1", "res-1", 150, "ORANGE_MONEY", 1, created_at, "cashier-1"),
            )

    def test_dashboard_totals_distinguish_paid_delivery_and_reservation_deposit(self):
        stats = dashboard_stats(self.store, {
            "startDate": "2026-10-04",
            "endDate": "2026-10-04",
            "cashierId": "cashier-1",
        })["filtered"]

        self.assertEqual(stats["count"], 2)
        self.assertEqual(stats["total"], 2050)
        self.assertEqual(stats["cash"], 1000)
        self.assertEqual(stats["online"], 900)
        self.assertEqual(stats["orangeMoney"], 150)
        self.assertEqual(stats["deliveryFeesTotal"], 100)
        self.assertEqual(stats["reservationTotal"], 150)
        self.assertEqual(sum(category["revenue"] for category in dashboard_stats(self.store, {
            "startDate": "2026-10-04",
            "endDate": "2026-10-04",
            "cashierId": "cashier-1",
        })["topSelling"]), 2600)

    def test_z_report_preserves_legacy_invoice_count_and_exclusions(self):
        report = z_report(self.store, {"date": "2026-10-04", "cashierId": "cashier-1"})

        self.assertEqual(report["count"], 4)
        self.assertEqual(report["cancelledCount"], 1)
        self.assertEqual(report["totalSales"], 1950)
        self.assertEqual(report["payments"], {"CASH": 1000, "ONLINE": 800, "ORANGE_MONEY": 150})

    def test_product_report_includes_final_reservation_and_paid_delivery_items(self):
        report = product_sales_report(self.store, {
            "startDate": "2026-10-04",
            "endDate": "2026-10-04",
        })

        self.assertEqual(report["grandTotal"], 2100)
        self.assertEqual(report["totalQuantity"], 3)
        self.assertEqual({product["name"] for product in report["products"]}, {
            "direct", "paid-delivery", "reservation-invoice"
        })

    def test_payment_method_aliases(self):
        result = payment_method_breakdown("MULTIPLE:CASH=10;MOMO=20;OM=30", 60)
        self.assertEqual(result, {"CASH": 10, "ONLINE": 20, "ORANGE_MONEY": 30})

    def test_dashboard_and_reports_filter_by_shop(self):
        shop_two_stats = dashboard_stats(self.store, {
            "startDate": "2026-10-04",
            "endDate": "2026-10-04",
            "shopType": "FEMME",
        })
        self.assertEqual(shop_two_stats["filtered"]["total"], 0)
        self.assertEqual(shop_two_stats["topSelling"], [])

        shop_two_z_report = z_report(self.store, {
            "date": "2026-10-04",
            "shopType": "FEMME",
        })
        self.assertEqual(shop_two_z_report["totalSales"], 0)
        self.assertEqual(shop_two_z_report["count"], 0)

        shop_two_sales = product_sales_report(self.store, {
            "startDate": "2026-10-04",
            "endDate": "2026-10-04",
            "shopType": "FEMME",
        })
        self.assertEqual(shop_two_sales["grandTotal"], 0)
        self.assertEqual(shop_two_sales["products"], [])

if __name__ == "__main__":
    unittest.main()