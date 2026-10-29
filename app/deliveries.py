import sqlite3
import uuid
from datetime import datetime, timezone

from app.invoices import _sync_client
from app.queries import _local_day_bounds


class DeliveryError(Exception):
    def __init__(self, status_code, message):
        super().__init__(message)
        self.status_code = status_code


VALID_DELIVERY_STATUSES = {"PENDING", "IN_DELIVERY", "DELIVERED", "CANCELLED"}


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _upsert_person(connection, name, phone=None):
    if not isinstance(name, str) or not name.strip():
        return None
    clean_name = name.strip()
    clean_phone = str(phone or "").strip() or None
    existing = connection.execute(
        'SELECT id, name, phone, createdAt, updatedAt FROM "DeliveryPerson" WHERE name = ?', (clean_name,)
    ).fetchone()
    now = _now()
    if existing:
        if clean_phone and existing["phone"] != clean_phone:
            connection.execute(
                'UPDATE "DeliveryPerson" SET phone = ?, updatedAt = ? WHERE id = ?',
                (clean_phone, now, existing["id"]),
            )
            return {**dict(existing), "phone": clean_phone, "updatedAt": now}
        return dict(existing)
    person = {"id": str(uuid.uuid4()), "name": clean_name, "phone": clean_phone, "createdAt": now, "updatedAt": now}
    connection.execute(
        'INSERT INTO "DeliveryPerson" (id, name, phone, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
        (person["id"], person["name"], person["phone"], now, now),
    )
    return person


def list_delivery_persons(store):
    with store._connect() as connection:
        rows = connection.execute('SELECT * FROM "DeliveryPerson" ORDER BY name ASC').fetchall()
    return [dict(row) for row in rows]


def upsert_delivery_person(store, name, phone=None):
    clean_name = str(name or "").strip()
    if not clean_name:
        raise DeliveryError(400, "Le nom du livreur est requis")
    try:
        with store._connect() as connection:
            return _upsert_person(connection, clean_name, phone)
    except sqlite3.IntegrityError as error:
        raise DeliveryError(500, "Erreur lors de l'enregistrement du livreur") from error


def _delivery_response(connection, invoice_id):
    row = connection.execute(
        '''SELECT i.*, u.id AS creatorId, u.name AS creatorName
           FROM "Invoice" i LEFT JOIN "User" u ON u.id = i.createdById
           WHERE i.id = ?''',
        (invoice_id,),
    ).fetchone()
    if row is None:
        return None
    invoice = dict(row)
    creator_id = invoice.pop("creatorId")
    creator_name = invoice.pop("creatorName")
    for field in ("isReservation", "isDelivery", "isPaid"):
        if field in invoice:
            invoice[field] = bool(invoice[field])
    invoice["createdBy"] = {"id": creator_id, "name": creator_name} if creator_id else None
    invoice["items"] = [
        dict(item)
        for item in connection.execute(
            'SELECT id, invoiceId, categoryName, price FROM "InvoiceItem" WHERE invoiceId = ?',
            (invoice_id,),
        ).fetchall()
    ]
    return invoice


def list_deliveries(store, query):
    clauses = ["COALESCE(i.isDelivery, 0) = 1"]
    parameters = []
    status = query.get("status")
    if status and status != "ALL":
        clauses.append("i.deliveryStatus = ?")
        parameters.append(status)
    driver = query.get("driver")
    if driver and driver != "ALL":
        clauses.append("i.deliveryPerson = ?")
        parameters.append(driver)
    if query.get("date"):
        bounds = _local_day_bounds(query["date"])
        if bounds:
            clauses.append("i.createdAt BETWEEN ? AND ?")
            parameters.extend(bounds)
    elif query.get("startDate") and query.get("endDate"):
        start = _local_day_bounds(query["startDate"])
        end = _local_day_bounds(query["endDate"])
        if start and end:
            clauses.append("i.createdAt BETWEEN ? AND ?")
            parameters.extend((start[0], end[1]))

    cashier_id = query.get("cashierId")
    if cashier_id:
        with store._connect() as connection:
            cashier = connection.execute('SELECT name FROM "User" WHERE id = ?', (cashier_id,)).fetchone()
        if cashier and cashier["name"]:
            clauses.append("(i.createdById = ? OR i.deliveryPerson LIKE ?)")
            parameters.extend((cashier_id, f"%{cashier['name']}%"))
        else:
            clauses.append("i.createdById = ?")
            parameters.append(cashier_id)

    search = str(query.get("q") or "").strip()
    if search:
        pattern = f"%{search}%"
        clauses.append("(i.clientName LIKE ? OR i.clientPhone LIKE ? OR i.deliveryNo LIKE ? OR i.deliveryAddress LIKE ? OR i.deliveryPerson LIKE ? OR i.invoiceNumber LIKE ?)")
        parameters.extend((pattern, pattern, pattern, pattern, pattern, pattern))

    with store._connect() as connection:
        rows = connection.execute(
            f'''SELECT i.id FROM "Invoice" i WHERE {' AND '.join(clauses)}
                ORDER BY i.createdAt DESC''',
            parameters,
        ).fetchall()
        return [_delivery_response(connection, row["id"]) for row in rows]


def _update_values(body):
    status = body.get("status")
    action = body.get("action")
    is_paid = body.get("isPaid") is True
    values = {}
    if action == "PAY" or is_paid:
        values["isPaid"] = 1
        values["paidAt"] = _now()
        if body.get("paymentMethod"):
            values["paymentMethod"] = body["paymentMethod"]

    if action == "UNASSIGN":
        values["deliveryPerson"] = None
        values["deliveryStatus"] = "PENDING"
    elif action == "ASSIGN_DRIVER_ONLY":
        if body.get("deliveryPerson"):
            values["deliveryPerson"] = str(body["deliveryPerson"]).strip()
    elif status:
        if status not in VALID_DELIVERY_STATUSES:
            raise DeliveryError(400, "Statut de livraison invalide")
        values["deliveryStatus"] = status
        if "deliveryPerson" in body:
            values["deliveryPerson"] = str(body["deliveryPerson"]).strip() or None
        if status == "DELIVERED":
            values["deliveredAt"] = _now()
            values["isPaid"] = 1
            values.setdefault("paidAt", _now())
            if body.get("paymentMethod"):
                values["paymentMethod"] = body["paymentMethod"]
        elif status == "CANCELLED":
            values["status"] = "CANCELLED"
    return values


def update_delivery(store, invoice_id, body):
    values = _update_values(body)
    with store._connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        invoice = connection.execute(
            'SELECT id, isDelivery, clientName, clientPhone FROM "Invoice" WHERE id = ?', (invoice_id,)
        ).fetchone()
        if invoice is None:
            raise DeliveryError(500, "Erreur lors de la mise à jour de la livraison")
        if values:
            assignments = ", ".join(f'"{column}" = ?' for column in values)
            connection.execute(
                f'UPDATE "Invoice" SET {assignments} WHERE id = ?', (*values.values(), invoice_id)
            )
        driver_name = values.get("deliveryPerson")
        if driver_name:
            try:
                _upsert_person(connection, driver_name)
            except sqlite3.Error:
                pass
        updated = _delivery_response(connection, invoice_id)
    if invoice["clientName"] or invoice["clientPhone"]:
        try:
            _sync_client(store.database_path, invoice["clientName"], invoice["clientPhone"])
        except sqlite3.Error:
            pass
    return updated


def update_deliveries_bulk(store, body):
    ids = body.get("ids")
    if not isinstance(ids, list) or not ids:
        raise DeliveryError(400, "Liste d'identifiants requise")
    values = _update_values(body)
    with store._connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        if values:
            placeholders = ",".join("?" for _ in ids)
            assignments = ", ".join(f'"{column}" = ?' for column in values)
            connection.execute(
                f'UPDATE "Invoice" SET {assignments} WHERE id IN ({placeholders}) AND isDelivery = 1',
                (*values.values(), *ids),
            )
        driver_name = values.get("deliveryPerson")
        if driver_name:
            try:
                _upsert_person(connection, driver_name)
            except sqlite3.Error:
                pass
        placeholders = ",".join("?" for _ in ids)
        rows = connection.execute(
            f'SELECT id FROM "Invoice" WHERE id IN ({placeholders})', ids
        ).fetchall()
        deliveries = [_delivery_response(connection, row["id"]) for row in rows]

    for delivery in deliveries:
        if delivery["clientName"] or delivery["clientPhone"]:
            try:
                _sync_client(store.database_path, delivery["clientName"], delivery["clientPhone"])
            except sqlite3.Error:
                pass
    return {"message": f"{len(deliveries)} livraison(s) mise(s) à jour", "deliveries": deliveries}