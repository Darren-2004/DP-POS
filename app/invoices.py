import re
import sqlite3
import uuid
from datetime import datetime, timezone

from app.print_jobs import UnknownStation
from app.queries import get_invoice_with_relations
from app.schema import ensure_schema


class InvoiceError(Exception):
    def __init__(self, status_code, message):
        super().__init__(message)
        self.status_code = status_code


def _invoice_number(connection, prefix, delivery=False):
    if delivery:
        rows = connection.execute(
            'SELECT invoiceNumber, deliveryNo FROM "Invoice" WHERE invoiceNumber LIKE ? OR deliveryNo LIKE ?',
            (f"{prefix}%", f"{prefix}%"),
        ).fetchall()
        candidates = [value for row in rows for value in row if value and value.startswith(prefix)]
    else:
        rows = connection.execute(
            'SELECT invoiceNumber FROM "Invoice" WHERE invoiceNumber LIKE ?', (f"{prefix}%",)
        ).fetchall()
        candidates = [row[0] for row in rows]

    sequence = 0
    for candidate in candidates:
        try:
            sequence = max(sequence, int(candidate.rsplit("-", 1)[1]))
        except (IndexError, ValueError):
            continue

    while True:
        sequence += 1
        candidate = f"{prefix}{sequence:04d}"
        exists = connection.execute(
            'SELECT 1 FROM "Invoice" WHERE invoiceNumber = ? OR deliveryNo = ? LIMIT 1',
            (candidate, candidate),
        ).fetchone()
        if not exists:
            return candidate


def _client_parts(raw_name, raw_phone):
    name = str(raw_name or "").strip()
    phone = str(raw_phone or "").strip()
    match = re.fullmatch(r"(.+?)\s*\((.+?)\)", name)
    if match:
        name = match.group(1).strip()
        if not phone:
            phone = match.group(2).strip()
    if not name or name.lower() in {"client de passage", "client anonyme"}:
        return None
    return name, phone or None


def _sync_client(database_path, raw_name, raw_phone):
    parts = _client_parts(raw_name, raw_phone)
    if not parts:
        return
    name, phone = parts
    connection = sqlite3.connect(database_path, timeout=5)
    try:
        connection.execute("PRAGMA busy_timeout = 5000")
        now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        existing = connection.execute('SELECT id, phone FROM "Client" WHERE name = ?', (name,)).fetchone()
        if existing:
            if phone and phone != existing[1]:
                connection.execute('UPDATE "Client" SET phone = ?, updatedAt = ? WHERE id = ?', (phone, now, existing[0]))
        else:
            connection.execute(
                'INSERT INTO "Client" (id, name, phone, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
                (str(uuid.uuid4()), name, phone, now, now),
            )
        connection.commit()
    except sqlite3.Error:
        connection.rollback()
    finally:
        connection.close()


def create_invoice(print_store, body, actor=None):
    items = body.get("items")
    created_by_id = body.get("createdById")
    station_id = body.get("stationId")
    is_delivery = bool(body.get("isDelivery"))
    if not isinstance(items, list) or not items or not created_by_id:
        raise InvoiceError(400, "Données de la facture incomplètes")
    if is_delivery and not str(body.get("clientName") or "").strip() and not str(body.get("clientPhone") or "").strip():
        raise InvoiceError(400, "Pour une livraison, au moins le nom ou le téléphone du client est requis")

    try:
        total_amount = float(body.get("totalAmount"))
        item_values = [
            (
                str(item.get("categoryName") or "Article"),
                float(item.get("price") or 0),
                int(item.get("qty") or 1),
                str(item.get("itemType") or "SERVICE").upper(),
                str(item.get("providerId") or "").strip() or None,
            )
            for item in items
        ]
    except (KeyError, TypeError, ValueError):
        raise InvoiceError(400, "Données de la facture invalides") from None

    connection = print_store._open_connection()
    try:
        ensure_schema(connection)
        connection.execute("BEGIN IMMEDIATE")
        creator = connection.execute(
            'SELECT id, name, role, shopType FROM "User" WHERE id = ?', (created_by_id,)
        ).fetchone()
        if creator is None:
            raise InvoiceError(400, "Caissier introuvable")

        shop_type = str(body.get("shopType") or "FEMME").strip()
        if shop_type not in {"HOMME", "FEMME"}:
            raise InvoiceError(400, "Salon invalide")
        if creator["role"] in {"CASHIER", "MANAGER"} and creator["shopType"] in {"HOMME", "FEMME"}:
            shop_type = creator["shopType"]

        provider_ids = [provider_id for _, _, _, item_type, provider_id in item_values if provider_id]
        if provider_ids:
            if not actor or actor.get("id") != created_by_id:
                raise InvoiceError(401, "Authentification requise pour attribuer un prestataire")
            if creator["role"] in {"CASHIER", "MANAGER"} and creator["shopType"] not in {"HOMME", "FEMME"}:
                raise InvoiceError(403, "Aucun salon n'est assigné à ce compte")

        providers = {}
        for _, _, _, item_type, provider_id in item_values:
            if not provider_id:
                continue
            if item_type != "SERVICE":
                raise InvoiceError(400, "Un prestataire ne peut être attribué qu'à une prestation")
            provider = connection.execute(
                'SELECT id, name, shopType FROM "ServiceProvider" WHERE id = ?', (provider_id,)
            ).fetchone()
            if provider is None or provider["shopType"] != shop_type:
                raise InvoiceError(400, "Ce prestataire n'appartient pas au salon de la facture")
            providers[provider_id] = provider

        local_now = datetime.now().astimezone()
        date_prefix = local_now.strftime("%Y%m%d")
        if is_delivery:
            number = _invoice_number(connection, f"LIV-{date_prefix}-", delivery=True)
        else:
            number = _invoice_number(connection, f"FAC-{date_prefix}-")

        invoice_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        client_name = str(body.get("clientName") or "").strip() or None
        client_phone = str(body.get("clientPhone") or "").strip() or None
        delivery_address = str(body.get("deliveryAddress") or "").strip() or None
        delivery_fee = float(body.get("deliveryFee") or 0) if is_delivery else 0
        connection.execute(
            """INSERT INTO "Invoice" (
                   id, invoiceNumber, totalAmount, paymentMethod, clientName, clientPhone, shopType,
                   isReservation, isDelivery, deliveryNo, deliveryAddress, deliveryStatus,
                   deliveryFee, isPaid, status, createdAt, createdById
               ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0, 'VALIDATED', ?, ?)""",
            (
                invoice_id,
                number,
                total_amount,
                body.get("paymentMethod") or "CASH",
                client_name,
                client_phone,
                shop_type,
                1 if is_delivery else 0,
                number if is_delivery else None,
                delivery_address,
                "PENDING" if is_delivery else None,
                delivery_fee,
                created_at,
                created_by_id,
            ),
        )

        invoice_items = []
        for category_name, price, qty, item_type, provider_id in item_values:
            item_id = str(uuid.uuid4())
            provider_name = providers[provider_id]["name"] if provider_id else None
            connection.execute(
                '''INSERT INTO "InvoiceItem" (
                       id, invoiceId, categoryName, price, qty, itemType, providerId, providerName
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                (item_id, invoice_id, category_name, price, qty, item_type, provider_id, provider_name),
            )
            if item_type == "PRODUCT":
                connection.execute(
                    'UPDATE "Product" SET stockQty = MAX(0, stockQty - ?) WHERE name = ?',
                    (qty, category_name),
                )
            invoice_items.append({
                "id": item_id,
                "invoiceId": invoice_id,
                "categoryName": category_name,
                "price": price,
                "qty": qty,
                "itemType": item_type,
                "providerId": provider_id,
                "providerName": provider_name,
            })

        invoice = {
            "id": invoice_id,
            "invoiceNumber": number,
            "totalAmount": total_amount,
            "paymentMethod": body.get("paymentMethod") or "CASH",
            "clientName": client_name,
            "clientPhone": client_phone,
            "shopType": shop_type,
            "isReservation": False,
            "isDelivery": is_delivery,
            "deliveryNo": number if is_delivery else None,
            "deliveryAddress": delivery_address,
            "deliveryStatus": "PENDING" if is_delivery else None,
            "deliveryFee": delivery_fee,
            "isPaid": False,
            "status": "VALIDATED",
            "createdAt": created_at,
            "createdById": created_by_id,
            "createdBy": {"name": creator["name"]},
            "items": invoice_items,
        }
        print_job = None
        if station_id:
            print_job = print_store.enqueue_in_transaction(
                connection,
                station_id,
                {"invoiceData": invoice},
                invoice_id,
                f"invoice:{invoice_id}",
            )
            print_job["stationId"] = station_id
        connection.commit()
    except UnknownStation as error:
        connection.rollback()
        raise InvoiceError(400, str(error)) from error
    except sqlite3.IntegrityError as error:
        connection.rollback()
        raise InvoiceError(400, "La facture n'a pas pu être enregistrée") from error
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()

    invoice["printJob"] = print_job
    try:
        _sync_client(print_store.database_path, client_name, client_phone)
    except sqlite3.Error:
        pass
    return invoice


def cancel_invoice(print_store, invoice_id, actor, pin, cancellation_reason, shop_type=None):
    reason = str(cancellation_reason or "").strip()
    if not isinstance(actor, dict) or not actor.get("id"):
        raise InvoiceError(401, "Authentification requise")
    if actor.get("role") not in {"ADMIN", "MANAGER"}:
        raise InvoiceError(403, "Seul un administrateur ou un gérant peut annuler une facture")
    if actor["role"] == "MANAGER" and shop_type not in {"HOMME", "FEMME"}:
        raise InvoiceError(403, "Aucun shop n'est assigné à ce gérant")
    if not str(pin or "").strip() or not reason:
        if actor["role"] == "MANAGER":
            raise InvoiceError(400, "Veuillez saisir le code PIN du gérant et le motif d'annulation.")
        raise InvoiceError(400, "Veuillez saisir le code PIN administrateur et le motif d'annulation.")

    connection = print_store._open_connection()
    try:
        connection.execute("BEGIN IMMEDIATE")
        user = connection.execute(
            'SELECT pin, role FROM "User" WHERE id = ?', (actor["id"],)
        ).fetchone()
        if user is None or user["role"] != actor["role"]:
            raise InvoiceError(401, "Le compte connecté est introuvable ou a changé de rôle")
        from app.auth import verify_pin
        if not verify_pin(str(pin).strip(), user["pin"]):
            if actor["role"] == "MANAGER":
                raise InvoiceError(401, "Code PIN du gérant connecté incorrect")
            raise InvoiceError(401, "Code PIN administrateur incorrect")
        invoice = connection.execute(
            'SELECT status, shopType FROM "Invoice" WHERE id = ?', (invoice_id,)
        ).fetchone()
        if invoice is None:
            raise InvoiceError(404, "Facture non trouvée")
        if actor["role"] == "MANAGER" and invoice["shopType"] != shop_type:
            raise InvoiceError(403, "Cette facture ne fait pas partie de votre shop")
        if invoice["status"] == "CANCELLED":
            raise InvoiceError(400, "Cette facture est déjà annulée")
        columns = {
            row["name"] for row in connection.execute('PRAGMA table_info("Invoice")')
        }
        cancelled_at_update = ", cancelledAt = ?" if "cancelledAt" in columns else ""
        parameters = ["CANCELLED", reason, actor["id"]]
        if cancelled_at_update:
            parameters.append(datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"))
        parameters.append(invoice_id)
        connection.execute(
            f'''UPDATE "Invoice" SET status = ?, cancellationReason = ?, cancelledById = ?
                {cancelled_at_update} WHERE id = ?''',
            parameters,
        )
        product_items = connection.execute(
            'SELECT categoryName, qty FROM "InvoiceItem" WHERE invoiceId = ? AND itemType = \'PRODUCT\'',
            (invoice_id,),
        ).fetchall()
        for p_item in product_items:
            connection.execute(
                'UPDATE "Product" SET stockQty = stockQty + ? WHERE name = ?',
                (int(p_item["qty"] or 1), p_item["categoryName"]),
            )
        updated = get_invoice_with_relations(connection, invoice_id)
        connection.commit()
        return updated
    except Exception:
        if connection.in_transaction:
            connection.rollback()
        raise
    finally:
        connection.close()
