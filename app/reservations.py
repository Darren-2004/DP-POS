import sqlite3
import uuid
from datetime import datetime, timezone

from app.invoices import InvoiceError, _sync_client
from app.queries import _local_day_bounds
from app.print_jobs import UnknownStation


class ReservationError(Exception):
    def __init__(self, status_code, message):
        super().__init__(message)
        self.status_code = status_code


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _reservation_number(connection, now):
    prefix = f"RES-{now.astimezone().strftime('%Y%m%d')}-"
    rows = connection.execute(
        'SELECT reservationNo FROM "Reservation" WHERE reservationNo LIKE ?', (f"{prefix}%",)
    ).fetchall()
    sequence = 0
    for row in rows:
        try:
            sequence = max(sequence, int(row[0].rsplit("-", 1)[1]))
        except (IndexError, ValueError):
            continue
    while True:
        sequence += 1
        candidate = f"{prefix}{sequence:04d}"
        exists = connection.execute(
            'SELECT 1 FROM "Reservation" WHERE reservationNo = ?', (candidate,)
        ).fetchone()
        if not exists:
            return candidate


def _reservation_response(connection, reservation_id, include_updated=False):
    reservation = connection.execute(
        '''SELECT r.*, creator.name AS creatorName, updater.name AS updaterName
           FROM "Reservation" r
           LEFT JOIN "User" creator ON creator.id = r.createdById
           LEFT JOIN "User" updater ON updater.id = r.updatedById
           WHERE r.id = ?''',
        (reservation_id,),
    ).fetchone()
    if reservation is None:
        return None
    result = dict(reservation)
    creator_name = result.pop("creatorName")
    updater_name = result.pop("updaterName")
    result["createdBy"] = {"name": creator_name} if creator_name else None
    if include_updated:
        result["updatedBy"] = {"name": updater_name} if updater_name else None
    result["items"] = [
        dict(item)
        for item in connection.execute(
            'SELECT id, reservationId, categoryName, price, qty FROM "ReservationItem" WHERE reservationId = ?',
            (reservation_id,),
        ).fetchall()
    ]
    payment_rows = connection.execute(
        '''SELECT p.*, u.name AS creatorName FROM "ReservationPayment" p
           LEFT JOIN "User" u ON u.id = p.createdById
           WHERE p.reservationId = ? ORDER BY p.installmentNumber ASC''',
        (reservation_id,),
    ).fetchall()
    result["payments"] = []
    for payment in payment_rows:
        entry = dict(payment)
        payment_creator = entry.pop("creatorName")
        entry["createdBy"] = {"name": payment_creator} if payment_creator else None
        result["payments"].append(entry)
    result["totalPaid"] = sum(float(payment["amount"] or 0) for payment in result["payments"])
    result["remainingBalance"] = max(0, float(result["totalAmount"] or 0) - result["totalPaid"])
    return result


def list_reservations(store, query):
    clauses = []
    parameters = []
    month = query.get("month")
    if month:
        pattern = f"{month}%"
        clauses.append('(r.scheduledAt LIKE ? OR (r.scheduledAt IS NULL AND r.createdAt LIKE ?))')
        parameters.extend((pattern, pattern))
    elif query.get("date"):
        target_date = str(query["date"]).strip()
        date_pattern = f"{target_date}%"
        bounds = _local_day_bounds(target_date)
        if bounds:
            clauses.append('(r.scheduledAt LIKE ? OR (r.scheduledAt IS NULL AND r.createdAt BETWEEN ? AND ?))')
            parameters.extend((date_pattern, bounds[0], bounds[1]))
        else:
            clauses.append('(r.scheduledAt LIKE ? OR (r.scheduledAt IS NULL AND r.createdAt LIKE ?))')
            parameters.extend((date_pattern, date_pattern))
    elif query.get("startDate") and query.get("endDate"):
        start = _local_day_bounds(query["startDate"])
        end = _local_day_bounds(query["endDate"])
        if start and end:
            clauses.append('(r.scheduledAt BETWEEN ? AND ? OR (r.scheduledAt IS NULL AND r.createdAt BETWEEN ? AND ?))')
            parameters.extend((query["startDate"], query["endDate"] + "T23:59:59", start[0], end[1]))

    for field in ("status", "cashierId", "shopType"):
        if query.get(field):
            if field == "shopType" and query[field] == "ALL":
                continue
            column = "createdById" if field == "cashierId" else field
            clauses.append(f'r."{column}" = ?')
            parameters.append(query[field])

    search = str(query.get("q") or "").strip()
    if search:
        pattern = f"%{search}%"
        clauses.append("(r.clientName LIKE ? OR r.reservationNo LIKE ? OR r.clientPhone LIKE ? OR r.serviceName LIKE ?)")
        parameters.extend((pattern, pattern, pattern, pattern))

    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    with store._connect() as connection:
        rows = connection.execute(
            f'SELECT r.id FROM "Reservation" r{where} ORDER BY COALESCE(r.scheduledAt, r.createdAt) ASC', parameters
        ).fetchall()
        return [_reservation_response(connection, row["id"], include_updated=True) for row in rows]


def create_reservation(store, body):
    client_name = str(body.get("clientName") or "").strip()
    created_by_id = body.get("createdById")
    if not client_name or not created_by_id:
        raise ReservationError(400, "Le nom du client et l'utilisateur sont requis")

    raw_items = body.get("items") or []
    service_name = str(body.get("serviceName") or "").strip()
    total_amount = float(body.get("totalAmount") or 0)

    if not raw_items and service_name:
        raw_items = [{"categoryName": service_name, "price": total_amount, "qty": 1}]

    try:
        normalized_items = [
            (str(item.get("categoryName") or service_name or "Prestation"), float(item.get("price") or 0), int(item.get("qty") or 1))
            for item in raw_items
        ]
        if not total_amount and normalized_items:
            total_amount = sum(price * qty for _, price, qty in normalized_items)
    except (KeyError, TypeError, ValueError):
        raise ReservationError(400, "Informations de réservation invalides") from None

    scheduled_at = str(body.get("scheduledAt") or "").strip() or None
    booking_time = str(body.get("bookingTime") or "").strip() or None
    shop_type = str(body.get("shopType") or "FEMME").strip()
    notes = str(body.get("notes") or "").strip() or None
    initial_payment = body.get("initialPayment") or {}
    initial_amount = float(initial_payment.get("amount") or body.get("advanceAmount") or 0)

    connection = store._open_connection()
    try:
        connection.execute("BEGIN IMMEDIATE")
        now = datetime.now(timezone.utc)
        reservation_id = str(uuid.uuid4())
        reservation_no = _reservation_number(connection, now)
        created_at = now.isoformat(timespec="milliseconds").replace("+00:00", "Z")
        phone = str(body.get("clientPhone") or "").strip() or None
        connection.execute(
            '''INSERT INTO "Reservation" (
                id, reservationNo, clientName, clientPhone, scheduledAt, bookingTime, serviceName,
                shopType, notes, totalAmount, advanceAmount, status, createdAt,
                createdById, updatedAt, updatedById
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, NULL)''',
            (
                reservation_id, reservation_no, client_name, phone, scheduled_at, booking_time,
                service_name or (normalized_items[0][0] if normalized_items else "Prestation"),
                shop_type, notes, total_amount, initial_amount, created_at, created_by_id, created_at
            ),
        )
        for category_name, price, quantity in normalized_items:
            connection.execute(
                '''INSERT INTO "ReservationItem" (id, reservationId, categoryName, price, qty)
                   VALUES (?, ?, ?, ?, ?)''',
                (str(uuid.uuid4()), reservation_id, category_name, price, quantity),
            )

        if initial_amount > 0:
            connection.execute(
                '''INSERT INTO "ReservationPayment" (
                    id, reservationId, amount, paymentMethod, installmentNumber, createdAt, createdById
                ) VALUES (?, ?, ?, ?, 1, ?, ?)''',
                (
                    str(uuid.uuid4()), reservation_id, initial_amount,
                    initial_payment.get("paymentMethod") or "CASH", created_at, created_by_id,
                ),
            )
            if total_amount > 0 and initial_amount >= total_amount:
                connection.execute(
                    'UPDATE "Reservation" SET status = \'COMPLETED\', updatedAt = ? WHERE id = ?',
                    (created_at, reservation_id),
                )
        result = _reservation_response(connection, reservation_id)
        station_id = body.get("stationId")
        if station_id and initial_amount > 0:
            print_job = store.enqueue_in_transaction(
                connection,
                station_id,
                {"reservation": result},
                reservation_id,
                f"reservation:{reservation_id}:initial",
            )
            print_job["stationId"] = station_id
            result["printJob"] = print_job
        connection.commit()
    except UnknownStation as error:
        if connection.in_transaction:
            connection.rollback()
        raise ReservationError(400, str(error)) from error
    except sqlite3.IntegrityError as error:
        if connection.in_transaction:
            connection.rollback()
        raise ReservationError(500, "Erreur lors de la création de la réservation") from error
    finally:
        connection.close()

    try:
        _sync_client(store.database_path, client_name, phone)
    except sqlite3.Error:
        pass
    return result


def add_reservation_payment(store, reservation_id, body):
    try:
        amount = float(body.get("amount") or 0)
    except (TypeError, ValueError):
        amount = 0
    created_by_id = body.get("createdById")
    if amount <= 0 or not created_by_id:
        raise ReservationError(400, "Montant et utilisateur requis")

    connection = store._open_connection()
    try:
        connection.execute("BEGIN IMMEDIATE")
        reservation = connection.execute(
            'SELECT * FROM "Reservation" WHERE id = ?', (reservation_id,)
        ).fetchone()
        if reservation is None:
            raise ReservationError(404, "Réservation non trouvée")
        if reservation["status"] == "CANCELLED":
            raise ReservationError(400, "Réservation annulée")
        payments = connection.execute(
            'SELECT amount FROM "ReservationPayment" WHERE reservationId = ? ORDER BY installmentNumber',
            (reservation_id,),
        ).fetchall()
        current_paid = sum(float(payment["amount"] or 0) for payment in payments)
        remaining = float(reservation["totalAmount"]) - current_paid
        if remaining > 0 and amount > remaining + 0.01:
            raise ReservationError(400, f"Le montant saisi ({body.get('amount')} FCFA) dépasse le solde restant ({remaining} FCFA)")
        now = _now()
        connection.execute(
            '''INSERT INTO "ReservationPayment" (
                id, reservationId, amount, paymentMethod, installmentNumber, createdAt, createdById
            ) VALUES (?, ?, ?, ?, ?, ?, ?)''',
            (
                str(uuid.uuid4()), reservation_id, amount, body.get("paymentMethod") or "CASH",
                len(payments) + 1, now, created_by_id,
            ),
        )
        if reservation["totalAmount"] > 0 and current_paid + amount >= float(reservation["totalAmount"]) - 0.01:
            connection.execute(
                'UPDATE "Reservation" SET status = \'COMPLETED\', updatedAt = ? WHERE id = ?',
                (now, reservation_id),
            )
        result = _reservation_response(connection, reservation_id)
        station_id = body.get("stationId")
        if station_id:
            print_job = store.enqueue_in_transaction(
                connection,
                station_id,
                {"reservation": result},
                reservation_id,
                f"reservation-payment:{reservation_id}:{len(payments) + 1}",
            )
            print_job["stationId"] = station_id
            result["printJob"] = print_job
        connection.commit()
        return result
    except UnknownStation as error:
        raise ReservationError(400, str(error)) from error
    finally:
        if connection.in_transaction:
            connection.rollback()
        connection.close()


def update_reservation(store, reservation_id, body):
    if not body.get("clientName") and not body.get("clientPhone"):
        raise ReservationError(400, "Le nom du client ou son numéro de téléphone doit être renseigné")
    connection = store._open_connection()
    try:
        connection.execute("BEGIN IMMEDIATE")
        existing = connection.execute(
            'SELECT * FROM "Reservation" WHERE id = ?', (reservation_id,)
        ).fetchone()
        if existing is None:
            raise ReservationError(404, "Réservation non trouvée")
        if existing["status"] == "CANCELLED":
            raise ReservationError(400, "Réservation annulée")
        payments = connection.execute(
            'SELECT amount FROM "ReservationPayment" WHERE reservationId = ? ORDER BY installmentNumber',
            (reservation_id,),
        ).fetchall()
        try:
            total_amount = float(body.get("totalAmount") if body.get("totalAmount") is not None else existing["totalAmount"])
            raw_items = body.get("items") or []
            service_name = str(body.get("serviceName") or existing.get("serviceName") or "").strip()
            if not raw_items and service_name:
                raw_items = [{"categoryName": service_name, "price": total_amount, "qty": 1}]
            normalized_items = [
                (str(item.get("categoryName") or service_name or "Prestation"), float(item.get("price") or 0), int(item.get("qty") or 1))
                for item in raw_items
            ]
        except (KeyError, TypeError, ValueError):
            raise ReservationError(500, "Erreur lors de la mise à jour de la réservation") from None
        now = _now()
        connection.execute('DELETE FROM "ReservationItem" WHERE reservationId = ?', (reservation_id,))
        for category_name, price, quantity in normalized_items:
            connection.execute(
                'INSERT INTO "ReservationItem" (id, reservationId, categoryName, price, qty) VALUES (?, ?, ?, ?, ?)',
                (str(uuid.uuid4()), reservation_id, category_name, price, quantity),
            )
        client_name = str(body.get("clientName") or existing["clientName"]).strip()
        client_phone = str(body.get("clientPhone") or existing["clientPhone"] or "").strip() or None
        scheduled_at = str(body.get("scheduledAt") or existing.get("scheduledAt") or "").strip() or None
        booking_time = str(body.get("bookingTime") or existing.get("bookingTime") or "").strip() or None
        shop_type = str(body.get("shopType") or existing.get("shopType") or "FEMME").strip()
        notes = str(body.get("notes") or existing.get("notes") or "").strip() or None
        status = str(body.get("status") or existing["status"]).strip()

        connection.execute(
            '''UPDATE "Reservation" SET clientName = ?, clientPhone = ?, scheduledAt = ?,
               bookingTime = ?, serviceName = ?, shopType = ?, notes = ?, totalAmount = ?,
               status = ?, updatedById = ?, updatedAt = ? WHERE id = ?''',
            (client_name, client_phone, scheduled_at, booking_time, service_name, shop_type, notes, total_amount, status, body.get("createdById"), now, reservation_id),
        )
        new_payment = body.get("newPayment") or {}
        amount = float(new_payment.get("amount") or 0)
        if amount > 0:
            connection.execute(
                '''INSERT INTO "ReservationPayment" (
                    id, reservationId, amount, paymentMethod, installmentNumber, createdAt, createdById
                ) VALUES (?, ?, ?, ?, ?, ?, ?)''',
                (
                    str(uuid.uuid4()), reservation_id, amount, new_payment.get("paymentMethod") or "CASH",
                    len(payments) + 1, now, body.get("createdById") or existing["createdById"],
                ),
            )
        result = _reservation_response(connection, reservation_id, include_updated=True)
        station_id = body.get("stationId")
        if amount > 0 and station_id:
            print_job = store.enqueue_in_transaction(
                connection,
                station_id,
                {"reservation": result},
                reservation_id,
                f"reservation-payment:{reservation_id}:{len(payments) + 1}",
            )
            print_job["stationId"] = station_id
            result["printJob"] = print_job
        connection.commit()
    except UnknownStation as error:
        if connection.in_transaction:
            connection.rollback()
        raise ReservationError(400, str(error)) from error
    except sqlite3.IntegrityError as error:
        if connection.in_transaction:
            connection.rollback()
        raise ReservationError(500, "Erreur lors de la mise à jour de la réservation") from error
    except Exception:
        if connection.in_transaction:
            connection.rollback()
        raise
    finally:
        connection.close()

    try:
        _sync_client(store.database_path, client_name, client_phone)
    except sqlite3.Error:
        pass
    return result


def cancel_reservation(store, reservation_id):
    with store._connect() as connection:
        cursor = connection.execute(
            'UPDATE "Reservation" SET status = \'CANCELLED\', updatedAt = ? WHERE id = ?',
            (_now(), reservation_id),
        )
        if cursor.rowcount == 0:
            raise ReservationError(500, "Erreur lors de l'annulation de la réservation")
        return _reservation_response(connection, reservation_id)


def delete_reservation(store, reservation_id):
    with store._connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        exists = connection.execute('SELECT 1 FROM "Reservation" WHERE id = ?', (reservation_id,)).fetchone()
        if exists is None:
            raise ReservationError(500, "Erreur lors de la suppression de la réservation")
        connection.execute('DELETE FROM "ReservationItem" WHERE reservationId = ?', (reservation_id,))
        connection.execute('DELETE FROM "ReservationPayment" WHERE reservationId = ?', (reservation_id,))
        connection.execute('DELETE FROM "Reservation" WHERE id = ?', (reservation_id,))
    return {"success": True, "message": "Réservation supprimée définitivement."}


def create_reservation_invoice(store, reservation_id, created_by_id=None, station_id=None):
    connection = store._open_connection()
    try:
        connection.execute("BEGIN IMMEDIATE")
        reservation = connection.execute(
            'SELECT * FROM "Reservation" WHERE id = ?', (reservation_id,)
        ).fetchone()
        if reservation is None:
            raise ReservationError(404, "Réservation non trouvée")
        existing = connection.execute(
            'SELECT id FROM "Invoice" WHERE reservationNo = ?', (reservation["reservationNo"],)
        ).fetchone()
        if existing:
            invoice = _invoice_from_connection(connection, existing["id"])
            connection.commit()
            return invoice

        payments = connection.execute(
            'SELECT * FROM "ReservationPayment" WHERE reservationId = ? ORDER BY installmentNumber',
            (reservation_id,),
        ).fetchall()
        last_payment_method = payments[-1]["paymentMethod"] if payments else "CASH"
        now = datetime.now(timezone.utc)
        prefix = f"FAC-RES-{now.astimezone().strftime('%Y%m%d')}-"
        number_rows = connection.execute(
            'SELECT invoiceNumber FROM "Invoice" WHERE invoiceNumber LIKE ?', (f"{prefix}%",)
        ).fetchall()
        sequence = 0
        for row in number_rows:
            try:
                sequence = max(sequence, int(row[0].rsplit("-", 1)[1]))
            except (IndexError, ValueError):
                continue
        while True:
            sequence += 1
            invoice_number = f"{prefix}{sequence:04d}"
            found = connection.execute(
                'SELECT 1 FROM "Invoice" WHERE invoiceNumber = ?', (invoice_number,)
            ).fetchone()
            if not found:
                break

        invoice_id = str(uuid.uuid4())
        creator_id = created_by_id or reservation["createdById"]
        created_at = now.isoformat(timespec="milliseconds").replace("+00:00", "Z")
        connection.execute(
            '''INSERT INTO "Invoice" (
                id, invoiceNumber, totalAmount, paymentMethod, clientName, clientPhone, shopType,
                isReservation, reservationNo, isDelivery, deliveryFee, isPaid, status, createdAt, createdById
            ) VALUES (?, ?, ?, ?, ?, NULL, ?, 1, ?, 0, 0, 0, 'VALIDATED', ?, ?)''',
            (
                invoice_id, invoice_number, reservation["totalAmount"], last_payment_method,
                reservation["clientName"], reservation.get("shopType") or "FEMME", reservation["reservationNo"],
                created_at, creator_id,
            ),
        )
        reservation_items = connection.execute(
            'SELECT categoryName, price, COALESCE(qty, 1) AS qty FROM "ReservationItem" WHERE reservationId = ?', (reservation_id,)
        ).fetchall()
        for item in reservation_items:
            connection.execute(
                'INSERT INTO "InvoiceItem" (id, invoiceId, categoryName, price, qty, itemType) VALUES (?, ?, ?, ?, ?, ?)',
                (str(uuid.uuid4()), invoice_id, item["categoryName"], item["price"], item["qty"], "SERVICE"),
            )
        invoice = _invoice_from_connection(connection, invoice_id)
        invoice["reservationPayments"] = [dict(payment) for payment in payments]
        invoice["sourceReservationNo"] = reservation["reservationNo"]
        invoice["clientPhone"] = reservation["clientPhone"]
        if station_id:
            print_job = store.enqueue_in_transaction(
                connection,
                station_id,
                {"invoiceData": invoice},
                invoice_id,
                f"reservation-invoice:{invoice_id}",
            )
            print_job["stationId"] = station_id
            invoice["printJob"] = print_job
        connection.commit()
        return invoice
    except UnknownStation as error:
        if connection.in_transaction:
            connection.rollback()
        raise ReservationError(400, str(error)) from error
    except sqlite3.IntegrityError as error:
        if connection.in_transaction:
            connection.rollback()
        raise ReservationError(500, "Erreur lors de la création de la facture définitive") from error
    except Exception:
        if connection.in_transaction:
            connection.rollback()
        raise
    finally:
        connection.close()


def _invoice_from_connection(connection, invoice_id):
    invoice = connection.execute(
        '''SELECT i.*, u.name AS creatorName FROM "Invoice" i
           LEFT JOIN "User" u ON u.id = i.createdById WHERE i.id = ?''',
        (invoice_id,),
    ).fetchone()
    result = dict(invoice)
    creator_name = result.pop("creatorName")
    result["createdBy"] = {"name": creator_name} if creator_name else None
    result["items"] = [
        dict(item)
        for item in connection.execute(
            '''SELECT id, invoiceId, categoryName, price, COALESCE(qty, 1) AS qty, COALESCE(itemType, 'SERVICE') AS itemType
               FROM "InvoiceItem" WHERE invoiceId = ?''', (invoice_id,)
        ).fetchall()
    ]
    return result


def reservation_payments(store, query):
    clauses = ["r.status != 'CANCELLED'"]
    parameters = []
    if query.get("date"):
        bounds = _local_day_bounds(query["date"])
        if bounds:
            clauses.append('p.createdAt BETWEEN ? AND ?')
            parameters.extend(bounds)
    if query.get("cashierId"):
        clauses.append('p.createdById = ?')
        parameters.append(query["cashierId"])
    where = " AND ".join(clauses)
    with store._connect() as connection:
        rows = connection.execute(
            f'''SELECT p.*, r.reservationNo, r.clientName, u.name AS creatorName
                FROM "ReservationPayment" p
                JOIN "Reservation" r ON r.id = p.reservationId
                LEFT JOIN "User" u ON u.id = p.createdById
                WHERE {where} ORDER BY p.createdAt DESC''',
            parameters,
        ).fetchall()
    result = []
    for row in rows:
        payment = dict(row)
        reservation_no = payment.pop("reservationNo")
        client_name = payment.pop("clientName")
        creator_name = payment.pop("creatorName")
        payment["reservation"] = {"reservationNo": reservation_no, "clientName": client_name}
        payment["createdBy"] = {"name": creator_name} if creator_name else None
        result.append(payment)
    return result
