import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.print_jobs import PrintJobStore
from app.reservations import (
    ReservationError,
    add_reservation_payment,
    cancel_reservation,
    create_reservation,
    create_reservation_invoice,
    delete_reservation,
    list_reservations,
    reservation_payments,
)


class ReservationWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "pos.db"
        self._create_tables()
        self.store = PrintJobStore(self.database_path)
        self.station = self.store.create_station("Cashier 1")
        with self._connection() as connection:
            connection.execute(
                'INSERT INTO "User" (id, name, pin, role) VALUES (?, ?, ?, ?)',
                ("cashier-1", "Amina", "hash", "CASHIER"),
            )
        self.reservation = create_reservation(self.store, {
            "clientName": "Ada Ngu",
            "clientPhone": "555-0123",
            "totalAmount": 3000,
            "createdById": "cashier-1",
            "stationId": self.station["stationId"],
            "items": [{"categoryName": "Chemise", "price": 1000, "qty": 3}],
            "initialPayment": {"amount": 1000, "paymentMethod": "CASH"},
        })

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
                CREATE TABLE "User" (
                    id TEXT PRIMARY KEY, name TEXT, pin TEXT, role TEXT
                );
                CREATE TABLE "Client" (
                    id TEXT PRIMARY KEY, name TEXT UNIQUE, phone TEXT, createdAt TEXT, updatedAt TEXT
                );
                CREATE TABLE "Reservation" (
                    id TEXT PRIMARY KEY, reservationNo TEXT UNIQUE, clientName TEXT, clientPhone TEXT,
                    totalAmount REAL, status TEXT, createdAt TEXT, createdById TEXT,
                    updatedAt TEXT, updatedById TEXT
                );
                CREATE TABLE "ReservationItem" (
                    id TEXT PRIMARY KEY, reservationId TEXT, categoryName TEXT, price REAL, qty INTEGER
                );
                CREATE TABLE "ReservationPayment" (
                    id TEXT PRIMARY KEY, reservationId TEXT, amount REAL, paymentMethod TEXT,
                    installmentNumber INTEGER, createdAt TEXT, createdById TEXT
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
                """
            )

    def test_initial_payment_and_installments_update_balance(self):
        self.assertEqual(self.reservation["totalPaid"], 1000)
        self.assertEqual(self.reservation["remainingBalance"], 2000)
        self.assertEqual(self.reservation["payments"][0]["createdBy"]["name"], "Amina")
        self.assertEqual(self.reservation["printJob"]["status"], "queued")

        second = add_reservation_payment(self.store, self.reservation["id"], {
            "amount": 1000,
            "createdById": "cashier-1",
            "stationId": self.station["stationId"],
        })
        final = add_reservation_payment(self.store, self.reservation["id"], {
            "amount": 1000,
            "createdById": "cashier-1",
        })

        self.assertEqual(second["remainingBalance"], 1000)
        self.assertEqual(second["printJob"]["status"], "queued")
        self.assertEqual(final["status"], "COMPLETED")
        self.assertEqual(final["remainingBalance"], 0)
        with self.assertRaises(ReservationError):
            add_reservation_payment(self.store, self.reservation["id"], {"amount": 1, "createdById": "cashier-1"})

    def test_payment_cannot_exceed_balance(self):
        with self.assertRaises(ReservationError):
            add_reservation_payment(self.store, self.reservation["id"], {
                "amount": 2000.02,
                "createdById": "cashier-1",
            })
        self.assertEqual(len(list_reservations(self.store, {})[0]["payments"]), 1)

    def test_simultaneous_payments_cannot_overpay(self):
        def pay(amount):
            try:
                return add_reservation_payment(self.store, self.reservation["id"], {
                    "amount": amount,
                    "createdById": "cashier-1",
                })
            except ReservationError:
                return None

        with ThreadPoolExecutor(max_workers=2) as executor:
            outcomes = list(executor.map(pay, [1200, 1200]))

        self.assertEqual(sum(outcome is not None for outcome in outcomes), 1)
        reservation = list_reservations(self.store, {})[0]
        self.assertEqual(reservation["totalPaid"], 2200)

    def test_list_filters_and_payment_history_response(self):
        filtered = list_reservations(self.store, {"q": "555-0123", "status": "PENDING"})
        history = reservation_payments(self.store, {"cashierId": "cashier-1"})

        self.assertEqual(filtered[0]["id"], self.reservation["id"])
        self.assertEqual(history[0]["reservation"]["reservationNo"], self.reservation["reservationNo"])
        self.assertEqual(history[0]["createdBy"]["name"], "Amina")

    def test_final_invoice_is_idempotent_and_contains_payment_history(self):
        first = create_reservation_invoice(
            self.store, self.reservation["id"], station_id=self.station["stationId"]
        )
        second = create_reservation_invoice(self.store, self.reservation["id"])

        self.assertEqual(first["id"], second["id"])
        self.assertEqual(first["sourceReservationNo"], self.reservation["reservationNo"])
        self.assertEqual(first["reservationPayments"][0]["amount"], 1000)
        self.assertEqual(first["items"][0]["categoryName"], "Chemise")
        self.assertEqual(first["printJob"]["status"], "queued")

    def test_http_create_reservation_returns_its_station_print_job(self):
        with TestClient(create_app(self.store)) as client:
            response = client.post("/api/reservations", json={
                "clientName": "New Client",
                "totalAmount": 500,
                "createdById": "cashier-1",
                "stationId": self.station["stationId"],
                "items": [{"categoryName": "Pantalon", "price": 500, "qty": 1}],
                "initialPayment": {"amount": 200, "paymentMethod": "CASH"},
            })

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["printJob"]["stationId"], self.station["stationId"])
        self.assertEqual(response.json()["remainingBalance"], 300)

    def test_unknown_station_rolls_back_reservation_related_writes(self):
        with self.assertRaises(ReservationError):
            create_reservation(self.store, {
                "clientName": "Invalid Station",
                "totalAmount": 500,
                "createdById": "cashier-1",
                "stationId": "not-a-station",
                "items": [{"categoryName": "Pantalon", "price": 500, "qty": 1}],
            })
        with self.assertRaises(ReservationError):
            add_reservation_payment(self.store, self.reservation["id"], {
                "amount": 500,
                "createdById": "cashier-1",
                "stationId": "not-a-station",
            })
        with self.assertRaises(ReservationError):
            create_reservation_invoice(
                self.store,
                self.reservation["id"],
                station_id="not-a-station",
            )

        with self._connection() as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM "Reservation"').fetchone()[0], 1)
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM "ReservationPayment"').fetchone()[0], 1)
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM "Invoice"').fetchone()[0], 0)

    def test_cancel_and_delete_reservation(self):
        cancelled = cancel_reservation(self.store, self.reservation["id"])
        self.assertEqual(cancelled["status"], "CANCELLED")
        deleted = delete_reservation(self.store, self.reservation["id"])
        self.assertTrue(deleted["success"])
        self.assertEqual(list_reservations(self.store, {}), [])


if __name__ == "__main__":
    unittest.main()