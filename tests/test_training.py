import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from app.auth import hash_pin
from app.main import create_app
from app.print_agent import render_escpos_receipt
from app.print_jobs import PrintJobStore
from app.reports import dashboard_stats, z_report
from app.schema import ensure_schema


class TrainingWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = PrintJobStore(Path(self.temp_dir.name) / "pos.db")
        with self.store._connect() as connection:
            ensure_schema(connection)
            for user_id, name, pin, role, shop in (
                ("admin", "Admin", "1234", "ADMIN", "ALL"),
                ("manager-h", "Manager Homme", "1111", "MANAGER", "HOMME"),
                ("manager-f", "Manager Femme", "2222", "MANAGER", "FEMME"),
                ("cashier-h", "Cashier Homme", "3333", "CASHIER", "HOMME"),
            ):
                connection.execute(
                    '''INSERT INTO "User" (
                           id, name, pin, role, permissions, needsPinReset, shopType
                       ) VALUES (?, ?, ?, ?, 'ALL', 0, ?)''',
                    (user_id, name, hash_pin(pin), role, shop),
                )
        self.client = TestClient(create_app(self.store))
        self.admin_headers = self._login("admin", "1234")
        self.manager_headers = self._login("manager-h", "1111")
        self.other_manager_headers = self._login("manager-f", "2222")
        self.cashier_headers = self._login("cashier-h", "3333")

    def tearDown(self):
        self.client.close()
        self.temp_dir.cleanup()

    def _login(self, user_id, pin):
        response = self.client.post("/api/auth/login", json={"userId": user_id, "pin": pin})
        self.assertEqual(response.status_code, 200)
        return {"Authorization": f"Bearer {response.json()['accessToken']}"}

    def _course(self, name="Coiffure professionnelle", price=30000):
        response = self.client.post(
            "/api/training/courses",
            headers=self.admin_headers,
            json={"name": name, "price": price, "duration": "3 mois"},
        )
        self.assertEqual(response.status_code, 201)
        return response.json()

    def _enrollment(self, course, **overrides):
        body = {
            "studentName": "Awa Diop",
            "studentPhone": "770000000",
            "courseId": course["id"],
            "initialAmount": 5000,
            "paymentMethod": "CASH",
            "requestKey": "enrollment-request-1",
        }
        body.update(overrides)
        response = self.client.post(
            "/api/training/enrollments", headers=self.manager_headers, json=body
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_admin_manages_catalog_and_manager_enrolls_only_in_assigned_shop(self):
        self.assertEqual(
            self.client.post(
                "/api/training/courses",
                headers=self.manager_headers,
                json={"name": "Unauthorized", "price": 1000},
            ).status_code,
            403,
        )
        course = self._course()
        enrollment = self._enrollment(course)

        self.assertEqual(enrollment["shopType"], "HOMME")
        self.assertEqual(enrollment["coursePrice"], 30000)
        self.assertEqual(enrollment["payments"][0]["installmentNumber"], 1)
        self.assertEqual(enrollment["payments"][0]["totalPaidAfter"], 5000)
        self.assertEqual(
            self.client.get(
                "/api/training/enrollments", headers=self.other_manager_headers
            ).json(),
            [],
        )
        self.assertEqual(
            self.client.get(
                "/api/training/enrollments?shopType=FEMME", headers=self.manager_headers
            ).status_code,
            403,
        )

    def test_price_snapshot_installments_idempotency_voiding_and_audit(self):
        course = self._course()
        enrollment = self._enrollment(course)
        duplicate = self._enrollment(course)
        self.assertEqual(duplicate["id"], enrollment["id"])
        self.assertEqual(len(duplicate["payments"]), 1)

        updated_course = self.client.put(
            f"/api/training/courses/{course['id']}",
            headers=self.admin_headers,
            json={"price": 40000},
        )
        self.assertEqual(updated_course.status_code, 200)
        payment_response = self.client.post(
            f"/api/training/enrollments/{enrollment['id']}/payments",
            headers=self.manager_headers,
            json={
                "amount": 10000,
                "paymentMethod": "ONLINE",
                "requestKey": "payment-request-2",
            },
        )
        self.assertEqual(payment_response.status_code, 201, payment_response.text)
        payment_result = payment_response.json()
        self.assertEqual(payment_result["coursePrice"], 30000)
        self.assertEqual(payment_result["remaining"], 15000)
        self.assertEqual(payment_result["recordedPayment"]["installmentNumber"], 2)

        duplicate_payment = self.client.post(
            f"/api/training/enrollments/{enrollment['id']}/payments",
            headers=self.manager_headers,
            json={
                "amount": 10000,
                "paymentMethod": "ONLINE",
                "requestKey": "payment-request-2",
            },
        )
        self.assertTrue(duplicate_payment.json()["duplicateRequest"])
        self.assertEqual(duplicate_payment.json()["totalPaid"], 15000)
        self.assertEqual(
            self.client.post(
                f"/api/training/enrollments/{enrollment['id']}/payments",
                headers=self.manager_headers,
                json={"amount": 20000, "paymentMethod": "CASH"},
            ).status_code,
            400,
        )

        payment_id = payment_result["recordedPayment"]["id"]
        voided = self.client.post(
            f"/api/training/payments/{payment_id}/void",
            headers=self.manager_headers,
            json={"reason": "Erreur de montant"},
        )
        self.assertEqual(voided.status_code, 200, voided.text)
        self.assertEqual(voided.json()["totalPaid"], 5000)
        voided_payment = next(p for p in voided.json()["payments"] if p["id"] == payment_id)
        self.assertEqual(voided_payment["status"], "VOIDED")
        self.assertEqual(voided_payment["voidReason"], "Erreur de montant")
        next_payment = self.client.post(
            f"/api/training/enrollments/{enrollment['id']}/payments",
            headers=self.manager_headers,
            json={"amount": 1000, "paymentMethod": "CASH"},
        )
        self.assertEqual(next_payment.status_code, 201, next_payment.text)
        self.assertEqual(next_payment.json()["recordedPayment"]["installmentNumber"], 3)
        audit = self.client.get(
            "/api/training/summary", headers=self.admin_headers
        ).json()["audit"]
        self.assertTrue(any(event["action"] == "PAYMENT_VOIDED" for event in audit))
        recorded_event = next(
            event for event in audit
            if event["action"] == "PAYMENT_RECORDED"
            and event["details"]["amount"] == 1000
        )
        self.assertEqual(recorded_event["studentName"], "Awa Diop")
        self.assertEqual(recorded_event["courseName"], "Coiffure professionnelle")
        self.assertEqual(recorded_event["installmentNumber"], 3)

    def test_deleting_training_actor_keeps_audit_attribution(self):
        course = self._course()
        enrollment = self._enrollment(course)
        payment = self.client.post(
            f"/api/training/enrollments/{enrollment['id']}/payments",
            headers=self.manager_headers,
            json={"amount": 1000, "paymentMethod": "CASH"},
        )
        self.assertEqual(payment.status_code, 201, payment.text)
        with self.store._connect() as connection:
            connection.execute(
                '''UPDATE "TrainingAudit" SET actorName = ''
                   WHERE createdById = ? AND action = 'PAYMENT_RECORDED' ''',
                ("manager-h",),
            )

        deleted = self.client.delete("/api/users/manager-h", headers=self.admin_headers)
        self.assertEqual(deleted.status_code, 200, deleted.text)
        summary = self.client.get("/api/training/summary", headers=self.admin_headers)
        self.assertEqual(summary.status_code, 200, summary.text)
        recorded_event = next(
            event for event in summary.json()["audit"]
            if event["action"] == "PAYMENT_RECORDED"
            and event["details"]["amount"] == 1000
        )
        self.assertEqual(recorded_event["actorName"], "Manager Homme")

        with self.store._connect() as connection:
            self.assertEqual(
                connection.execute(
                    'SELECT createdById FROM "TrainingEnrollment" WHERE id = ?',
                    (enrollment["id"],),
                ).fetchone()["createdById"],
                "admin",
            )
            self.assertEqual(
                connection.execute(
                    'SELECT createdById FROM "TrainingPayment" WHERE id = ?',
                    (payment.json()["recordedPayment"]["id"],),
                ).fetchone()["createdById"],
                "admin",
            )

    def test_training_payments_are_in_cash_totals_and_report_and_scoped(self):
        course = self._course()
        self._enrollment(course)
        payment_response = self.client.post(
            "/api/training/enrollments",
            headers=self.other_manager_headers,
            json={
                "studentName": "Fatou Ba",
                "courseId": course["id"],
                "initialAmount": 7000,
                "shopType": "FEMME",
                "requestKey": "enrollment-femme",
            },
        )
        self.assertEqual(payment_response.status_code, 201)
        today = __import__("datetime").date.today().isoformat()
        stats = dashboard_stats(self.store, {"startDate": today, "endDate": today})["filtered"]
        self.assertEqual(stats["trainingTotal"], 12000)
        self.assertEqual(stats["trainingPaymentCount"], 2)
        self.assertEqual(stats["total"], 12000)
        self.assertEqual(stats["trainingByShop"], {"HOMME": 5000, "FEMME": 7000})
        report = z_report(self.store, {"date": today})
        self.assertEqual(report["trainingTotal"], 12000)
        self.assertEqual(report["totalSales"], 12000)

        manager_stats = self.client.get(
            f"/api/stats?startDate={today}&endDate={today}", headers=self.manager_headers
        )
        self.assertEqual(manager_stats.status_code, 200)
        self.assertEqual(manager_stats.json()["filtered"]["trainingTotal"], 5000)
        self.assertEqual(
            self.client.get("/api/training/summary?shopType=FEMME", headers=self.manager_headers).status_code,
            403,
        )
        self.assertEqual(
            self.client.get("/api/stats?shopType=FEMME", headers=self.manager_headers).status_code,
            403,
        )
        self.assertEqual(
            self.client.get("/api/training/summary", headers=self.cashier_headers).status_code,
            403,
        )

    def test_training_receipt_uses_escpos_payment_details(self):
        invoice_data = {
            "id": "payment-1",
            "isTrainingPayment": True,
            "paymentNumber": "FTR-20261105-0001",
            "createdAt": "2026-11-05T10:00:00Z",
            "studentName": "Awa Diop",
            "courseName": "Coiffure professionnelle",
            "shopType": "HOMME",
            "installmentNumber": 1,
            "paymentMethod": "CASH",
            "amount": 5000,
            "coursePrice": 30000,
            "totalPaidAfter": 5000,
            "remainingAfter": 25000,
        }
        receipt = render_escpos_receipt({"invoiceData": invoice_data})
        self.assertIn(b"RECU DE PAIEMENT FORMATION", receipt)
        self.assertIn(b"FTR-20261105-0001", receipt)
        self.assertIn(b"25 000 FCFA", receipt)


if __name__ == "__main__":
    unittest.main()
