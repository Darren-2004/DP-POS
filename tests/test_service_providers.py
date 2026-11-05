from datetime import datetime, timedelta
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.auth import hash_pin
from app.main import create_app
from app.print_jobs import PrintJobStore
from app.reservations import create_reservation_invoice
from app.schema import ensure_schema


class ServiceProviderApiTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = PrintJobStore(Path(self.temp_dir.name) / "pos.db")
        with self.store._connect() as connection:
            ensure_schema(connection)
            for user_id, name, pin, role, shop in (
                ("admin-1", "Admin", "1234", "ADMIN", "ALL"),
                ("manager-h", "Manager Homme", "1111", "MANAGER", "HOMME"),
                ("cashier-h", "Cashier Homme", "2222", "CASHIER", "HOMME"),
                ("cashier-f", "Cashier Femme", "3333", "CASHIER", "FEMME"),
            ):
                connection.execute(
                    '''INSERT INTO "User" (id, name, pin, role, permissions, needsPinReset, shopType)
                       VALUES (?, ?, ?, ?, 'ALL', 0, ?)''',
                    (user_id, name, hash_pin(pin), role, shop),
                )
        self.client = TestClient(create_app(self.store))
        self.admin_headers = self._login("admin-1", "1234")
        self.manager_headers = self._login("manager-h", "1111")
        self.homme_headers = self._login("cashier-h", "2222")
        self.femme_headers = self._login("cashier-f", "3333")

    def tearDown(self):
        self.client.close()
        self.temp_dir.cleanup()

    def _login(self, user_id, pin):
        response = self.client.post("/api/auth/login", json={"userId": user_id, "pin": pin})
        self.assertEqual(response.status_code, 200)
        return {"Authorization": f"Bearer {response.json()['accessToken']}"}

    def _create_provider(self, name, shop_type):
        response = self.client.post(
            "/api/service-providers",
            headers=self.admin_headers,
            json={"name": name, "shopType": shop_type},
        )
        self.assertEqual(response.status_code, 201)
        return response.json()

    def test_only_admin_can_manage_providers_and_cashiers_are_shop_scoped(self):
        homme = self._create_provider("Aminata", "HOMME")
        femme = self._create_provider("Fatou", "FEMME")

        self.assertEqual(
            self.client.get("/api/service-providers", headers=self.homme_headers).json(),
            [homme],
        )
        self.assertEqual(
            self.client.get("/api/service-providers", headers=self.femme_headers).json(),
            [femme],
        )
        self.assertEqual(
            self.client.get(
                "/api/service-providers?shopType=FEMME", headers=self.homme_headers
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.post(
                "/api/service-providers",
                headers=self.homme_headers,
                json={"name": "Unauthorized", "shopType": "HOMME"},
            ).status_code,
            403,
        )

    def test_session_token_is_accepted_by_another_app_instance_sharing_database(self):
        with patch.dict(os.environ, {"POS_SESSION_SECRET": ""}):
            with TestClient(create_app(self.store)) as first_app:
                login = first_app.post(
                    "/api/auth/login",
                    json={"userId": "admin-1", "pin": "1234"},
                )
                self.assertEqual(login.status_code, 200)
                headers = {"Authorization": f"Bearer {login.json()['accessToken']}"}

                with TestClient(create_app(self.store)) as second_app:
                    response = second_app.get(
                        "/api/service-provider-stats",
                        headers=headers,
                    )

        self.assertEqual(response.status_code, 200)

    def test_admin_can_change_provider_name_and_shop(self):
        provider = self._create_provider("Aminata", "HOMME")

        updated = self.client.put(
            f"/api/service-providers/{provider['id']}",
            headers=self.admin_headers,
            json={"name": "Aminata Diallo", "shopType": "FEMME"},
        )

        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["name"], "Aminata Diallo")
        self.assertEqual(updated.json()["shopType"], "FEMME")
        self.assertEqual(
            self.client.get("/api/service-providers", headers=self.homme_headers).json(),
            [],
        )
        self.assertEqual(
            self.client.get("/api/service-providers", headers=self.femme_headers).json(),
            [updated.json()],
        )
        self.assertEqual(
            self.client.put(
                f"/api/service-providers/{provider['id']}",
                headers=self.homme_headers,
                json={"name": "Unauthorized", "shopType": "HOMME"},
            ).status_code,
            403,
        )

    def test_invoice_provider_must_belong_to_cashiers_shop_and_is_saved_in_details(self):
        homme = self._create_provider("Aminata", "HOMME")
        femme = self._create_provider("Fatou", "FEMME")
        wrong_shop = self.client.post(
            "/api/invoices",
            headers=self.homme_headers,
            json={
                "totalAmount": 1000,
                "createdById": "cashier-h",
                "shopType": "FEMME",
                "items": [{
                    "categoryName": "Coupe",
                    "price": 1000,
                    "qty": 1,
                    "providerId": femme["id"],
                }],
            },
        )
        self.assertEqual(wrong_shop.status_code, 400)

        response = self.client.post(
            "/api/invoices",
            headers=self.homme_headers,
            json={
                "totalAmount": 2000,
                "createdById": "cashier-h",
                "shopType": "FEMME",
                "items": [{
                    "categoryName": "Coupe",
                    "price": 1000,
                    "qty": 2,
                    "providerId": homme["id"],
                }],
            },
        )
        self.assertEqual(response.status_code, 201)
        invoice = response.json()
        self.assertEqual(invoice["shopType"], "HOMME")
        self.assertEqual(invoice["items"][0]["providerName"], "Aminata")

        listed = self.client.get("/api/invoices?includeAllDeliveries=true").json()
        listed_invoice = next(item for item in listed if item["id"] == invoice["id"])
        self.assertEqual(listed_invoice["items"][0]["providerName"], "Aminata")

    def test_provider_statistics_count_services_and_revenue(self):
        provider = self._create_provider("Aminata", "HOMME")
        other_provider = self._create_provider("Fatou", "HOMME")
        self.client.post(
            "/api/invoices",
            headers=self.homme_headers,
            json={
                "totalAmount": 2500,
                "createdById": "cashier-h",
                "items": [{
                    "categoryName": "Coupe",
                    "price": 1250,
                    "qty": 2,
                    "providerId": provider["id"],
                }],
            },
        )
        self.client.post(
            "/api/invoices",
            headers=self.homme_headers,
            json={
                "totalAmount": 800,
                "createdById": "cashier-h",
                "items": [{
                    "categoryName": "Coloration",
                    "price": 800,
                    "qty": 1,
                    "providerId": other_provider["id"],
                }],
            },
        )

        response = self.client.get(
            "/api/service-provider-stats?shopType=HOMME",
            headers=self.admin_headers,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["topByCount"][0]["serviceCount"], 2)
        self.assertEqual(response.json()["topByRevenue"][0]["revenue"], 2500)
        self.assertEqual(response.json()["topByAverageRevenue"][0]["revenue"] / response.json()["topByAverageRevenue"][0]["serviceCount"], 1250)
        provider_row = next(row for row in response.json()["providers"] if row["id"] == provider["id"])
        self.assertEqual(provider_row["name"], "Aminata")

        today = datetime.now().astimezone().strftime("%Y-%m-%d")
        dashboard_response = self.client.get(
            f"/api/stats?startDate={today}&endDate={today}&providerId={provider['id']}",
            headers=self.admin_headers,
        )
        self.assertEqual(dashboard_response.status_code, 200)
        self.assertEqual(dashboard_response.json()["filtered"]["total"], 2500)
        self.assertEqual(dashboard_response.json()["analytics"]["topServices"][0]["name"], "Coupe")
        self.assertEqual(
            dashboard_response.json()["analytics"]["topServices"][0]["revenue"],
            2500,
        )

        invoice_response = self.client.get(
            f"/api/invoices?providerId={provider['id']}&page=1&pageSize=50",
            headers=self.admin_headers,
        )
        self.assertEqual(invoice_response.status_code, 200)
        self.assertEqual(invoice_response.json()["total"], 1)
        self.assertEqual(
            invoice_response.json()["items"][0]["items"][0]["providerId"],
            provider["id"],
        )

    def test_provider_statistics_follow_selected_date_range(self):
        provider = self._create_provider("Aminata", "HOMME")
        invoice_ids = []
        for amount, quantity in ((1000, 1), (2500, 2)):
            response = self.client.post(
                "/api/invoices",
                headers=self.homme_headers,
                json={
                    "totalAmount": amount,
                    "createdById": "cashier-h",
                    "items": [{
                        "categoryName": "Coupe",
                        "price": amount / quantity,
                        "qty": quantity,
                        "providerId": provider["id"],
                    }],
                },
            )
            self.assertEqual(response.status_code, 201)
            invoice_ids.append(response.json()["id"])

        with self.store._connect() as connection:
            connection.execute(
                'UPDATE "Invoice" SET createdAt = ? WHERE id = ?',
                ("2025-01-06T10:00:00.000Z", invoice_ids[0]),
            )
            connection.execute(
                'UPDATE "Invoice" SET createdAt = ? WHERE id = ?',
                ("2025-01-12T10:00:00.000Z", invoice_ids[1]),
            )

        response = self.client.get(
            "/api/service-provider-stats?shopType=HOMME&startDate=2025-01-06&endDate=2025-01-12",
            headers=self.admin_headers,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["topByCount"][0]["serviceCount"], 3)
        self.assertEqual(response.json()["topByRevenue"][0]["revenue"], 3500)

    def test_reservation_provider_is_preserved_in_final_invoice(self):
        provider = self._create_provider("Aminata", "HOMME")
        response = self.client.post(
            "/api/reservations",
            headers=self.homme_headers,
            json={
                "clientName": "Client test",
                "createdById": "cashier-h",
                "shopType": "FEMME",
                "totalAmount": 1500,
                "items": [{
                    "categoryName": "Coupe",
                    "price": 1500,
                    "qty": 1,
                    "providerId": provider["id"],
                }],
            },
        )
        self.assertEqual(response.status_code, 201)
        reservation = response.json()
        self.assertEqual(reservation["shopType"], "HOMME")
        self.assertEqual(reservation["items"][0]["providerName"], "Aminata")

        invoice = create_reservation_invoice(
            self.store, reservation["id"], created_by_id="cashier-h"
        )

        self.assertEqual(invoice["items"][0]["providerName"], "Aminata")

    def test_dashboard_insights_cover_staff_trends_and_are_manager_shop_scoped(self):
        provider_h = self._create_provider("Aminata", "HOMME")
        provider_f = self._create_provider("Fatou", "FEMME")
        for headers, cashier_id, shop_type, provider_id, amount in (
            (self.homme_headers, "cashier-h", "HOMME", provider_h["id"], 2500),
            (self.femme_headers, "cashier-f", "FEMME", provider_f["id"], 1500),
        ):
            invoice = self.client.post(
                "/api/invoices",
                headers=headers,
                json={
                    "totalAmount": amount,
                    "createdById": cashier_id,
                    "shopType": shop_type,
                    "clientName": f"Client {shop_type}",
                    "clientPhone": "555-0101",
                    "items": [{
                        "categoryName": "Coupe",
                        "price": amount,
                        "qty": 1,
                        "providerId": provider_id,
                    }],
                },
            )
            self.assertEqual(invoice.status_code, 201)

        admin_insights = self.client.get(
            "/api/dashboard-insights",
            headers=self.admin_headers,
        )
        self.assertEqual(admin_insights.status_code, 200)
        admin_data = admin_insights.json()
        self.assertEqual(
            {row["shopType"] for row in admin_data["staffPerformance"] if row["invoiceCount"]},
            {"HOMME", "FEMME"},
        )
        self.assertEqual(
            {row["shopType"] for row in admin_data["providerPerformance"]},
            {"HOMME", "FEMME"},
        )
        self.assertEqual(len(admin_data["monthlyTrends"]), 12)

        with self.store._connect() as connection:
            old_created_at = (datetime.now().astimezone() - timedelta(days=70)).isoformat()
            connection.execute(
                '''INSERT INTO "Invoice" (
                       id, invoiceNumber, totalAmount, paymentMethod, clientName, clientPhone,
                       shopType, status, createdAt, createdById
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                (
                    "old-homme-invoice", "FAC-OLD-H", 1000, "CASH", "Inactive Client",
                    "555-0102", "HOMME", "VALIDATED", old_created_at, "cashier-h",
                ),
            )
            tomorrow = (datetime.now().astimezone() + timedelta(days=1)).strftime("%Y-%m-%d")
            connection.execute(
                '''INSERT INTO "Reservation" (
                       id, reservationNo, clientName, clientPhone, scheduledAt, shopType,
                       totalAmount, createdById
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                (
                    "upcoming-homme-reservation", "RES-UPCOMING-H", "Upcoming Client",
                    "555-0103", f"{tomorrow}T10:00:00", "HOMME", 1200, "manager-h",
                ),
            )

        manager_insights = self.client.get(
            "/api/dashboard-insights",
            headers=self.manager_headers,
        )
        self.assertEqual(manager_insights.status_code, 200)
        manager_data = manager_insights.json()
        self.assertTrue(all(row["shopType"] == "HOMME" for row in manager_data["staffPerformance"]))
        self.assertTrue(all(row["shopType"] == "HOMME" for row in manager_data["providerPerformance"]))
        self.assertIn("dailyOperations", manager_data)
        self.assertIn("upcomingAppointments", manager_data)
        self.assertIn("followUpClients", manager_data)
        self.assertIn("Inactive Client", [row["name"] for row in manager_data["followUpClients"]])
        self.assertIn(
            "Upcoming Client",
            [row["clientName"] for row in manager_data["upcomingAppointments"]],
        )
        self.assertEqual(
            self.client.get(
                "/api/dashboard-insights?shopType=FEMME",
                headers=self.manager_headers,
            ).status_code,
            403,
        )


if __name__ == "__main__":
    unittest.main()
