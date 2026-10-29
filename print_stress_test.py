import argparse
import json
import os
import sys
import time
from pathlib import Path

from app.print_agent import get_default_printer, load_agent_config, print_raw, render_escpos_receipt


def test_receipt_payload():
    return {
        "testPage": True,
        "stationName": "PRINT STRESS TEST",
        "invoiceData": {
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "createdBy": {"name": "Darren"},
            "paymentMethod": "CASH",
            "items": [{"categoryName": "TEST IMPRESSION", "price": 100, "qty": 1}],
            "totalAmount": 100,
        },
    }


def main():
    parser = argparse.ArgumentParser(
        description="Print a synthetic POS receipt periodically to test the configured printer."
    )
    parser.add_argument(
        "--config",
        default=str(Path(os.getenv("LOCALAPPDATA", Path.home())) / "POSPrintAgent" / "config.json"),
        help="Print-agent config JSON (defaults to the installed POS print-agent config).",
    )
    parser.add_argument("--interval", type=float, default=5, help="Seconds between prints (default: 5).")
    parser.add_argument("--duration", type=float, default=3600, help="Test duration in seconds (default: 3600).")
    parser.add_argument("--dry-run", action="store_true", help="Render and verify a test receipt without printing.")
    args = parser.parse_args()

    if args.interval <= 0 or args.duration <= 0:
        parser.error("--interval and --duration must be greater than zero")

    receipt = render_escpos_receipt(test_receipt_payload())
    if args.dry_run:
        if b"TEST D'IMPRESSION" not in receipt or b"TEST IMPRESSION" not in receipt:
            print("Dry run failed: expected test receipt text was not rendered.", file=sys.stderr)
            return 1
        print(f"Dry run OK: rendered {len(receipt)} bytes of ESC/POS test receipt data; printer was not contacted.")
        return 0

    config_path = Path(args.config)
    if not config_path.is_file():
        print(f"Print-agent config not found: {config_path}", file=sys.stderr)
        return 1
    try:
        config = load_agent_config(config_path)
    except (OSError, json.JSONDecodeError) as error:
        print(f"Could not read print-agent config: {error}", file=sys.stderr)
        return 1

    try:
        printer_name = get_default_printer()
    except Exception as error:
        print(f"Could not get this PC's default printer: {error}", file=sys.stderr)
        return 1

    expected_prints = int((args.duration - 1e-9) // args.interval) + 1
    print(f"Printer: {printer_name}")
    print(f"Schedule: one synthetic test receipt every {args.interval:g} seconds for {args.duration:g} seconds.")
    print(f"Expected prints: {expected_prints}. No sales or customer data will be used.")
    if input("Type PRINT to begin: ").strip() != "PRINT":
        print("Cancelled; nothing was printed.")
        return 0

    started_at = time.monotonic()
    deadline = started_at + args.duration
    next_print_at = started_at
    successful_prints = 0
    try:
        while next_print_at < deadline:
            wait_seconds = next_print_at - time.monotonic()
            if wait_seconds > 0:
                time.sleep(wait_seconds)
            print_raw(printer_name, receipt)
            successful_prints += 1
            elapsed = time.monotonic() - started_at
            print(f"[{time.strftime('%H:%M:%S')}] Printed test receipt {successful_prints}/{expected_prints} ({elapsed:.0f}s elapsed).")
            next_print_at += args.interval
    except KeyboardInterrupt:
        print("\nTest interrupted by user.")
        return 130
    except Exception as error:
        print(f"\nPrinting stopped after {successful_prints} successful print(s): {error}", file=sys.stderr)
        return 1

    print(f"Test complete: {successful_prints} test receipts printed in {time.monotonic() - started_at:.0f} seconds.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())