from datetime import date, datetime, time, timedelta, timezone

from app.queries import _local_day_bounds


def payment_method_breakdown(method, total):
    result = {"CASH": 0.0, "ONLINE": 0.0, "ORANGE_MONEY": 0.0}
    value = str(method or "").strip()
    if value.startswith("MULTIPLE:"):
        for part in value[9:].split(";"):
            key, _, amount = part.partition("=")
            key = key.strip().upper()
            try:
                amount_value = float(amount)
            except (TypeError, ValueError):
                amount_value = 0
            if key == "CASH":
                result["CASH"] += amount_value
            elif key in {"ONLINE", "MOBILE_MONEY", "MOMO", "WAVE"}:
                result["ONLINE"] += amount_value
            elif key in {"ORANGE_MONEY", "ORANGE", "OM"}:
                result["ORANGE_MONEY"] += amount_value
        return result

    key = value.upper()
    if key in {"ORANGE_MONEY", "ORANGE", "OM"}:
        result["ORANGE_MONEY"] = float(total or 0)
    elif key in {"ONLINE", "MOBILE_MONEY", "MOMO", "WAVE"}:
        result["ONLINE"] = float(total or 0)
    else:
        result["CASH"] = float(total or 0)
    return result


def _date_range(query, default_today=True):
    if query.get("startDate") and query.get("endDate"):
        start = _local_day_bounds(query["startDate"])
        end = _local_day_bounds(query["endDate"])
        if start and end:
            return start[0], end[1]
    if query.get("date"):
        return _local_day_bounds(query["date"])
    if default_today:
        today = datetime.now().astimezone().strftime("%Y-%m-%d")
        return _local_day_bounds(today)
    return None


def _cashier_name(connection, cashier_id):
    if not cashier_id:
        return None
    row = connection.execute('SELECT name FROM "User" WHERE id = ?', (cashier_id,)).fetchone()
    return row["name"] if row else None


def _invoice_rows(connection, bounds=None, cashier_id=None, cashier_name=None, all_time=False, shop_type=None, provider_id=None):
    clauses = ["status = 'VALIDATED'"]
    parameters = []
    if bounds and not all_time:
        clauses.append('createdAt BETWEEN ? AND ?')
        parameters.extend(bounds)
    if cashier_id:
        if all_time:
            clauses.append("createdById = ?")
            parameters.append(cashier_id)
        elif cashier_name:
            clauses.append("(createdById = ? OR deliveryPerson LIKE ?)")
            parameters.extend((cashier_id, f"%{cashier_name}%"))
        else:
            clauses.append("createdById = ?")
            parameters.append(cashier_id)
    if shop_type in {"HOMME", "FEMME"}:
        clauses.append('shopType = ?')
        parameters.append(shop_type)
    if provider_id:
        clauses.append(
            '''EXISTS (
                   SELECT 1 FROM "InvoiceItem" provider_item
                   WHERE provider_item.invoiceId = "Invoice".id
                     AND provider_item.providerId = ?
                     AND COALESCE(provider_item.itemType, 'SERVICE') = 'SERVICE'
               )'''
        )
        parameters.append(provider_id)
    return connection.execute(
        f'SELECT * FROM "Invoice" WHERE {" AND ".join(clauses)}', parameters
    ).fetchall()


def _reservation_payment_rows(connection, bounds=None, cashier_id=None, all_time=False, shop_type=None):
    clauses = ["r.status != 'CANCELLED'"]
    parameters = []
    if bounds and not all_time:
        clauses.append('p.createdAt BETWEEN ? AND ?')
        parameters.extend(bounds)
    if cashier_id:
        clauses.append('p.createdById = ?')
        parameters.append(cashier_id)
    if shop_type in {"HOMME", "FEMME"}:
        clauses.append('r.shopType = ?')
        parameters.append(shop_type)
    return connection.execute(
        f'''SELECT p.* FROM "ReservationPayment" p
            JOIN "Reservation" r ON r.id = p.reservationId
            WHERE {" AND ".join(clauses)}''',
        parameters,
    ).fetchall()


def _stats_for_rows(invoices, payments, include_paid_delivery_count=True):
    stats = {
        "total": 0.0, "cash": 0.0, "online": 0.0, "orangeMoney": 0.0,
        "count": 0, "reservationTotal": 0.0, "resPaymentsCount": len(payments),
        "directCount": 0, "deliveryCount": 0, "deliveryFeesTotal": 0.0,
        "deliveryTotalWithoutFees": 0.0, "deliveryTotalWithFees": 0.0,
        "directCash": 0.0, "directOnline": 0.0, "directOrange": 0.0,
        "resCash": 0.0, "resOnline": 0.0, "resOrange": 0.0,
    }
    if include_paid_delivery_count:
        stats["paidDeliveryCount"] = 0

    for invoice in invoices:
        if invoice["isReservation"]:
            continue
        if invoice["isDelivery"]:
            if not invoice["isPaid"] and invoice["deliveryStatus"] != "DELIVERED":
                continue
            fee = float(invoice["deliveryFee"] or 0)
            amount = float(invoice["totalAmount"] or 0)
            total_with_fee = amount + fee
            stats["deliveryCount"] += 1
            if include_paid_delivery_count:
                stats["paidDeliveryCount"] += 1
            stats["deliveryFeesTotal"] += fee
            stats["deliveryTotalWithoutFees"] += amount
            stats["deliveryTotalWithFees"] += total_with_fee
            stats["count"] += 1
            stats["total"] += total_with_fee
            breakdown = payment_method_breakdown(invoice["paymentMethod"], total_with_fee)
            stats["cash"] += breakdown["CASH"]
            stats["directCash"] += breakdown["CASH"]
            stats["online"] += breakdown["ONLINE"]
            stats["directOnline"] += breakdown["ONLINE"]
            stats["orangeMoney"] += breakdown["ORANGE_MONEY"]
            stats["directOrange"] += breakdown["ORANGE_MONEY"]
        else:
            amount = float(invoice["totalAmount"] or 0)
            stats["directCount"] += 1
            stats["count"] += 1
            stats["total"] += amount
            breakdown = payment_method_breakdown(invoice["paymentMethod"], amount)
            stats["cash"] += breakdown["CASH"]
            stats["directCash"] += breakdown["CASH"]
            stats["online"] += breakdown["ONLINE"]
            stats["directOnline"] += breakdown["ONLINE"]
            stats["orangeMoney"] += breakdown["ORANGE_MONEY"]
            stats["directOrange"] += breakdown["ORANGE_MONEY"]

    for payment in payments:
        amount = float(payment["amount"] or 0)
        stats["reservationTotal"] += amount
        stats["total"] += amount
        breakdown = payment_method_breakdown(payment["paymentMethod"], amount)
        stats["cash"] += breakdown["CASH"]
        stats["resCash"] += breakdown["CASH"]
        stats["online"] += breakdown["ONLINE"]
        stats["resOnline"] += breakdown["ONLINE"]
        stats["orangeMoney"] += breakdown["ORANGE_MONEY"]
        stats["resOrange"] += breakdown["ORANGE_MONEY"]
    return stats


def _category_totals(
    connection,
    bounds,
    cashier_id=None,
    cashier_name=None,
    dashboard_cashier_filter=False,
    eligible_deliveries=True,
    shop_type=None,
    provider_id=None,
):
    clauses = ["i.status = 'VALIDATED'"]
    parameters = []
    if bounds:
        clauses.append("i.createdAt BETWEEN ? AND ?")
        parameters.extend(bounds)
    if shop_type in {"HOMME", "FEMME"}:
        clauses.append('i.shopType = ?')
        parameters.append(shop_type)
    if eligible_deliveries:
        clauses.append("(COALESCE(i.isDelivery, 0) = 0 OR COALESCE(i.isPaid, 0) = 1 OR i.deliveryStatus = 'DELIVERED')")
    if cashier_id:
        if dashboard_cashier_filter and cashier_name:
            clauses.append("(i.createdById = ? OR i.deliveryPerson LIKE ?)")
            parameters.extend((cashier_id, f"%{cashier_name}%"))
        else:
            clauses.append("i.createdById = ?")
            parameters.append(cashier_id)
    if provider_id:
        clauses.append(
            "item.providerId = ? AND COALESCE(item.itemType, 'SERVICE') = 'SERVICE'"
        )
        parameters.append(provider_id)
    rows = connection.execute(
        f'''SELECT item.categoryName, item.price FROM "InvoiceItem" item
            JOIN "Invoice" i ON i.id = item.invoiceId
            WHERE {" AND ".join(clauses)}''',
        parameters,
    ).fetchall()
    totals = {}
    for row in rows:
        entry = totals.setdefault(row["categoryName"], {"name": row["categoryName"], "quantity": 0, "revenue": 0.0})
        entry["quantity"] += 1
        entry["revenue"] += float(row["price"] or 0)
    return sorted(totals.values(), key=lambda entry: entry["revenue"], reverse=True)


def _enriched_analytics(connection, bounds, cashier_id=None, cashier_name=None, shop_type=None, all_time=False, query=None, provider_id=None):
    query = query or {}
    invoices = _invoice_rows(
        connection,
        bounds,
        cashier_id,
        cashier_name,
        all_time=all_time,
        shop_type=shop_type,
        provider_id=provider_id,
    )
    payments_breakdown = {"CASH": 0.0, "ORANGE_MONEY": 0.0, "ONLINE": 0.0}
    total_sales = 0.0
    for inv in invoices:
        amt = float(inv["totalAmount"] or 0)
        total_sales += amt
        m = payment_method_breakdown(inv["paymentMethod"], amt)
        for k in payments_breakdown:
            payments_breakdown[k] += m[k]

    res_payments = (
        []
        if provider_id
        else _reservation_payment_rows(connection, bounds, cashier_id, all_time=all_time, shop_type=shop_type)
    )
    for p in res_payments:
        amt = float(p["amount"] or 0)
        total_sales += amt
        m = payment_method_breakdown(p["paymentMethod"], amt)
        for k in payments_breakdown:
            payments_breakdown[k] += m[k]

    is_single_day = False
    if "date" in query and query["date"]:
        is_single_day = True
    elif bounds and not all_time and len(bounds) == 2:
        try:
            t0 = datetime.fromisoformat(bounds[0].replace("Z", "+00:00"))
            t1 = datetime.fromisoformat(bounds[1].replace("Z", "+00:00"))
            if abs((t1 - t0).total_seconds()) <= 86400 * 1.5:
                is_single_day = True
        except Exception:
            pass

    timeline = []
    if is_single_day:
        hour_buckets = {h: {"total": 0.0, "shop1": 0.0, "shop2": 0.0, "count": 0} for h in range(8, 23)}
        for inv in invoices:
            dt_raw = inv["createdAt"]
            if dt_raw:
                try:
                    dt = datetime.fromisoformat(dt_raw.replace("Z", "+00:00")).astimezone()
                    h = dt.hour
                    amt = float(inv["totalAmount"] or 0)
                    st = str(inv["shopType"] or "FEMME").upper()
                    target_h = max(8, min(22, h))
                    hour_buckets[target_h]["total"] += amt
                    hour_buckets[target_h]["count"] += 1
                    if st == "HOMME":
                        hour_buckets[target_h]["shop1"] += amt
                    else:
                        hour_buckets[target_h]["shop2"] += amt
                except Exception:
                    pass
        for h in range(8, 23):
            timeline.append({
                "label": f"{h:02d}h",
                "total": round(hour_buckets[h]["total"], 2),
                "shop1": round(hour_buckets[h]["shop1"], 2),
                "shop2": round(hour_buckets[h]["shop2"], 2),
                "count": hour_buckets[h]["count"]
            })
    else:
        date_buckets = {}
        for inv in invoices:
            dt_raw = inv["createdAt"]
            if dt_raw:
                try:
                    dt = datetime.fromisoformat(dt_raw.replace("Z", "+00:00")).astimezone()
                    d_str = dt.strftime("%Y-%m-%d")
                    amt = float(inv["totalAmount"] or 0)
                    st = str(inv["shopType"] or "FEMME").upper()
                    b = date_buckets.setdefault(d_str, {"total": 0.0, "shop1": 0.0, "shop2": 0.0, "count": 0})
                    b["total"] += amt
                    b["count"] += 1
                    if st == "HOMME":
                        b["shop1"] += amt
                    else:
                        b["shop2"] += amt
                except Exception:
                    pass
        sorted_dates = sorted(date_buckets.keys())
        for d in sorted_dates[-30:]:
            parts = d.split("-")
            label = f"{parts[2]}/{parts[1]}" if len(parts) == 3 else d
            timeline.append({
                "label": label,
                "fullDate": d,
                "total": round(date_buckets[d]["total"], 2),
                "shop1": round(date_buckets[d]["shop1"], 2),
                "shop2": round(date_buckets[d]["shop2"], 2),
                "count": date_buckets[d]["count"]
            })

    if not timeline:
        now_dt = datetime.now().astimezone()
        for i in range(6, -1, -1):
            d = now_dt.date() - timedelta(days=i)
            timeline.append({
                "label": d.strftime("%d/%m"),
                "fullDate": d.strftime("%Y-%m-%d"),
                "total": 0.0,
                "shop1": 0.0,
                "shop2": 0.0,
                "count": 0
            })

    rush_ranges = [
        ("08h - 10h", 8, 10),
        ("10h - 12h", 10, 12),
        ("12h - 14h", 12, 14),
        ("14h - 16h", 14, 16),
        ("16h - 18h", 16, 18),
        ("18h - 20h", 18, 20),
        ("20h - 22h", 20, 23),
    ]
    rush_hours = []
    for slot_label, h_start, h_end in rush_ranges:
        count = 0
        rev = 0.0
        for inv in invoices:
            dt_raw = inv["createdAt"]
            if dt_raw:
                try:
                    dt = datetime.fromisoformat(dt_raw.replace("Z", "+00:00")).astimezone()
                    if h_start <= dt.hour < h_end:
                        count += 1
                        rev += float(inv["totalAmount"] or 0)
                except Exception:
                    pass
        rush_hours.append({"slot": slot_label, "count": count, "revenue": round(rev, 2)})

    item_cols = {row[1] for row in connection.execute('PRAGMA table_info("InvoiceItem")').fetchall()}
    has_item_type = "itemType" in item_cols
    has_qty = "qty" in item_cols

    known_products = set()
    try:
        p_rows = connection.execute('SELECT name FROM "Product"').fetchall()
        known_products = {r["name"].strip().lower() for r in p_rows if r["name"]}
    except Exception:
        pass

    inv_ids = [inv["id"] for inv in invoices]
    service_items = {}
    product_items = {}
    cat_totals = {}
    service_revenue = 0.0
    product_revenue = 0.0

    if inv_ids:
        chunks = [inv_ids[i:i + 900] for i in range(0, len(inv_ids), 900)]
        for chunk in chunks:
            placeholders = ",".join("?" for _ in chunk)
            select_cols = 'invoiceId, categoryName, price'
            if has_qty:
                select_cols += ', qty'
            if has_item_type:
                select_cols += ', itemType'
            provider_clause = ""
            item_parameters = list(chunk)
            if provider_id:
                provider_clause = " AND providerId = ?"
                item_parameters.append(provider_id)
            rows = connection.execute(
                f'SELECT {select_cols} FROM "InvoiceItem" WHERE invoiceId IN ({placeholders}){provider_clause}',
                item_parameters,
            ).fetchall()
            for r in rows:
                name = str(r["categoryName"] or "Article").strip()
                price = float(r["price"] or 0)
                qty = int(r["qty"] or 1) if has_qty else 1
                total_item_amt = price * qty
                raw_type = str(r["itemType"] or "SERVICE").upper() if has_item_type else "SERVICE"

                is_prod = (raw_type == "PRODUCT") or (name.lower() in known_products)
                if is_prod:
                    product_revenue += total_item_amt
                    target_dict = product_items
                else:
                    service_revenue += total_item_amt
                    target_dict = service_items

                entry = target_dict.setdefault(name, {"name": name, "quantity": 0, "revenue": 0.0})
                entry["quantity"] += qty
                entry["revenue"] += total_item_amt

                c_entry = cat_totals.setdefault(name, {"name": name, "quantity": 0, "revenue": 0.0})
                c_entry["quantity"] += qty
                c_entry["revenue"] += total_item_amt

    top_services = sorted(service_items.values(), key=lambda x: x["revenue"], reverse=True)[:10]
    top_products = sorted(product_items.values(), key=lambda x: x["quantity"], reverse=True)[:10]

    if not top_products:
        try:
            sample_prods = connection.execute('SELECT name, price FROM "Product" LIMIT 5').fetchall()
            top_products = [{"name": sp["name"], "quantity": 0, "revenue": 0.0} for sp in sample_prods]
        except Exception:
            pass

    category_breakdown = sorted(cat_totals.values(), key=lambda x: x["revenue"], reverse=True)[:8]
    if not category_breakdown:
        try:
            sample_cats = connection.execute('SELECT name FROM "Category" LIMIT 5').fetchall()
            category_breakdown = [{"name": sc["name"], "quantity": 0, "revenue": 0.0, "percentage": 0.0} for sc in sample_cats]
        except Exception:
            pass

    total_cat_rev = sum(c["revenue"] for c in category_breakdown) or 1
    for c in category_breakdown:
        c["percentage"] = round((c["revenue"] / total_cat_rev) * 100, 1)

    shop1_total = sum(float(inv["totalAmount"] or 0) for inv in invoices if str(inv["shopType"] or "").upper() == "HOMME")
    shop1_count = sum(1 for inv in invoices if str(inv["shopType"] or "").upper() == "HOMME")
    shop2_total = sum(float(inv["totalAmount"] or 0) for inv in invoices if str(inv["shopType"] or "").upper() != "HOMME")
    shop2_count = sum(1 for inv in invoices if str(inv["shopType"] or "").upper() != "HOMME")

    shop_comparison = {
        "shop1": {
            "name": "Shop 1",
            "total": round(shop1_total, 2),
            "count": shop1_count,
            "averageBasket": round(shop1_total / shop1_count, 2) if shop1_count else 0
        },
        "shop2": {
            "name": "Shop 2",
            "total": round(shop2_total, 2),
            "count": shop2_count,
            "averageBasket": round(shop2_total / shop2_count, 2) if shop2_count else 0
        }
    }

    total_invoices_count = len(invoices)
    avg_basket = round(total_sales / total_invoices_count, 2) if total_invoices_count else 0
    unique_clients = len({inv["clientName"].strip().lower() for inv in invoices if inv["clientName"] and inv["clientName"].strip()})

    return {
        "timeline": timeline,
        "paymentBreakdown": {
            "CASH": round(payments_breakdown["CASH"], 2),
            "ORANGE_MONEY": round(payments_breakdown["ORANGE_MONEY"], 2),
            "ONLINE": round(payments_breakdown["ONLINE"], 2),
            "total": round(total_sales, 2)
        },
        "topServices": top_services,
        "topProducts": top_products,
        "categoryBreakdown": category_breakdown,
        "rushHours": rush_hours,
        "shopComparison": shop_comparison,
        "ratios": {
            "serviceRevenue": round(service_revenue, 2),
            "productRevenue": round(product_revenue, 2),
            "averageBasket": avg_basket,
            "totalTickets": total_invoices_count,
            "uniqueClients": unique_clients
        }
    }


def dashboard_stats(store, query):
    now = datetime.now().astimezone()
    today_bounds = _local_day_bounds(now.strftime("%Y-%m-%d"))
    yesterday_date = (now.date() - timedelta(days=1)).strftime("%Y-%m-%d")
    yesterday_bounds = _local_day_bounds(yesterday_date)
    monday = now.date() - timedelta(days=now.weekday())
    sunday = monday + timedelta(days=6)
    week_bounds = (
        _local_day_bounds(monday.isoformat())[0],
        _local_day_bounds(sunday.isoformat())[1],
    )
    month_start = now.date().replace(day=1)
    next_month = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)
    month_end = next_month - timedelta(days=1)
    month_bounds = (
        _local_day_bounds(month_start.isoformat())[0],
        _local_day_bounds(month_end.isoformat())[1],
    )
    cashier_id = query.get("cashierId")
    shop_type = query.get("shopType")
    provider_id = query.get("providerId")

    with store._connect() as connection:
        cashier_name = _cashier_name(connection, cashier_id)

        def range_stats(bounds):
            invoices = _invoice_rows(
                connection,
                bounds,
                cashier_id,
                cashier_name,
                shop_type=shop_type,
                provider_id=provider_id,
            )
            payments = (
                []
                if provider_id
                else _reservation_payment_rows(connection, bounds, cashier_id, shop_type=shop_type)
            )
            return _stats_for_rows(invoices, payments)

        today = range_stats(today_bounds)
        yesterday = range_stats(yesterday_bounds)
        week = range_stats(week_bounds)
        month = range_stats(month_bounds)
        filtered_bounds = _date_range(query, default_today=False)
        is_all_time = not filtered_bounds and "date" not in query and "startDate" not in query
        if filtered_bounds:
            filtered = range_stats(filtered_bounds)
        else:
            invoices = _invoice_rows(
                connection,
                cashier_id=cashier_id,
                all_time=True,
                shop_type=shop_type,
                provider_id=provider_id,
            )
            payments = (
                []
                if provider_id
                else _reservation_payment_rows(connection, cashier_id=cashier_id, all_time=True, shop_type=shop_type)
            )
            filtered = _stats_for_rows(invoices, payments, include_paid_delivery_count=False)

        effective_bounds = filtered_bounds if filtered_bounds else today_bounds
        top_selling = _category_totals(
            connection,
            effective_bounds,
            cashier_id,
            cashier_name,
            dashboard_cashier_filter=True,
            eligible_deliveries=False,
            shop_type=shop_type,
            provider_id=provider_id,
        )
        analytics = _enriched_analytics(
            connection,
            effective_bounds,
            cashier_id,
            cashier_name,
            shop_type=shop_type,
            all_time=is_all_time,
            query=query,
            provider_id=provider_id,
        )

        today_total = today.get("total", 0.0)
        yesterday_total = yesterday.get("total", 0.0)
        if yesterday_total > 0:
            growth_percentage = round(((today_total - yesterday_total) / yesterday_total) * 100, 1)
        elif today_total > 0:
            growth_percentage = 100.0
        else:
            growth_percentage = 0.0

    return {
        "today": today,
        "yesterday": yesterday,
        "growthPercentage": growth_percentage,
        "week": week,
        "month": month,
        "filtered": filtered,
        "topSelling": top_selling,
        "analytics": analytics,
    }

def z_report(store, query):
    bounds = _date_range(query)
    if bounds is None:
        raise ValueError("Invalid report date range")
    cashier_id = query.get("cashierId")
    shop_type = query.get("shopType")
    with store._connect() as connection:
        cashier_name = _cashier_name(connection, cashier_id)
        invoices = connection.execute(
            '''SELECT * FROM "Invoice" WHERE status = 'VALIDATED' AND createdAt BETWEEN ? AND ?
                AND (? IS NULL OR createdById = ?) AND (? IS NULL OR shopType = ?)''',
            (*bounds, cashier_id, cashier_id, shop_type, shop_type),
        ).fetchall()
        payments = _reservation_payment_rows(connection, bounds, cashier_id, shop_type=shop_type)
        cancelled = connection.execute(
            '''SELECT COUNT(*) FROM "Invoice" WHERE status = 'CANCELLED' AND createdAt BETWEEN ? AND ?
                    AND (? IS NULL OR createdById = ?) AND (? IS NULL OR shopType = ?)''',
                (*bounds, cashier_id, cashier_id, shop_type, shop_type),
        ).fetchone()[0]

        total = 0.0
        breakdown = {"CASH": 0.0, "ONLINE": 0.0, "ORANGE_MONEY": 0.0}
        for invoice in invoices:
            if invoice["isReservation"]:
                continue
            if invoice["isDelivery"] and not invoice["isPaid"] and invoice["deliveryStatus"] != "DELIVERED":
                continue
            amount = float(invoice["totalAmount"] or 0)
            payment_breakdown = payment_method_breakdown(invoice["paymentMethod"], amount)
            total += amount
            for key in breakdown:
                breakdown[key] += payment_breakdown[key]
        for payment in payments:
            amount = float(payment["amount"] or 0)
            payment_breakdown = payment_method_breakdown(payment["paymentMethod"], amount)
            total += amount
            for key in breakdown:
                breakdown[key] += payment_breakdown[key]

        top_selling = _category_totals(connection, bounds, cashier_id, shop_type=shop_type)

    local_start = datetime.fromisoformat(bounds[0].replace("Z", "+00:00")).astimezone()
    local_end = datetime.fromisoformat(bounds[1].replace("Z", "+00:00")).astimezone()
    start_label = local_start.strftime("%d/%m/%Y")
    end_label = local_end.strftime("%d/%m/%Y")
    period_label = f"Le {start_label}" if start_label == end_label else f"Du {start_label} au {end_label}"
    invoice_count = len(invoices)
    return {
        "totalSales": total,
        "total": total,
        "count": invoice_count,
        "validatedCount": invoice_count,
        "resPaymentCount": len(payments),
        "cancelledCount": cancelled,
        "payments": breakdown,
        "topSelling": top_selling,
        "periodLabel": period_label,
        "date": period_label,
        "time": datetime.now().astimezone().strftime("%H:%M:%S"),
        "cashierName": cashier_name,
    }


def product_sales_report(store, query):
    bounds = _date_range(query)
    if bounds is None:
        raise ValueError("Invalid report date range")
    cashier_id = query.get("cashierId")
    shop_type = query.get("shopType")
    with store._connect() as connection:
        products = _category_totals(connection, bounds, cashier_id, shop_type=shop_type)
    normalized = [{"name": row["name"], "quantity": row["quantity"], "total": row["revenue"]} for row in products]
    return {
        "products": normalized,
        "grandTotal": sum(product["total"] for product in normalized),
        "totalQuantity": sum(product["quantity"] for product in normalized),
    }


def service_provider_stats(store, query):
    clauses = [
        "i.status = 'VALIDATED'",
        "COALESCE(item.itemType, 'SERVICE') = 'SERVICE'",
        "item.providerId IS NOT NULL",
    ]
    parameters = []
    bounds = _date_range(query, default_today=False)
    if bounds:
        clauses.append("i.createdAt BETWEEN ? AND ?")
        parameters.extend(bounds)

    shop_type = query.get("shopType")
    if shop_type in {"HOMME", "FEMME"}:
        clauses.append("i.shopType = ?")
        parameters.append(shop_type)

    with store._connect() as connection:
        rows = connection.execute(
            f'''SELECT item.providerId AS id,
                       MAX(item.providerName) AS name,
                       i.shopType,
                       SUM(COALESCE(item.qty, 1)) AS serviceCount,
                       SUM(item.price * COALESCE(item.qty, 1)) AS revenue
                FROM "InvoiceItem" item
                JOIN "Invoice" i ON i.id = item.invoiceId
                WHERE {" AND ".join(clauses)}
                GROUP BY item.providerId, i.shopType''',
            parameters,
        ).fetchall()
        provider_clauses = []
        provider_parameters = []
        if shop_type in {"HOMME", "FEMME"}:
            provider_clauses.append("shopType = ?")
            provider_parameters.append(shop_type)
        provider_where = f' WHERE {" AND ".join(provider_clauses)}' if provider_clauses else ""
        registered_providers = connection.execute(
            f'SELECT id, name, shopType FROM "ServiceProvider"{provider_where}',
            provider_parameters,
        ).fetchall()

    providers = [
        {
            "id": row["id"],
            "name": row["name"] or "Prestataire supprimé",
            "shopType": row["shopType"],
            "serviceCount": int(row["serviceCount"] or 0),
            "revenue": float(row["revenue"] or 0),
        }
        for row in rows
    ]
    known_provider_shops = {(provider["id"], provider["shopType"]) for provider in providers}
    for provider in registered_providers:
        key = (provider["id"], provider["shopType"])
        if key not in known_provider_shops:
            providers.append({
                "id": provider["id"],
                "name": provider["name"],
                "shopType": provider["shopType"],
                "serviceCount": 0,
                "revenue": 0.0,
            })
    active_providers = [provider for provider in providers if provider["serviceCount"] > 0]
    top_by_count = sorted(active_providers, key=lambda row: (-row["serviceCount"], -row["revenue"], row["name"]))
    top_by_revenue = sorted(active_providers, key=lambda row: (-row["revenue"], -row["serviceCount"], row["name"]))
    top_by_average_revenue = sorted(
        active_providers,
        key=lambda row: (
            -(row["revenue"] / row["serviceCount"] if row["serviceCount"] else 0),
            -row["serviceCount"],
            row["name"],
        ),
    )
    return {
        "providers": providers,
        "topByCount": top_by_count,
        "topByRevenue": top_by_revenue,
        "topByAverageRevenue": top_by_average_revenue,
    }


def dashboard_insights(store, query, include_customer_follow_up=False):
    now = datetime.now().astimezone()
    current_year = now.year
    bounds = _date_range(query, default_today=True)
    today_bounds = _local_day_bounds(now.strftime("%Y-%m-%d"))
    shop_type = query.get("shopType")
    invoice_clauses = ["i.status = 'VALIDATED'", "i.createdAt BETWEEN ? AND ?"]
    invoice_parameters = list(bounds)
    if shop_type in {"HOMME", "FEMME"}:
        invoice_clauses.append("i.shopType = ?")
        invoice_parameters.append(shop_type)
    invoice_where = " AND ".join(invoice_clauses)

    months = [
        {"month": date(current_year, month, 1).strftime("%b"), "shop1Revenue": 0.0, "shop2Revenue": 0.0, "total": 0.0}
        for month in range(1, 13)
    ]
    year_bounds = (
        _local_day_bounds(f"{current_year}-01-01")[0],
        _local_day_bounds(f"{current_year}-12-31")[1],
    )
    trend_clauses = ["status = 'VALIDATED'", "createdAt BETWEEN ? AND ?"]
    trend_parameters = list(year_bounds)
    if shop_type in {"HOMME", "FEMME"}:
        trend_clauses.append("shopType = ?")
        trend_parameters.append(shop_type)
    daily_clauses = ["i.status = 'VALIDATED'", "i.createdAt BETWEEN ? AND ?"]
    daily_parameters = list(today_bounds)
    follow_up_clauses = ["i.status = 'VALIDATED'", "i.shopType = ?"]
    follow_up_parameters = [shop_type]
    if shop_type in {"HOMME", "FEMME"}:
        daily_clauses.append("i.shopType = ?")
        daily_parameters.append(shop_type)

    with store._connect() as connection:
        staff_rows = connection.execute(
            f'''SELECT u.id, u.name, u.role, u.shopType,
                       COUNT(i.id) AS invoiceCount,
                       COALESCE(SUM(i.totalAmount), 0) AS revenue
                FROM "User" u
                LEFT JOIN "Invoice" i
                  ON i.createdById = u.id AND {invoice_where}
                WHERE u.role IN ('CASHIER', 'MANAGER')
                  AND (? IS NULL OR u.shopType = ? OR u.shopType = 'ALL')
                GROUP BY u.id
                ORDER BY revenue DESC, invoiceCount DESC, u.name COLLATE NOCASE''',
            (*invoice_parameters, shop_type, shop_type),
        ).fetchall()
        provider_rows = connection.execute(
            f'''SELECT item.providerId AS id,
                       COALESCE(MAX(item.providerName), MAX(provider.name), 'Prestataire supprimé') AS name,
                       i.shopType,
                       SUM(COALESCE(item.qty, 1)) AS serviceCount,
                       SUM(item.price * COALESCE(item.qty, 1)) AS revenue
                FROM "InvoiceItem" item
                JOIN "Invoice" i ON i.id = item.invoiceId
                LEFT JOIN "ServiceProvider" provider ON provider.id = item.providerId
                WHERE {invoice_where}
                  AND item.providerId IS NOT NULL
                  AND COALESCE(item.itemType, 'SERVICE') = 'SERVICE'
                GROUP BY item.providerId, i.shopType
                ORDER BY revenue DESC, serviceCount DESC, name COLLATE NOCASE''',
            invoice_parameters,
        ).fetchall()
        trend_rows = connection.execute(
            f'''SELECT createdAt, totalAmount, shopType
                FROM "Invoice" i
                WHERE {" AND ".join(trend_clauses)}''',
            trend_parameters,
        ).fetchall()

        daily_invoices = connection.execute(
            f'''SELECT i.totalAmount, i.paymentMethod, i.isReservation, i.isDelivery,
                       i.isPaid, i.deliveryStatus, i.deliveryFee
                FROM "Invoice" i
                WHERE {" AND ".join(daily_clauses)}''',
            daily_parameters,
        ).fetchall()
        daily_revenue = 0.0
        daily_invoice_count = 0
        daily_payments = {"CASH": 0.0, "ONLINE": 0.0, "ORANGE_MONEY": 0.0}
        for row in daily_invoices:
            if row["isReservation"]:
                continue
            if row["isDelivery"] and not row["isPaid"] and row["deliveryStatus"] != "DELIVERED":
                continue
            amount = float(row["totalAmount"] or 0) + (
                float(row["deliveryFee"] or 0) if row["isDelivery"] else 0
            )
            daily_invoice_count += 1
            daily_revenue += amount
            breakdown = payment_method_breakdown(row["paymentMethod"], amount)
            for method in daily_payments:
                daily_payments[method] += breakdown[method]

        daily_reservation_count = 0
        pending_daily_reservations = 0
        upcoming_appointments = []
        follow_up_clients = []
        if include_customer_follow_up:
            today = now.date()
            next_week = today + timedelta(days=7)
            daily_reservation_payments = connection.execute(
                '''SELECT p.amount, p.paymentMethod
                   FROM "ReservationPayment" p
                   JOIN "Reservation" r ON r.id = p.reservationId
                   WHERE r.shopType = ? AND r.status != 'CANCELLED'
                     AND p.createdAt BETWEEN ? AND ?''',
                (shop_type, *today_bounds),
            ).fetchall()
            for payment in daily_reservation_payments:
                amount = float(payment["amount"] or 0)
                daily_revenue += amount
                breakdown = payment_method_breakdown(payment["paymentMethod"], amount)
                for method in daily_payments:
                    daily_payments[method] += breakdown[method]
            daily_reservation_count = connection.execute(
                '''SELECT COUNT(*) FROM "Reservation"
                   WHERE shopType = ? AND scheduledAt >= ? AND scheduledAt < ?
                     AND status != 'CANCELLED' ''',
                (shop_type, today.isoformat(), f"{today.isoformat()}T23:59:59"),
            ).fetchone()[0]
            pending_daily_reservations = connection.execute(
                '''SELECT COUNT(*) FROM "Reservation"
                   WHERE shopType = ? AND scheduledAt >= ? AND scheduledAt < ?
                     AND status = 'PENDING' ''',
                (shop_type, today.isoformat(), f"{today.isoformat()}T23:59:59"),
            ).fetchone()[0]
            upcoming_appointments = [
                dict(row)
                for row in connection.execute(
                    '''SELECT id, clientName, clientPhone, scheduledAt, bookingTime, serviceName, status
                       FROM "Reservation"
                       WHERE shopType = ?
                         AND status NOT IN ('CANCELLED', 'COMPLETED')
                         AND scheduledAt >= ? AND scheduledAt < ?
                       ORDER BY scheduledAt ASC
                       LIMIT 20''',
                    (
                        shop_type,
                        now.strftime("%Y-%m-%dT%H:%M:%S"),
                        f"{next_week.isoformat()}T23:59:59",
                    ),
                ).fetchall()
            ]
            cutoff = (today - timedelta(days=60)).isoformat()
            follow_up_clients = [
                {
                    "name": row["clientName"],
                    "phone": row["clientPhone"],
                    "lastPurchaseAt": row["lastPurchaseAt"],
                    "invoiceCount": int(row["invoiceCount"] or 0),
                    "daysSincePurchase": max(0, (today - date.fromisoformat(str(row["lastPurchaseAt"])[:10])).days),
                }
                for row in connection.execute(
                    f'''SELECT clientName, MAX(clientPhone) AS clientPhone,
                               MAX(createdAt) AS lastPurchaseAt, COUNT(*) AS invoiceCount
                        FROM "Invoice" i
                        WHERE {" AND ".join(follow_up_clauses)}
                          AND clientName IS NOT NULL AND TRIM(clientName) != ''
                        GROUP BY clientName
                        HAVING MAX(createdAt) < ?
                        ORDER BY lastPurchaseAt ASC
                        LIMIT 20''',
                    (*follow_up_parameters, _local_day_bounds(cutoff)[0]),
                ).fetchall()
            ]

    for row in trend_rows:
        if not row["createdAt"]:
            continue
        try:
            local_date = datetime.fromisoformat(row["createdAt"].replace("Z", "+00:00")).astimezone()
        except ValueError:
            continue
        month = months[local_date.month - 1]
        revenue = float(row["totalAmount"] or 0)
        if row["shopType"] == "HOMME":
            month["shop1Revenue"] += revenue
        else:
            month["shop2Revenue"] += revenue
        month["total"] += revenue

    return {
        "monthlyTrends": months,
        "dailyOperations": {
            "revenue": daily_revenue,
            "invoiceCount": daily_invoice_count,
            "payments": daily_payments,
            "appointmentsToday": int(daily_reservation_count),
            "pendingAppointmentsToday": int(pending_daily_reservations),
        },
        "staffPerformance": [
            {
                "id": row["id"],
                "name": row["name"],
                "role": row["role"],
                "shopType": row["shopType"],
                "invoiceCount": int(row["invoiceCount"] or 0),
                "revenue": float(row["revenue"] or 0),
            }
            for row in staff_rows
        ],
        "providerPerformance": [
            {
                "id": row["id"],
                "name": row["name"],
                "shopType": row["shopType"],
                "serviceCount": int(row["serviceCount"] or 0),
                "revenue": float(row["revenue"] or 0),
            }
            for row in provider_rows
        ],
        "upcomingAppointments": upcoming_appointments,
        "followUpClients": follow_up_clients,
        "followUpThresholdDays": 60,
    }