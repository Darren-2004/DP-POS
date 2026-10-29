from datetime import datetime, time, timezone


def _local_day_bounds(value):
    try:
        day = datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None
    start = datetime.combine(day, time.min).astimezone(timezone.utc)
    end = datetime.combine(day, time.max).astimezone(timezone.utc)
    return (
        start.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        end.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
    )


def list_clients(store, query=""):
    search = str(query or "").strip()
    sql = 'SELECT id, name, phone, createdAt, updatedAt FROM "Client"'
    parameters = ()
    if search:
        sql += " WHERE name LIKE ? OR phone LIKE ?"
        pattern = f"%{search}%"
        parameters = (pattern, pattern)
    sql += " ORDER BY name ASC LIMIT 10"
    with store._connect() as connection:
        return [dict(row) for row in connection.execute(sql, parameters).fetchall()]


def client_stats(store, query=""):
    search = str(query or "").strip()
    sql = 'SELECT id, name, phone, createdAt, updatedAt FROM "Client"'
    parameters = ()
    if search:
        sql += " WHERE name LIKE ? OR phone LIKE ?"
        pattern = f"%{search}%"
        parameters = (pattern, pattern)
    sql += " ORDER BY name ASC"

    with store._connect() as connection:
        clients = connection.execute(sql, parameters).fetchall()
        enriched = []
        for client in clients:
            name = client["name"]
            invoices = connection.execute(
                """SELECT totalAmount, createdAt FROM "Invoice"
                   WHERE status = 'VALIDATED' AND COALESCE(isReservation, 0) = 0
                     AND (clientName = ? OR substr(clientName, 1, length(?) + 2) = ? || ' (')""",
                (name, name, name),
            ).fetchall()
            reservations = connection.execute(
                """SELECT id, totalAmount, createdAt FROM "Reservation"
                   WHERE status = 'COMPLETED' AND clientName = ?""",
                (name,),
            ).fetchall()
            pending = connection.execute(
                """SELECT r.id, r.createdAt, COALESCE(SUM(p.amount), 0) AS paid
                   FROM "Reservation" r LEFT JOIN "ReservationPayment" p ON p.reservationId = r.id
                   WHERE r.status = 'PENDING' AND r.clientName = ? GROUP BY r.id""",
                (name,),
            ).fetchall()
            dates = [row["createdAt"] for row in invoices + reservations + pending if row["createdAt"]]
            enriched.append({
                **dict(client),
                "invoiceCount": len(invoices),
                "reservationCount": len(reservations) + len(pending),
                "totalSpent": (
                    sum(float(row["totalAmount"] or 0) for row in invoices)
                    + sum(float(row["totalAmount"] or 0) for row in reservations)
                    + sum(float(row["paid"] or 0) for row in pending)
                ),
                "lastPurchaseAt": max(dates) if dates else None,
            })
        return enriched


def list_invoices(store, query):
    paginated = "page" in query or "pageSize" in query
    clauses = []
    parameters = []
    day = query.get("date")
    if day:
        bounds = _local_day_bounds(day)
        if bounds:
            clauses.append('i.createdAt BETWEEN ? AND ?')
            parameters.extend(bounds)
    elif query.get("startDate") and query.get("endDate"):
        start = _local_day_bounds(query["startDate"])
        end = _local_day_bounds(query["endDate"])
        if start and end:
            clauses.append('i.createdAt BETWEEN ? AND ?')
            parameters.extend((start[0], end[1]))

    cashier_id = query.get("cashierId")
    if cashier_id:
        with store._connect() as connection:
            cashier = connection.execute('SELECT name FROM "User" WHERE id = ?', (cashier_id,)).fetchone()
        if cashier and cashier["name"]:
            clauses.append('(i.createdById = ? OR i.deliveryPerson LIKE ?)')
            parameters.extend((cashier_id, f"%{cashier['name']}%"))
        else:
            clauses.append('i.createdById = ?')
            parameters.append(cashier_id)

    if query.get("shopType") and query["shopType"] != "ALL":
        clauses.append('i.shopType = ?')
        parameters.append(query["shopType"])

    if query.get("status"):
        clauses.append('i.status = ?')
        parameters.append(query["status"])

    if query.get("includeAllDeliveries") != "true":
        clauses.append(
            "(COALESCE(i.isDelivery, 0) = 0 OR (i.isDelivery = 1 AND i.deliveryStatus = 'DELIVERED') OR (i.isDelivery = 1 AND i.isPaid = 1))"
        )

    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    page = 1
    page_size = 50
    if paginated:
        try:
            page = max(1, int(query.get("page", 1)))
            page_size = min(100, max(1, int(query.get("pageSize", 50))))
        except (TypeError, ValueError):
            page = 1
            page_size = 50

    with store._connect() as connection:
        total = None
        if paginated:
            total = connection.execute(
                f'''SELECT COUNT(*) FROM "Invoice" i{where}''',
                parameters,
            ).fetchone()[0]
            total_pages = (total + page_size - 1) // page_size
            page = min(page, max(total_pages, 1))
        invoices = connection.execute(
            f'''SELECT i.*, creator.name AS creatorName, canceller.name AS cancellerName
                FROM "Invoice" i
                LEFT JOIN "User" creator ON creator.id = i.createdById
                LEFT JOIN "User" canceller ON canceller.id = i.cancelledById
                {where}
                ORDER BY i.createdAt DESC, i.id DESC
                {"LIMIT ? OFFSET ?" if paginated else ""}''',
            (*parameters, page_size, (page - 1) * page_size) if paginated else parameters,
        ).fetchall()
        if not invoices:
            result = []
            if paginated:
                return {
                    "items": result,
                    "total": total,
                    "page": page,
                    "pageSize": page_size,
                    "totalPages": total_pages,
                }
            return result

        invoice_ids = [row["id"] for row in invoices]
        placeholders = ",".join("?" for _ in invoice_ids)
        items = connection.execute(
            f'''SELECT id, invoiceId, categoryName, price, COALESCE(qty, 1) AS qty, COALESCE(itemType, 'SERVICE') AS itemType FROM "InvoiceItem"
                WHERE invoiceId IN ({placeholders})''',
            invoice_ids,
        ).fetchall()

    items_by_invoice = {}
    for item in items:
        items_by_invoice.setdefault(item["invoiceId"], []).append(dict(item))

    result = []
    for row in invoices:
        invoice = dict(row)
        creator_name = invoice.pop("creatorName")
        canceller_name = invoice.pop("cancellerName")
        invoice["createdBy"] = {"name": creator_name} if creator_name else None
        invoice["cancelledBy"] = {"name": canceller_name} if canceller_name else None
        for field in ("isReservation", "isDelivery", "isPaid"):
            if field in invoice:
                invoice[field] = bool(invoice[field])
        invoice["items"] = items_by_invoice.get(invoice["id"], [])
        result.append(invoice)
    if paginated:
        return {
            "items": result,
            "total": total,
            "page": page,
            "pageSize": page_size,
            "totalPages": total_pages,
        }
    return result


def get_invoice_with_relations(connection, invoice_id):
    row = connection.execute(
        '''SELECT i.*, creator.name AS creatorName, canceller.name AS cancellerName
           FROM "Invoice" i
           LEFT JOIN "User" creator ON creator.id = i.createdById
           LEFT JOIN "User" canceller ON canceller.id = i.cancelledById
           WHERE i.id = ?''',
        (invoice_id,),
    ).fetchone()
    if row is None:
        return None
    invoice = dict(row)
    creator_name = invoice.pop("creatorName")
    canceller_name = invoice.pop("cancellerName")
    invoice["createdBy"] = {"name": creator_name} if creator_name else None
    invoice["cancelledBy"] = {"name": canceller_name} if canceller_name else None
    for field in ("isReservation", "isDelivery", "isPaid"):
        if field in invoice:
            invoice[field] = bool(invoice[field])
    invoice["items"] = [
        dict(item)
        for item in connection.execute(
            '''SELECT id, invoiceId, categoryName, price, COALESCE(qty, 1) AS qty, COALESCE(itemType, 'SERVICE') AS itemType
               FROM "InvoiceItem" WHERE invoiceId = ?''',
            (invoice_id,),
        ).fetchall()
    ]
    return invoice
