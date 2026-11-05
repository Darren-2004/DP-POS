import os
import sqlite3
import sys
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient

from app.invoices import cancel_invoice, create_invoice
from app.print_jobs import PrintJobStore
from app.reports import dashboard_stats, z_report
from app.schema import ensure_schema
from app.auth import hash_pin


class StockTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "pos.db"
        os.environ["POS_DB_PATH"] = str(self.database_path)
        self.store = PrintJobStore(self.database_path)
        with self._connection() as connection:
            ensure_schema(connection)
            # Create users
            connection.execute(
                'INSERT INTO "User" (id, name, pin, role, shopType) VALUES (?, ?, ?, ?, ?)',
                ("admin-1", "Admin", hash_pin("1234"), "ADMIN", "ALL"),
            )
            connection.execute(
                'INSERT INTO "User" (id, name, pin, role, shopType) VALUES (?, ?, ?, ?, ?)',
                ("cashier-1", "Cashier", hash_pin("0000"), "CASHIER", "FEMME"),
            )
            # Seed products
            connection.execute(
                'INSERT INTO "Product" (id, name, price, category, shopType, stockQty) VALUES (?, ?, ?, ?, ?, ?)',
                ("prod-1", "Mèche Brésilienne", 10000, "Mèches", "FEMME", 10),
            )
            connection.execute(
                'INSERT INTO "Product" (id, name, price, category, shopType, stockQty) VALUES (?, ?, ?, ?, ?, ?)',
                ("prod-2", "Huile de Ricin", 3000, "Produits capillaires", "FEMME", 3),
            )
            connection.execute(
                'INSERT INTO "Product" (id, name, price, category, shopType, stockQty) VALUES (?, ?, ?, ?, ?, ?)',
                ("prod-3", "Gel Fixateur", 2500, "Produits capillaires", "FEMME", 0),
            )

        from app.main import create_app
        self.app = create_app()
        self.app.state.print_store = self.store
        self.client = TestClient(self.app)

    def tearDown(self):
        self.temp_dir.cleanup()
        os.environ.pop("POS_DB_PATH", None)

    @contextmanager
    def _connection(self):
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def test_stock_deduction_on_invoice_creation(self):
        body = {
            "totalAmount": 20000,
            "paymentMethod": "CASH",
            "items": [
                {"categoryName": "Mèche Brésilienne", "price": 10000, "qty": 2, "itemType": "PRODUCT"}
            ],
            "createdById": "cashier-1",
            "shopType": "FEMME",
            "clientName": "Test Client",
        }
        invoice = create_invoice(self.store, body)
        self.assertEqual(invoice["status"], "VALIDATED")

        with self._connection() as connection:
            row = connection.execute('SELECT stockQty FROM "Product" WHERE id = "prod-1"').fetchone()
            # Stock was 10, sold 2 -> 8
            self.assertEqual(row["stockQty"], 8)

    def test_stock_restock_on_invoice_cancellation(self):
        body = {
            "totalAmount": 10000,
            "paymentMethod": "CASH",
            "items": [
                {"categoryName": "Mèche Brésilienne", "price": 10000, "qty": 1, "itemType": "PRODUCT"}
            ],
            "createdById": "cashier-1",
            "shopType": "FEMME",
            "clientName": "Test Client",
        }
        invoice = create_invoice(self.store, body)
        with self._connection() as connection:
            row = connection.execute('SELECT stockQty FROM "Product" WHERE id = "prod-1"').fetchone()
            self.assertEqual(row["stockQty"], 9)

        # Cancel the invoice
        cancel_invoice(
            self.store,
            invoice["id"],
            {"id": "admin-1", "role": "ADMIN"},
            "1234",
            "Erreur de saisie",
        )

        with self._connection() as connection:
            row = connection.execute('SELECT stockQty FROM "Product" WHERE id = "prod-1"').fetchone()
            # Stock restocked back to 10
            self.assertEqual(row["stockQty"], 10)
        day = invoice["createdAt"][:10]
        self.assertEqual(
            dashboard_stats(self.store, {"startDate": day, "endDate": day})["filtered"]["total"],
            0,
        )
        report = z_report(self.store, {"date": day})
        self.assertEqual(report["totalSales"], 0)
        self.assertEqual(report["cancelledCount"], 1)

    def test_product_categories_api(self):
        # Create new category
        res = self.client.post("/api/product-categories", json={"name": "Accessoires Cheveux", "shopType": "ALL"})
        self.assertEqual(res.status_code, 201)
        cat_id = res.json()["id"]

        # List categories
        res = self.client.get("/api/product-categories")
        self.assertEqual(res.status_code, 200)
        names = [c["name"] for c in res.json()]
        self.assertIn("Accessoires Cheveux", names)
        self.assertIn("Mèches", names)

        # Delete category
        with self._connection() as connection:
            connection.execute(
                'UPDATE "Product" SET category = ? WHERE id = ?',
                ("Accessoires Cheveux", "prod-1"),
            )
        res = self.client.delete(f"/api/product-categories/{cat_id}")
        self.assertEqual(res.status_code, 200)
        with self._connection() as connection:
            category = connection.execute(
                'SELECT category FROM "Product" WHERE id = ?', ("prod-1",)
            ).fetchone()
            self.assertEqual(category["category"], "Autre")

    def test_products_api_in_stock_filtering(self):
        # List all products
        res_all = self.client.get("/api/products")
        self.assertEqual(res_all.status_code, 200)
        self.assertEqual(len(res_all.json()), 3)

        # List only in-stock products (used by POS)
        res_in_stock = self.client.get("/api/products?inStockOnly=true")
        self.assertEqual(res_in_stock.status_code, 200)
        items = res_in_stock.json()
        # Gel Fixateur has stockQty = 0, so it should not appear
        self.assertEqual(len(items), 2)
        item_names = [it["name"] for it in items]
        self.assertIn("Mèche Brésilienne", item_names)
        self.assertIn("Huile de Ricin", item_names)
        self.assertNotIn("Gel Fixateur", item_names)

    def test_stock_stats_and_alerts(self):
        # Verify stats endpoint
        res = self.client.get("/api/stock/stats")
        self.assertEqual(res.status_code, 200)
        stats = res.json()

        # Total value: (10 * 10000) + (3 * 3000) + (0 * 2500) = 100000 + 9000 = 109000
        self.assertEqual(stats["totalStockValue"], 109000.0)
        # Total qty: 10 + 3 + 0 = 13
        self.assertEqual(stats["totalStockQuantity"], 13)

        # Alerts
        alerts = stats["alerts"]
        self.assertTrue(alerts["enabled"])
        self.assertEqual(alerts["outOfStockCount"], 1)  # Gel Fixateur (0)
        self.assertEqual(alerts["lowStockCount"], 1)   # Huile de Ricin (3 < 5)

        # Test toggle alert
        res_toggle = self.client.put("/api/stock/alerts-toggle", json={"enabled": False})
        self.assertEqual(res_toggle.status_code, 200)
        self.assertFalse(res_toggle.json()["enabled"])

        # Re-check stats reflects disabled
        res_after = self.client.get("/api/stock/stats")
        self.assertFalse(res_after.json()["alerts"]["enabled"])


if __name__ == "__main__":
    unittest.main()
