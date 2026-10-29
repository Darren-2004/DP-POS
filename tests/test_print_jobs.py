import tempfile
import unittest
import json
import os
import sqlite3
import time
import types
from pathlib import Path
from unittest.mock import patch

from app.print_agent import (
    CUT_COMMAND,
    get_default_printer,
    load_agent_config,
    print_bin_file,
    print_raw,
    render_escpos_receipt,
    validate_server_url,
)
from app.print_jobs import InvalidAgentToken, InvalidJobState, PrintJobStore, STALE_JOB_SECONDS, UnknownStation
from server import server_tls_options


class PrintJobStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = PrintJobStore(Path(self.temp_dir.name) / "pos.db")
        self.station = self.store.create_station("Cashier 1")
        self.agent = self.store.authenticate_agent(self.station["agentToken"])

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_station_token_authenticates_only_its_station(self):
        self.assertEqual(self.agent["stationId"], self.station["stationId"])
        with self.assertRaises(InvalidAgentToken):
            self.store.authenticate_agent("not-a-station-token")

    def test_rotating_station_token_invalidates_old_agent(self):
        rotated = self.store.rotate_station_token(self.station["stationId"])

        self.assertEqual(rotated["stationId"], self.station["stationId"])
        with self.assertRaises(InvalidAgentToken):
            self.store.authenticate_agent(self.station["agentToken"])
        self.assertEqual(self.store.authenticate_agent(rotated["agentToken"])["stationId"], self.station["stationId"])

    def test_revoking_station_disables_authentication_and_queue_claims(self):
        self.store.revoke_station(self.station["stationId"])

        with self.assertRaises(InvalidAgentToken):
            self.store.authenticate_agent(self.station["agentToken"])
        self.assertEqual(self.store.list_stations(), [])
        with self.assertRaises(UnknownStation):
            self.store.claim_next(self.station["stationId"])

    def test_job_is_claimed_and_acknowledged(self):
        queued = self.store.enqueue(
            self.station["stationId"],
            {"invoiceData": {"id": "invoice-1"}},
            "invoice-1",
            "invoice:invoice-1",
        )
        job = self.store.claim_next(self.agent["stationId"])

        self.assertEqual(job["jobId"], queued["jobId"])
        self.assertIsNone(self.store.claim_next(self.agent["stationId"]))
        self.store.update_job(self.agent["stationId"], job["jobId"], job["leaseToken"], "printing")
        self.store.update_job(self.agent["stationId"], job["jobId"], job["leaseToken"], "printed")
        self.assertEqual(self.store.get_job(self.agent["stationId"], job["jobId"])["status"], "printed")

    def test_idempotency_prevents_duplicate_receipt_jobs(self):
        first = self.store.enqueue(self.station["stationId"], {"receipt": 1}, idempotency_key="sale-1")
        second = self.store.enqueue(self.station["stationId"], {"receipt": 1}, idempotency_key="sale-1")

        self.assertEqual(first["jobId"], second["jobId"])
        self.assertTrue(second["duplicate"])

    def test_definite_preprint_failures_retry_at_most_three_attempts(self):
        queued = self.store.enqueue(self.station["stationId"], {"receipt": 1})

        for attempt in range(1, 4):
            job = self.store.claim_next(self.agent["stationId"])
            self.assertEqual(job["attemptCount"], attempt)
            result = self.store.update_job(
                self.agent["stationId"], job["jobId"], job["leaseToken"], "failed", "printer unavailable"
            )
            expected_status = "queued" if attempt < 3 else "failed"
            self.assertEqual(result["status"], expected_status)
            if attempt < 3:
                with self.store._connect() as connection:
                    connection.execute("UPDATE PrintJob SET nextAttemptAt = 0 WHERE id = ?", (queued["jobId"],))

        final = self.store.get_job(self.agent["stationId"], queued["jobId"])
        self.assertEqual(final["status"], "failed")
        self.assertEqual(final["attemptCount"], 3)

    def test_unknown_print_outcome_is_not_retried_and_needs_confirmation(self):
        queued = self.store.enqueue(self.station["stationId"], {"receipt": 1})
        job = self.store.claim_next(self.agent["stationId"])
        self.store.update_job(self.agent["stationId"], job["jobId"], job["leaseToken"], "printing")
        self.store.update_job(self.agent["stationId"], job["jobId"], job["leaseToken"], "unknown", "connection lost")

        self.assertIsNone(self.store.claim_next(self.agent["stationId"]))
        final = self.store.get_job(self.agent["stationId"], queued["jobId"])
        self.assertEqual(final["status"], "unknown")
        self.assertTrue(final["requiresConfirmation"])

    def test_old_queued_job_requires_confirmation_instead_of_printing(self):
        queued = self.store.enqueue(self.station["stationId"], {"receipt": 1})
        with self.store._connect() as connection:
            connection.execute(
                "UPDATE PrintJob SET createdAt = ? WHERE id = ?",
                (time.time() - STALE_JOB_SECONDS - 1, queued["jobId"]),
            )

        self.assertIsNone(self.store.claim_next(self.agent["stationId"]))
        final = self.store.get_job(self.agent["stationId"], queued["jobId"])
        self.assertEqual(final["status"], "unknown")
        self.assertTrue(final["requiresConfirmation"])

    def test_agent_heartbeat_exposes_health_without_revealing_token(self):
        self.store.record_agent_heartbeat(self.station["agentToken"], "POS-1", "Receipt Printer", "1.0.0")
        station = self.store.list_stations()[0]

        self.assertTrue(station["online"])
        self.assertEqual(station["hostName"], "POS-1")
        self.assertEqual(station["printerName"], "Receipt Printer")
        self.assertEqual(station["agentVersion"], "1.0.0")
        self.assertNotIn("tokenHash", station)

    def test_duplicate_printer_warning_requires_same_host_and_printer(self):
        second = self.store.create_station("Cashier 2")
        self.store.record_agent_heartbeat(self.station["agentToken"], "POS-1", "Printer A")
        self.store.record_agent_heartbeat(second["agentToken"], "POS-1", "Printer A")
        stations = self.store.list_stations()

        self.assertTrue(all(station["duplicatePrinter"] for station in stations))

    def test_expired_printing_job_becomes_unknown_not_retried(self):
        queued = self.store.enqueue(self.station["stationId"], {"receipt": 1})
        job = self.store.claim_next(self.agent["stationId"], lease_seconds=-1)
        self.store.update_job(self.agent["stationId"], job["jobId"], job["leaseToken"], "printing", lease_seconds=-1)

        self.assertIsNone(self.store.claim_next(self.agent["stationId"]))
        self.assertEqual(self.store.get_job(self.agent["stationId"], queued["jobId"])["status"], "unknown")

    def test_unregistered_station_cannot_receive_print_jobs(self):
        with self.assertRaises(UnknownStation):
            self.store.enqueue("unknown", {"receipt": 1})

    def test_initialization_refuses_corrupt_database_without_changing_it(self):
        corrupt_path = Path(self.temp_dir.name) / "corrupt.db"
        original = b"not a valid sqlite database"
        corrupt_path.write_bytes(original)

        with self.assertRaises(sqlite3.DatabaseError):
            PrintJobStore(corrupt_path)

        self.assertEqual(corrupt_path.read_bytes(), original)

    def test_receipt_renderer_emits_escpos_data_with_sale_details(self):
        receipt = render_escpos_receipt({
            "invoiceData": {
                "invoiceNumber": "FAC-20261004-0001",
                "totalAmount": 1500,
                "paymentMethod": "CASH",
                "items": [{"categoryName": "Chemise", "qty": 2, "price": 750}],
            }
        })

        self.assertTrue(receipt.startswith(b"\x1b@"))
        self.assertIn(b"FAC-20261004-0001", receipt)
        self.assertIn(b"\x1bE\x01Reglement:", receipt)
        self.assertIn(b"Chemise", receipt)
        self.assertIn(b"1 500 FCFA", receipt)

    def test_receipt_renderer_keeps_footer_within_safe_paper_height(self):
        items = [
            {"categoryName": f"Article long {index:02d} " + "x" * 40, "qty": 1, "price": 1000}
            for index in range(30)
        ]
        receipt = render_escpos_receipt({
            "invoiceData": {
                "invoiceNumber": "LONG-RECEIPT",
                "totalAmount": 30000,
                "paymentMethod": "CASH",
                "items": items,
            }
        })
        rendered_text = receipt.decode("cp1252")

        self.assertLessEqual(len(rendered_text.splitlines()), 500)
        self.assertIn("Merci de votre visite !", rendered_text)
        self.assertEqual(rendered_text.count("Merci de votre visite !"), 1)
        rendered_lines = rendered_text.splitlines()
        self.assertIn("Merci de votre visite !", rendered_lines)
        self.assertIn("Fait par TriSpark Digital", rendered_lines)
        receipt_payload = receipt[:-len(CUT_COMMAND)].decode("cp1252")
        self.assertTrue(receipt_payload.endswith("\n" * 6))
        self.assertTrue(receipt.startswith(b"\x1b@\x1bt\x10"))
        self.assertIn(b"Fait par TriSpark Digital", receipt)
        self.assertTrue(receipt.endswith(b"\x1dV\x00"))

    def test_receipt_renderer_emits_non_financial_test_page(self):
        receipt = render_escpos_receipt({"testPage": True, "stationName": "Cashier 1"})

        self.assertIn(b"TEST D'IMPRESSION", receipt)
        self.assertIn(b"Cashier 1", receipt)
        self.assertIn(b"Agent POS connecte", receipt)

    def test_agent_reads_windows_powershell_utf8_bom_config(self):
        config_path = Path(self.temp_dir.name) / "agent.json"
        config_path.write_text(json.dumps({"serverUrl": "http://pos:5000"}), encoding="utf-8-sig")

        self.assertEqual(load_agent_config(config_path)["serverUrl"], "http://pos:5000")

    def test_remote_agent_accepts_lan_http_and_https(self):
        self.assertEqual(validate_server_url("https://pos.example:5000/"), "https://pos.example:5000")
        self.assertEqual(validate_server_url("http://172.20.10.5:5000/"), "http://172.20.10.5:5000")
        self.assertEqual(validate_server_url("http://127.0.0.1:5000/"), "http://127.0.0.1:5000")
        with self.assertRaises(ValueError):
            validate_server_url("ftp://pos.example:5000")

    @patch("app.print_agent.os.name", "nt")
    def test_default_printer_comes_from_windows_spooler(self):
        fake_printer_api = types.SimpleNamespace(GetDefaultPrinter=lambda: "Receipt Printer")
        with patch.dict("sys.modules", {"win32print": fake_printer_api}):
            self.assertEqual(get_default_printer(), "Receipt Printer")

    @patch("app.print_agent.os.name", "nt")
    def test_print_raw_sends_cut_command_separately_after_a_pause(self):
        writes = []
        fake_printer_api = types.SimpleNamespace(
            OpenPrinter=lambda name: "handle",
            StartDocPrinter=lambda handle, level, info: None,
            StartPagePrinter=lambda handle: None,
            WritePrinter=lambda handle, data: writes.append(data),
            EndPagePrinter=lambda handle: None,
            EndDocPrinter=lambda handle: None,
            ClosePrinter=lambda handle: None,
        )
        with patch.dict("sys.modules", {"win32print": fake_printer_api}):
            with patch("app.print_agent.time.sleep") as sleep_mock:
                print_raw("Receipt Printer", b"receipt body" + CUT_COMMAND)

        self.assertEqual(writes, [b"receipt body", CUT_COMMAND])
        sleep_mock.assert_called_once()

    @patch("app.print_agent.os.name", "nt")
    def test_print_bin_file_writes_exact_bytes_and_shells_out_to_copy(self):
        receipt = render_escpos_receipt({
            "invoiceData": {
                "invoiceNumber": "TEST-BIN-0001",
                "totalAmount": 1500,
                "paymentMethod": "CASH",
                "createdBy": {"name": "Darren"},
                "items": [{"categoryName": "Test Item", "qty": 1, "price": 1500}],
            }
        })
        self.assertIn(b"Darren", receipt)

        captured = {}

        def fake_run(command, check):
            # Read the temp file's content here, before print_bin_file's
            # own cleanup removes it.
            with open(command[4], "rb") as temp_file:
                captured["bytes"] = temp_file.read()
            captured["command"] = command
            captured["temp_path"] = command[4]

        with patch("app.print_agent.subprocess.run", side_effect=fake_run) as run_mock:
            print_bin_file("Receipt Printer", receipt)

        run_mock.assert_called_once()
        self.assertEqual(captured["bytes"], receipt)
        self.assertEqual(captured["command"][:4], ["cmd", "/c", "copy", "/b"])
        self.assertEqual(captured["command"][5], "\\\\localhost\\Receipt Printer")
        self.assertFalse(os.path.exists(captured["temp_path"]))

    def test_server_tls_requires_both_existing_certificate_files(self):
        with patch.dict(os.environ, {"POS_TLS_CERTFILE": "certificate.pem", "POS_TLS_KEYFILE": ""}):
            with self.assertRaises(ValueError):
                server_tls_options()

        with tempfile.TemporaryDirectory() as directory:
            certificate = Path(directory) / "certificate.pem"
            private_key = Path(directory) / "private-key.pem"
            certificate.write_text("certificate", encoding="utf-8")
            private_key.write_text("key", encoding="utf-8")
            with patch.dict(os.environ, {
                "POS_TLS_CERTFILE": str(certificate),
                "POS_TLS_KEYFILE": str(private_key),
            }):
                options = server_tls_options()
        self.assertEqual(options["ssl_certfile"], str(certificate.resolve()))
        self.assertEqual(options["ssl_keyfile"], str(private_key.resolve()))


if __name__ == "__main__":
    unittest.main()