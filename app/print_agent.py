import unicodedata
import argparse
import json
import logging
from logging.handlers import RotatingFileHandler
import os
import socket
import subprocess
import tempfile
import threading
import time
import urllib.request
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse
from websockets.sync.client import connect


RECONNECT_DELAY_SECONDS = 0.5
HEARTBEAT_INTERVAL_SECONDS = 15
AGENT_VERSION = "1.1.0"
MAX_RECEIPT_LINES = 500
CUT_COMMAND = b"\x1bd\x03\x1dV\x00"
CUT_SETTLE_SECONDS = 0.8
BOTTOM_BLANK_LINES = 5  # actual blank printed lines, not a feed/margin command


def validate_server_url(server_url):
    parsed = urlparse(str(server_url or ""))
    if parsed.scheme in {"http", "https"} and parsed.hostname:
        return server_url.rstrip("/")
    raise ValueError("Print agent server URL must use http:// or https:// and include a hostname")


def load_agent_config(config_path):
    with open(config_path, encoding="utf-8-sig") as config_file:
        return json.load(config_file)


def configure_agent_logging(config_path):
    log_path = Path(config_path).resolve().parent / "agent.log"
    handler = RotatingFileHandler(log_path, maxBytes=1_000_000, backupCount=3, encoding="utf-8")
    logging.basicConfig(level=logging.INFO, handlers=[handler], format="%(asctime)s %(levelname)s %(message)s")


def _amount(value):
    try:
        return f"{int(float(value or 0) + 0.5):,}".replace(",", " ")
    except (TypeError, ValueError):
        return "0"


def _key_value(key, value, width=48):
    key_text = str(key)
    value_text = str(value)
    if len(key_text) + len(value_text) < width:
        return key_text + " " * (width - len(key_text) - len(value_text)) + value_text
    if len(value_text) <= width:
        return key_text + "\n" + value_text.rjust(width)
    chunks = [value_text[index:index + width] for index in range(0, len(value_text), width)]
    return key_text + "\n" + "\n".join(chunk.rjust(width) for chunk in chunks)


def _center_receipt_text(value, width=42, left_shift_columns=12):
    text = str(value)
    leading_spaces = max(0, (width - len(text)) // 2 - left_shift_columns)
    return " " * leading_spaces + text


def _row(column_one, column_two, column_three, column_four, width=48):
    first_width, second_width, third_width, fourth_width = 19, 5, 10, 12
    second = str(column_two)[:second_width].rjust(second_width)
    third = str(column_three)[:third_width].rjust(third_width)
    fourth = str(column_four)
    total_on_next_line = len(fourth) > fourth_width and column_two != "Qte"
    if not total_on_next_line:
        fourth = fourth.rjust(fourth_width)

    first_lines = [str(column_one)[index:index + first_width] for index in range(0, len(str(column_one)), first_width)] or [""]
    result = []
    for index, line in enumerate(first_lines):
        first = line.ljust(first_width)
        if index == 0:
            separator = " " if column_two == "Qte" and column_three == "P/U" else "|"
            result.append(first + second + separator + third + separator + (fourth if not total_on_next_line else ""))
        else:
            result.append(first + " " * (second_width + 1 + third_width + 1 + (0 if total_on_next_line else fourth_width)))
    if total_on_next_line:
        result.append(" " * max(0, width - len(fourth)) + fourth)
    return "\n".join(result)


def _format_item_escpos(name, quantity, price, width=48):
    total = price * quantity
    total_str = f"{_amount(total)} FCFA"
    calc_str = f"  {quantity} x {_amount(price)}"
    import textwrap
    clean_name = str(name).strip()
    name_lines = textwrap.wrap(clean_name, width=width) or [clean_name]
    if len(calc_str) + len(total_str) < width:
        detail_line = calc_str + " " * (width - len(calc_str) - len(total_str)) + total_str
    else:
        detail_line = calc_str + "\n" + total_str.rjust(width)
    return "\n".join(name_lines + [detail_line])


def _payment_label(method):
    value = str(method or "").strip()
    labels = {"CASH": "Especes", "ONLINE": "Mobile Money", "ORANGE_MONEY": "Orange Money"}
    if value.startswith("MULTIPLE:"):
        parts = []
        for part in value[9:].split(";"):
            key, _, amount = part.partition("=")
            label = labels.get(key.strip().upper(), key.strip().upper())
            parts.append(f"{label}: {_amount(amount)} FCFA")
        return ", ".join(parts)
    return labels.get(value, "Non precise")


def _localized_date(value):
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone()
        return parsed.strftime("%d/%m/%Y %H:%M")
    except (TypeError, ValueError):
        return str(value or "")


def _render_training_payment_receipt(payment):
    remaining = float(payment.get("remainingAfter") or 0)
    lines = [
        "\x1ba\x01\x1bE\x01\x1d!\x11DIMITRI PERFECT\x1d!\x00\x1bE\x00",
        "RECU DE PAIEMENT FORMATION",
        "\x1ba\x00",
        "-" * 48,
        _key_value("N Recu:", payment.get("paymentNumber") or ""),
        _key_value("Date:", _localized_date(payment.get("createdAt"))),
        _key_value("Apprenant:", payment.get("studentName") or ""),
        _key_value("Telephone:", payment.get("studentPhone") or ""),
        _key_value("Formation:", payment.get("courseName") or ""),
        _key_value("Shop:", payment.get("shopName") or payment.get("shopType") or ""),
        _key_value("Enregistre par:", (payment.get("createdBy") or {}).get("name") or ""),
        _key_value("Mode de paiement:", _payment_label(payment.get("paymentMethod"))),
        "-" * 48,
        _key_value("Tranche numero:", payment.get("installmentNumber") or 1),
        "\x1bE\x01" + _key_value("PAYE CE JOUR:", f"{_amount(payment.get('amount'))} FCFA") + "\x1bE\x00",
        _key_value("Prix formation:", f"{_amount(payment.get('coursePrice'))} FCFA"),
        _key_value("Total paye:", f"{_amount(payment.get('totalPaidAfter'))} FCFA"),
        _key_value("SOLDE RESTANT:", f"{_amount(remaining)} FCFA"),
        "-" * 48,
        "Conservez ce recu comme justificatif.",
        "",
        "Fait Par TriSpark Digital",
    ] + [""] * BOTTOM_BLANK_LINES
    return _encode_escpos_lines(lines)


def _encode_escpos_lines(lines):
    text = "\n".join(lines) + "\n"
    text_clean = "".join(
        character for character in unicodedata.normalize("NFKD", text)
        if not unicodedata.combining(character)
    )
    return b"\x1b@\x1bt\x10" + text_clean.encode("ascii", errors="replace") + CUT_COMMAND


def _render_escpos_z_report(invoice):
    report = invoice.get("zReport") or {}
    lines = [
        "\x1ba\x01\x1bE\x01\x1d!\x11DIMITRI PERFECT\x1d!\x00\x1bE\x00",
        "RAPPORT DE CLOTURE (Z)",
        "\x1ba\x00",
        "-" * 48,
        _key_value("Periode:", report.get("date") or report.get("periodLabel") or ""),
        _key_value("Heure:", report.get("time") or ""),
        _key_value("Operateur:", report.get("cashierName") or "Admin"),
    ]
    shop_reports = report.get("shopReports") or [report]
    grand_total = 0.0
    for shop_report in shop_reports:
        payments = shop_report.get("payments") or {}
        shop_total = float(shop_report.get("totalSales", shop_report.get("total")) or 0)
        grand_total += shop_total
        lines.extend([
            "-" * 48,
            str(shop_report.get("shopName") or shop_report.get("shopType") or "SALON").upper(),
            _key_value("TOTAL ENCAISSE:", f"{_amount(shop_total)} FCFA"),
            _key_value("Especes:", f"{_amount(payments.get('CASH'))} FCFA"),
            _key_value("Mobile Money:", f"{_amount(payments.get('ONLINE'))} FCFA"),
            _key_value("Orange Money:", f"{_amount(payments.get('ORANGE_MONEY'))} FCFA"),
            _key_value("Factures validees:", shop_report.get("validatedCount", shop_report.get("count", 0))),
            _key_value("Acomptes reservation:", shop_report.get("resPaymentCount", 0)),
            _key_value("Paiements formation:", shop_report.get("trainingPaymentCount", 0)),
            _key_value("Total formations:", f"{_amount(shop_report.get('trainingTotal'))} FCFA"),
            _key_value("Tickets annules:", shop_report.get("cancelledCount", 0)),
        ])
        providers = shop_report.get("serviceProviders") or []
        if providers:
            lines.extend(["-" * 48, "PERFORMANCE DES PRESTATAIRES"])
        total_services = 0
        total_revenue = 0.0
        for provider in providers:
            service_count = int(provider.get("serviceCount") or 0)
            revenue = float(provider.get("revenue") or 0)
            total_services += service_count
            total_revenue += revenue
            lines.append(str(provider.get("name") or "Prestataire")[:48])
            lines.append(_key_value(f"{service_count} prestation(s)", f"{_amount(revenue)} FCFA"))
        if providers:
            lines.append("-" * 48)
            lines.append(_key_value(f"TOTAL {total_services} PRESTATION(S):", f"{_amount(total_revenue)} FCFA"))

        categories = shop_report.get("topSelling") or []
        if categories:
            lines.extend(["-" * 48, "REPARTITION PAR CATEGORIE"])
            for category in categories:
                lines.append(_key_value(
                    f"{str(category.get('name') or '')[:24]} x{category.get('quantity') or 0}",
                    f"{_amount(category.get('revenue'))} FCFA",
                ))

    if len(shop_reports) > 1:
        lines.extend(["-" * 48, "\x1bE\x01" + _key_value("TOTAL RESEAU:", f"{_amount(grand_total)} FCFA") + "\x1bE\x00"])
    lines.extend(["-" * 48, "FIN DU RAPPORT DE CLOTURE Z"])
    if len(lines) > MAX_RECEIPT_LINES:
        lines = lines[:MAX_RECEIPT_LINES - 1] + ["Details supplementaires non imprimes"]
    return _encode_escpos_lines(lines)


def render_escpos_receipt(payload):
    reservation = payload.get("reservation")
    invoice = payload.get("invoiceData") or reservation or {}
    if invoice.get("isZReport"):
        return _render_escpos_z_report(invoice)
    if invoice.get("isTrainingPayment"):
        return _render_training_payment_receipt(invoice)
    is_test_page = bool(payload.get("testPage"))
    is_delivery = bool(invoice.get("isDelivery"))
    lines = [
        "\x1ba\x01\x1bE\x01\x1d!\x11DIMITRI PERFECT\x1d!\x00\x1bE\x00",
        "SALON DE BEAUTE & SOINS",
    ]
    if is_test_page:
        lines.append("TEST D'IMPRESSION")
    elif reservation:
        lines.append("RECU PROFORMA (RESERVATION)")
    elif is_delivery:
        lines.append("BON DE LIVRAISON")
    elif invoice.get("reservationPayments"):
        lines.append("FACTURE DEFINITIVE")
    else:
        lines.append("TICKET DE CAISSE")
    lines.extend(["- - - - - - - - - - - - - - - - - - - - - - - -", "\x1ba\x00"])

    number = payload.get("stationName") if is_test_page else invoice.get("deliveryNo") or invoice.get("invoiceNumber") or invoice.get("reservationNo") or ""
    number_label = "Station:" if is_test_page else "N Reservation:" if reservation else "N Livraison:" if is_delivery else "N Ticket:"
    lines.append(_key_value(number_label, number))
    if invoice.get("createdAt"):
        lines.append(_key_value("Date:", _localized_date(invoice["createdAt"])))
    cashier_name = (invoice.get("createdBy") or {}).get("name") or ("Darren" if is_test_page else "Caissiere")
    lines.append(_key_value("Caissiere:" if not reservation else "Enregistre par:", cashier_name))
    if invoice.get("paymentMethod"):
        payment_line = _key_value("Reglement:", _payment_label(invoice["paymentMethod"]))
        lines.append("\x1bE\x01" + payment_line + "\x1bE\x00")

    client_name = str(invoice.get("clientName") or "")
    client_phone = str(invoice.get("clientPhone") or "")
    if not client_phone and "(" in client_name and ")" in client_name:
        import re
        match = re.fullmatch(r"(.+?)\s*\((.+?)\)", client_name)
        if match:
            client_name, client_phone = match.group(1).strip(), match.group(2).strip()
    if client_name and client_name != "Client de passage":
        lines.append(_key_value("Nom client:", client_name))
    if client_phone:
        lines.append(_key_value("Tel client:", client_phone))

    lines.extend(["-" * 48, _key_value("PRESTATIONS & ARTICLES", "TOTAL"), "-" * 48])
    item_start = len(lines)
    grouped = {}
    for item in invoice.get("items") or []:
        name = str(item.get("categoryName") or "Article")
        price = float(item.get("price") or 0)
        key = (name, price)
        if key not in grouped:
            grouped[key] = 0
        grouped[key] += int(item.get("qty") or 1)
    item_rows = [_format_item_escpos(name, quantity, price) for (name, price), quantity in grouped.items()]
    lines.extend(item_rows)
    item_end = len(lines)

    lines.append("=" * 48)
    total_amount = float(invoice.get("totalAmount") or 0)
    delivery_fee = float(invoice.get("deliveryFee") or 0)
    if is_delivery and delivery_fee > 0:
        lines.append(_key_value("Sous-total articles:", f"{_amount(total_amount)} FCFA"))
        lines.append(_key_value("Frais de transport:", f"{_amount(delivery_fee)} FCFA"))
        lines.append("-" * 48)
    total_label = "MONTANT TOTAL:" if reservation else "TOTAL A PAYER:"
    lines.append("\x1bE\x01" + _key_value(total_label, f"{_amount(total_amount + delivery_fee)} FCFA") + "\x1bE\x00")

    payments = invoice.get("payments") or invoice.get("reservationPayments") or []
    if payments:
        lines.extend(["-" * 48, "HISTORIQUE DES VERSEMENTS:"])
        for index, payment in enumerate(payments):
            method = _payment_label(payment.get("paymentMethod"))
            installment = payment.get("installmentNumber") or index + 1
            suffix = " [CE JOUR]" if index == len(payments) - 1 else ""
            label = f"Tranche {installment}/3 ({method}){suffix}:"
            row = _key_value(label, f"{_amount(payment.get('amount'))} FCFA")
            lines.append("\x1bE\x01" + row + "\x1bE\x00" if index == len(payments) - 1 else row)
        total_paid = sum(float(payment.get("amount") or 0) for payment in payments)
        remaining = max(0, total_amount - total_paid)
        lines.extend(["-" * 48, _key_value("TOTAL PAYE:", f"{_amount(total_paid)} FCFA"), _key_value("SOLDE RESTANT:", f"{_amount(remaining)} FCFA")])
        last_amount = _amount(payments[-1].get("amount"))
        lines.extend(["=" * 48, f"\x1bE\x01\x1d!\x11MONTANT PAYE CE JOUR\n{last_amount} FCFA\x1d!\x00\x1bE\x00", "=" * 48])

    if is_test_page:
        lines.extend(["", "Agent POS connecte", "Imprimante configuree avec succes"])

    footer = [
        "",
        "\x1ba\x01" + "Révélez votre beauté chez Dimitri Perfect",
        "Les prestations et articles vendus ne sont ni",
        "remboursables ni échangeables.",
        "Fait Par TriSpark Digital",
    ] + [""] * BOTTOM_BLANK_LINES
    lines.extend(footer)

    def physical_line_count(content):
        return len("\n".join(content).splitlines())

    if physical_line_count(lines) > MAX_RECEIPT_LINES:
        retained_rows = []
        retained_line_count = physical_line_count(lines[:item_start] + lines[item_end:]) + physical_line_count(footer)
        for row in reversed(item_rows):
            row_line_count = len(row.splitlines())
            if retained_line_count + row_line_count > MAX_RECEIPT_LINES:
                continue
            retained_rows.insert(0, row)
            retained_line_count += row_line_count

        if retained_rows:
            lines[item_start:item_end] = retained_rows
        else:
            lines[item_start:item_end] = []
        lines.insert(item_start, "Détails supplémentaires non imprimés")
        lines.insert(item_start + 1, "-" * 48)

        if physical_line_count(lines) > MAX_RECEIPT_LINES:
            lines = lines[:MAX_RECEIPT_LINES]

    return _encode_escpos_lines(lines)


def send_json(base_url, path, token, body=None, method="GET"):
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        base_url.rstrip("/") + path,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        if response.status == 204:
            return None
        return json.loads(response.read().decode("utf-8"))


def _send_raw_job(printer_name, chunk):
    import win32print

    handle = win32print.OpenPrinter(printer_name)
    document_started = False
    page_started = False
    try:
        win32print.StartDocPrinter(handle, 1, ("POS receipt", None, "RAW"))
        document_started = True
        win32print.StartPagePrinter(handle)
        page_started = True
        win32print.WritePrinter(handle, chunk)
    finally:
        if page_started:
            win32print.EndPagePrinter(handle)
        if document_started:
            win32print.EndDocPrinter(handle)
        win32print.ClosePrinter(handle)


def print_raw(printer_name, data):
    if os.name != "nt":
        raise RuntimeError("The POS print agent currently supports Windows only")
    import win32print

    printer_name = printer_name or win32print.GetDefaultPrinter()
    _send_raw_job(printer_name, data)


def print_bin_file(printer_name, data):
    """Writes receipt bytes to a temporary .bin file and prints via Windows OS copy command.

    NOTE: This transmission mechanism requires the target printer to be shared locally on Windows first.
    Steps to share a printer on Windows:
      1. Open Control Panel > Devices and Printers (or Settings > Bluetooth & devices > Printers & scanners).
      2. Right-click / select the target printer and choose 'Printer properties'.
      3. Open the 'Sharing' tab.
      4. Check 'Share this printer' and set a Share Name (e.g. matching printer_name).
      5. Click 'Apply' and 'OK'.
    """
    if os.name != "nt":
        raise RuntimeError("The POS print agent currently supports Windows only")

    printer_name = printer_name or get_default_printer()

    temp_file = tempfile.NamedTemporaryFile(suffix=".bin", delete=False)
    temp_path = temp_file.name
    try:
        temp_file.write(data)
        temp_file.close()

        unc_path = f"\\\\localhost\\{printer_name}"
        cmd = ["cmd.exe", "/c", "copy", "/b", temp_path, unc_path]
        subprocess.run(cmd, check=True, capture_output=True, text=True)
    finally:
        try:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except Exception as cleanup_error:
            logging.warning("Failed to clean up temp bin file %s: %s", temp_path, cleanup_error)


def validate_printer(printer_name):
    if os.name != "nt":
        raise RuntimeError("The POS print agent currently supports Windows only")
    import win32print

    printer_name = printer_name or win32print.GetDefaultPrinter()
    handle = win32print.OpenPrinter(printer_name)
    win32print.ClosePrinter(handle)
    return printer_name


def get_default_printer():
    if os.name != "nt":
        raise RuntimeError("The POS print agent currently supports Windows only")
    import win32print

    return win32print.GetDefaultPrinter()


def process_job(base_url, token, printer_name, job, print_via_bin=False):
    job_id = job["jobId"]
    lease_token = job["leaseToken"]
    job_path = f"/api/print/agent/jobs/{job_id}"
    try:
        validate_printer(printer_name)
    except Exception as error:
        logging.error("Printer %s is unavailable for job %s: %s", printer_name, job_id, error)
        try:
            send_json(
                base_url,
                job_path + "/failed",
                token,
                {"leaseToken": lease_token, "error": str(error)[:500]},
                "POST",
            )
        except Exception:
            pass
        return False

    try:
        send_json(base_url, job_path + "/printing", token, {"leaseToken": lease_token}, "POST")
        data = render_escpos_receipt(job["payload"])
        if print_via_bin:
            print_bin_file(printer_name, data)
        else:
            print_raw(printer_name, data)
    except Exception as error:
        logging.exception("Print outcome is unknown for job %s", job_id)
        try:
            send_json(
                base_url,
                job_path + "/unknown",
                token,
                {"leaseToken": lease_token, "error": str(error)[:500]},
                "POST",
            )
        except Exception:
            pass
        return False

    send_json(base_url, job_path + "/printed", token, {"leaseToken": lease_token}, "POST")
    logging.info("Job %s submitted to printer %s", job_id, printer_name)
    return True


def _heartbeat_loop(base_url, token, printer_name, stop_event):
    while not stop_event.is_set():
        try:
            send_json(
                base_url,
                "/api/print/agent/heartbeat",
                token,
                {
                    "hostName": socket.gethostname(),
                    "printerName": printer_name,
                    "agentVersion": AGENT_VERSION,
                },
                "POST",
            )
        except Exception:
            logging.exception("Print agent heartbeat failed")
        stop_event.wait(HEARTBEAT_INTERVAL_SECONDS)


def run_agent(base_url, token, printer_name, print_via_bin=False):
    printer_name = validate_printer(printer_name)
    logging.info("Using default Windows printer: %s", printer_name)
    websocket_url = base_url.rstrip("/").replace("https://", "wss://", 1).replace("http://", "ws://", 1)
    websocket_url += "/api/print/agent/ws"
    reconnect_delay = RECONNECT_DELAY_SECONDS
    stop_event = threading.Event()
    heartbeat = threading.Thread(
        target=_heartbeat_loop,
        args=(base_url, token, printer_name, stop_event),
        name="pos-print-agent-heartbeat",
        daemon=True,
    )
    heartbeat.start()
    try:
        while True:
            try:
                with connect(
                    websocket_url,
                    additional_headers={"Authorization": f"Bearer {token}"},
                    open_timeout=10,
                    ping_interval=20,
                    close_timeout=2,
                ) as socket_connection:
                    logging.info("Connected to POS server at %s", websocket_url)
                    reconnect_delay = RECONNECT_DELAY_SECONDS
                    while True:
                        job = json.loads(socket_connection.recv())
                        process_job(base_url, token, printer_name, job, print_via_bin=print_via_bin)
            except KeyboardInterrupt:
                return
            except Exception:
                logging.exception("Print agent disconnected from %s", websocket_url)
                time.sleep(reconnect_delay)
                reconnect_delay = min(reconnect_delay * 2, 10)
    finally:
        stop_event.set()
        heartbeat.join(timeout=2)


def main():
    parser = argparse.ArgumentParser(description="Print receipts for one POS station")
    parser.add_argument("--config", default=os.getenv("POS_AGENT_CONFIG"))
    parser.add_argument("--server")
    parser.add_argument("--token")
    parser.add_argument("--printer")
    parser.add_argument(
        "--print-via-bin",
        action="store_true",
        help="Print raw receipt bytes via temporary .bin file and OS copy command instead of win32print API",
    )
    args = parser.parse_args()
    config = {}
    if args.config:
        config = load_agent_config(args.config)
        configure_agent_logging(args.config)
    server_url = args.server or config.get("serverUrl") or os.getenv("POS_SERVER_URL", "http://127.0.0.1:5000")
    token = args.token or config.get("agentToken") or os.getenv("POS_AGENT_TOKEN")
    printer_name = args.printer or os.getenv("POS_PRINTER_NAME")
    print_via_bin = (
        args.print_via_bin
        or bool(config.get("printViaBin"))
        or os.getenv("POS_PRINT_VIA_BIN", "").lower() in ("1", "true", "yes")
    )
    if not token:
        parser.error("Configure a station agent token with --config or pass --token")
    if not printer_name:
        try:
            printer_name = get_default_printer()
        except Exception as error:
            parser.error(f"Could not get this PC's default printer: {error}")
    try:
        server_url = validate_server_url(server_url)
    except ValueError as error:
        parser.error(str(error))
    run_agent(server_url, token, printer_name, print_via_bin=print_via_bin)


if __name__ == "__main__":
    main()