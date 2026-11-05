import json
import math
import sqlite3
import uuid
from datetime import date, datetime, timezone

from app.queries import _local_day_bounds
from app.reports import payment_method_breakdown


class TrainingError(Exception):
    def __init__(self, status_code, message):
        super().__init__(message)
        self.status_code = status_code


PAYMENT_METHODS = {"CASH", "ONLINE", "ORANGE_MONEY"}


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _money(value, label, allow_zero=False):
    try:
        amount = float(value)
    except (TypeError, ValueError):
        raise TrainingError(400, f"{label} invalide") from None
    if not math.isfinite(amount) or amount < 0 or (not allow_zero and amount == 0):
        raise TrainingError(400, f"{label} invalide")
    return round(amount, 2)


def _date(value, label):
    if value in (None, ""):
        return None
    try:
        return date.fromisoformat(str(value)).isoformat()
    except ValueError:
        raise TrainingError(400, f"{label} invalide") from None


def _payment_method(value):
    method = str(value or "CASH").strip().upper()
    if method not in PAYMENT_METHODS:
        raise TrainingError(400, "Mode de paiement invalide")
    return method


def _audit(connection, actor_id, action, details, shop_type=None, enrollment_id=None, course_id=None, payment_id=None):
    actor = connection.execute('SELECT name FROM "User" WHERE id = ?', (actor_id,)).fetchone()
    connection.execute(
        '''INSERT INTO "TrainingAudit" (
               id, enrollmentId, courseId, paymentId, shopType, action, details, createdAt,
               actorName, createdById
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
        (
            str(uuid.uuid4()), enrollment_id, course_id, payment_id, shop_type,
            action, json.dumps(details, ensure_ascii=False), _now(),
            actor["name"] if actor else "Utilisateur supprimé", actor_id,
        ),
    )


def _payment_number(connection):
    prefix = f"FTR-{datetime.now().astimezone():%Y%m%d}-"
    row = connection.execute(
        'SELECT paymentNumber FROM "TrainingPayment" WHERE paymentNumber LIKE ? ORDER BY paymentNumber DESC LIMIT 1',
        (f"{prefix}%",),
    ).fetchone()
    sequence = int(row["paymentNumber"].rsplit("-", 1)[-1]) + 1 if row else 1
    return f"{prefix}{sequence:04d}"


def _create_payment(connection, enrollment, actor_id, amount, method, request_key=None):
    if request_key:
        existing = connection.execute(
            'SELECT id, enrollmentId, createdById FROM "TrainingPayment" WHERE requestKey = ?',
            (request_key,),
        ).fetchone()
        if existing:
            if existing["enrollmentId"] != enrollment["id"] or existing["createdById"] != actor_id:
                raise TrainingError(409, "Cette clé de requête est déjà utilisée")
            return existing["id"], False

    paid = connection.execute(
        '''SELECT COALESCE(SUM(amount), 0) FROM "TrainingPayment"
           WHERE enrollmentId = ? AND status = 'VALIDATED' ''',
        (enrollment["id"],),
    ).fetchone()[0]
    remaining = max(0.0, float(enrollment["coursePrice"]) - float(paid or 0))
    if amount > remaining + 0.001:
        raise TrainingError(400, "Le versement dépasse le solde restant")

    installment = connection.execute(
        '''SELECT COUNT(*) FROM "TrainingPayment"
           WHERE enrollmentId = ?''',
        (enrollment["id"],),
    ).fetchone()[0] + 1
    payment_id = str(uuid.uuid4())
    connection.execute(
        '''INSERT INTO "TrainingPayment" (
               id, paymentNumber, enrollmentId, amount, totalPaidAfter, remainingAfter,
               paymentMethod, installmentNumber,
               status, createdAt, createdById, requestKey
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'VALIDATED', ?, ?, ?)''',
        (
            payment_id, _payment_number(connection), enrollment["id"], amount,
            round(float(paid or 0) + amount, 2),
            round(max(0.0, float(enrollment["coursePrice"]) - float(paid or 0) - amount), 2),
            method, installment, _now(), actor_id, request_key,
        ),
    )
    _audit(
        connection, actor_id, "PAYMENT_RECORDED",
        {
            "amount": amount,
            "paymentMethod": method,
            "installmentNumber": installment,
            "studentName": enrollment["studentName"],
            "courseName": enrollment["courseName"],
        },
        enrollment["shopType"], enrollment_id=enrollment["id"], payment_id=payment_id,
    )
    return payment_id, True


def create_course(store, body, actor):
    if actor["role"] != "ADMIN":
        raise TrainingError(403, "Seul un administrateur peut gérer le catalogue des formations")
    name = str(body.get("name") or "").strip()
    if not name:
        raise TrainingError(400, "Nom de formation requis")
    price = _money(body.get("price"), "Tarif")
    description = str(body.get("description") or "").strip()
    duration = str(body.get("duration") or "").strip()
    now = _now()
    course_id = str(uuid.uuid4())
    try:
        with store._connect() as connection:
            connection.execute(
                '''INSERT INTO "TrainingCourse" (
                       id, name, description, price, duration, isActive, createdAt, updatedAt, createdById
                   ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)''',
                (course_id, name, description, price, duration, now, now, actor["id"]),
            )
            _audit(connection, actor["id"], "COURSE_CREATED", {"name": name, "price": price}, course_id=course_id)
            return dict(connection.execute(
                'SELECT * FROM "TrainingCourse" WHERE id = ?', (course_id,)
            ).fetchone())
    except sqlite3.IntegrityError as error:
        raise TrainingError(400, "Une formation avec ce nom existe déjà") from error


def update_course(store, course_id, body, actor):
    if actor["role"] != "ADMIN":
        raise TrainingError(403, "Seul un administrateur peut gérer le catalogue des formations")
    updates = {}
    if "name" in body:
        name = str(body.get("name") or "").strip()
        if not name:
            raise TrainingError(400, "Nom de formation requis")
        updates["name"] = name
    if "description" in body:
        updates["description"] = str(body.get("description") or "").strip()
    if "duration" in body:
        updates["duration"] = str(body.get("duration") or "").strip()
    if "price" in body:
        updates["price"] = _money(body.get("price"), "Tarif")
    if "isActive" in body:
        if not isinstance(body["isActive"], bool):
            raise TrainingError(400, "Statut de formation invalide")
        updates["isActive"] = int(body["isActive"])
    if not updates:
        raise TrainingError(400, "Aucune modification fournie")
    updates["updatedAt"] = _now()
    try:
        with store._connect() as connection:
            course = connection.execute(
                'SELECT id FROM "TrainingCourse" WHERE id = ?', (course_id,)
            ).fetchone()
            if not course:
                raise TrainingError(404, "Formation introuvable")
            assignments = ", ".join(f'"{key}" = ?' for key in updates)
            connection.execute(
                f'UPDATE "TrainingCourse" SET {assignments} WHERE id = ?',
                (*updates.values(), course_id),
            )
            _audit(connection, actor["id"], "COURSE_UPDATED", updates, course_id=course_id)
            return dict(connection.execute(
                'SELECT * FROM "TrainingCourse" WHERE id = ?', (course_id,)
            ).fetchone())
    except sqlite3.IntegrityError as error:
        raise TrainingError(400, "Une formation avec ce nom existe déjà") from error


def list_courses(store, include_inactive=False):
    with store._connect() as connection:
        where = "" if include_inactive else "WHERE isActive = 1"
        return [
            dict(row)
            for row in connection.execute(
                f'SELECT * FROM "TrainingCourse" {where} ORDER BY isActive DESC, name COLLATE NOCASE'
            ).fetchall()
        ]


def _enrollment_detail(connection, enrollment_id):
    row = connection.execute(
        '''SELECT e.*, u.name AS registeredBy FROM "TrainingEnrollment" e
           LEFT JOIN "User" u ON u.id = e.createdById WHERE e.id = ?''',
        (enrollment_id,),
    ).fetchone()
    if not row:
        return None
    enrollment = dict(row)
    payments = [
        dict(payment)
        for payment in connection.execute(
            '''SELECT p.*, u.name AS createdByName, v.name AS voidedByName
               FROM "TrainingPayment" p
               LEFT JOIN "User" u ON u.id = p.createdById
               LEFT JOIN "User" v ON v.id = p.voidedById
               WHERE p.enrollmentId = ? ORDER BY p.installmentNumber, p.createdAt''',
            (enrollment_id,),
        ).fetchall()
    ]
    enrollment["payments"] = payments
    enrollment["totalPaid"] = round(sum(float(p["amount"]) for p in payments if p["status"] == "VALIDATED"), 2)
    enrollment["remaining"] = round(max(0.0, enrollment["coursePrice"] - enrollment["totalPaid"]), 2)
    return enrollment


def list_enrollments(store, shop_type=None, query=None):
    clauses = []
    parameters = []
    if shop_type in {"HOMME", "FEMME"}:
        clauses.append("e.shopType = ?")
        parameters.append(shop_type)
    search = str((query or {}).get("q") or "").strip()
    if search:
        term = f"%{search}%"
        clauses.append("(e.studentName LIKE ? OR e.studentPhone LIKE ? OR e.courseName LIKE ?)")
        parameters.extend((term, term, term))
    if (query or {}).get("status") in {"ACTIVE", "WITHDRAWN"}:
        clauses.append("e.status = ?")
        parameters.append(query["status"])
    where = f'WHERE {" AND ".join(clauses)}' if clauses else ""
    with store._connect() as connection:
        ids = [
            row["id"]
            for row in connection.execute(
                f'''SELECT e.id FROM "TrainingEnrollment" e {where}
                    ORDER BY e.createdAt DESC, e.studentName COLLATE NOCASE''',
                parameters,
            ).fetchall()
        ]
        return [_enrollment_detail(connection, enrollment_id) for enrollment_id in ids]


def create_enrollment(store, body, actor, shop_type):
    student_name = str(body.get("studentName") or "").strip()
    if not student_name:
        raise TrainingError(400, "Nom de l’apprenant requis")
    if shop_type not in {"HOMME", "FEMME"}:
        raise TrainingError(400, "Shop invalide")
    course_id = str(body.get("courseId") or "").strip()
    next_due_date = _date(body.get("nextDueDate"), "Date de prochaine échéance")
    initial_amount = _money(body.get("initialAmount", 0), "Montant de la première tranche", allow_zero=True)
    method = _payment_method(body.get("paymentMethod"))
    request_key = str(body.get("requestKey") or "").strip() or None
    enrollment_id = str(uuid.uuid4())
    now = _now()
    with store._connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        if request_key:
            existing = connection.execute(
                'SELECT id, shopType, createdById FROM "TrainingEnrollment" WHERE requestKey = ?',
                (request_key,),
            ).fetchone()
            if existing:
                if existing["createdById"] != actor["id"] or existing["shopType"] != shop_type:
                    raise TrainingError(409, "Cette clé de requête est déjà utilisée")
                return _enrollment_detail(connection, existing["id"])
        course = connection.execute(
            'SELECT * FROM "TrainingCourse" WHERE id = ? AND isActive = 1', (course_id,)
        ).fetchone()
        if course is None:
            raise TrainingError(400, "Formation introuvable ou inactive")
        if initial_amount > float(course["price"]) + 0.001:
            raise TrainingError(400, "La première tranche dépasse le prix de la formation")
        connection.execute(
            '''INSERT INTO "TrainingEnrollment" (
                   id, studentName, studentPhone, studentEmail, courseId, courseName, coursePrice,
                   shopType, nextDueDate, requestKey, status, createdAt, updatedAt, createdById
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)''',
            (
                enrollment_id, student_name, str(body.get("studentPhone") or "").strip(),
                str(body.get("studentEmail") or "").strip(), course_id, course["name"],
                float(course["price"]), shop_type, next_due_date, request_key, now, now, actor["id"],
            ),
        )
        _audit(
            connection, actor["id"], "ENROLLMENT_CREATED",
            {"studentName": student_name, "courseName": course["name"], "coursePrice": float(course["price"])},
            shop_type, enrollment_id=enrollment_id, course_id=course_id,
        )
        if initial_amount > 0:
            enrollment = connection.execute(
                'SELECT * FROM "TrainingEnrollment" WHERE id = ?', (enrollment_id,)
            ).fetchone()
            _create_payment(
                connection, enrollment, actor["id"], initial_amount, method,
                f"{request_key}:initial" if request_key else None,
            )
        return _enrollment_detail(connection, enrollment_id)


def add_payment(store, enrollment_id, body, actor, shop_type):
    amount = _money(body.get("amount"), "Montant")
    method = _payment_method(body.get("paymentMethod"))
    request_key = str(body.get("requestKey") or "").strip() or None
    with store._connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        enrollment = connection.execute(
            'SELECT * FROM "TrainingEnrollment" WHERE id = ?', (enrollment_id,)
        ).fetchone()
        if enrollment is None:
            raise TrainingError(404, "Inscription introuvable")
        if shop_type and enrollment["shopType"] != shop_type:
            raise TrainingError(403, "Cet apprenant ne fait pas partie de votre shop")
        if enrollment["status"] != "ACTIVE":
            raise TrainingError(400, "Cette inscription n’accepte plus de paiement")
        payment_id, created = _create_payment(
            connection, enrollment, actor["id"], amount, method, request_key
        )
        if created:
            connection.execute(
                'UPDATE "TrainingEnrollment" SET updatedAt = ? WHERE id = ?',
                (_now(), enrollment_id),
            )
        result = _enrollment_detail(connection, enrollment_id)
        result["recordedPayment"] = next(
            payment for payment in result["payments"] if payment["id"] == payment_id
        )
        result["duplicateRequest"] = not created
        return result


def update_due_date(store, enrollment_id, value, actor, shop_type):
    due_date = _date(value, "Date de prochaine échéance")
    with store._connect() as connection:
        enrollment = connection.execute(
            'SELECT * FROM "TrainingEnrollment" WHERE id = ?', (enrollment_id,)
        ).fetchone()
        if enrollment is None:
            raise TrainingError(404, "Inscription introuvable")
        if shop_type and enrollment["shopType"] != shop_type:
            raise TrainingError(403, "Cet apprenant ne fait pas partie de votre shop")
        connection.execute(
            'UPDATE "TrainingEnrollment" SET nextDueDate = ?, updatedAt = ? WHERE id = ?',
            (due_date, _now(), enrollment_id),
        )
        _audit(
            connection, actor["id"], "DUE_DATE_UPDATED",
            {"nextDueDate": due_date}, enrollment["shopType"], enrollment_id=enrollment_id,
        )
        return _enrollment_detail(connection, enrollment_id)


def void_payment(store, payment_id, reason, actor, shop_type):
    reason = str(reason or "").strip()
    if not reason:
        raise TrainingError(400, "Motif de régularisation requis")
    with store._connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        payment = connection.execute(
            '''SELECT p.*, e.shopType, e.id AS enrollmentId
               FROM "TrainingPayment" p
               JOIN "TrainingEnrollment" e ON e.id = p.enrollmentId
               WHERE p.id = ?''',
            (payment_id,),
        ).fetchone()
        if payment is None:
            raise TrainingError(404, "Paiement introuvable")
        if shop_type and payment["shopType"] != shop_type:
            raise TrainingError(403, "Ce paiement ne fait pas partie de votre shop")
        if payment["status"] != "VALIDATED":
            raise TrainingError(400, "Ce paiement est déjà régularisé")
        now = _now()
        connection.execute(
            '''UPDATE "TrainingPayment"
               SET status = 'VOIDED', voidedAt = ?, voidedById = ?, voidReason = ?
               WHERE id = ?''',
            (now, actor["id"], reason, payment_id),
        )
        connection.execute(
            'UPDATE "TrainingEnrollment" SET updatedAt = ? WHERE id = ?',
            (now, payment["enrollmentId"]),
        )
        _audit(
            connection, actor["id"], "PAYMENT_VOIDED",
            {"paymentNumber": payment["paymentNumber"], "amount": payment["amount"], "reason": reason},
            payment["shopType"], enrollment_id=payment["enrollmentId"], payment_id=payment_id,
        )
        return _enrollment_detail(connection, payment["enrollmentId"])


def training_summary(store, query):
    bounds = None
    if query.get("startDate") and query.get("endDate"):
        start = _local_day_bounds(query["startDate"])
        end = _local_day_bounds(query["endDate"])
        if start and end:
            bounds = (start[0], end[1])
    shop_type = query.get("shopType")
    enrollment_clauses = ["status = 'ACTIVE'"]
    enrollment_parameters = []
    if shop_type in {"HOMME", "FEMME"}:
        enrollment_clauses.append("shopType = ?")
        enrollment_parameters.append(shop_type)
    enrollment_where = " AND ".join(enrollment_clauses)
    payment_clauses = ["p.status = 'VALIDATED'"]
    payment_parameters = []
    if bounds:
        payment_clauses.append("p.createdAt BETWEEN ? AND ?")
        payment_parameters.extend(bounds)
    if shop_type in {"HOMME", "FEMME"}:
        payment_clauses.append("e.shopType = ?")
        payment_parameters.append(shop_type)
    payment_where = " AND ".join(payment_clauses)
    today = date.today().isoformat()
    with store._connect() as connection:
        counts = connection.execute(
            f'''SELECT COUNT(*) AS enrollmentCount,
                       COUNT(DISTINCT studentPhone || ':' || studentName) AS learnerCount,
                       COALESCE(SUM(coursePrice), 0) AS expectedRevenue
                FROM "TrainingEnrollment" WHERE {enrollment_where}''',
            enrollment_parameters,
        ).fetchone()
        paid = connection.execute(
            f'''SELECT p.amount, p.paymentMethod, e.courseName, e.shopType
                FROM "TrainingPayment" p
                JOIN "TrainingEnrollment" e ON e.id = p.enrollmentId
                WHERE {payment_where}''',
            payment_parameters,
        ).fetchall()
        all_payment_clauses = ["p.status = 'VALIDATED'"]
        all_payment_parameters = []
        if shop_type in {"HOMME", "FEMME"}:
            all_payment_clauses.append("e.shopType = ?")
            all_payment_parameters.append(shop_type)
        all_paid = connection.execute(
            f'''SELECT COALESCE(SUM(p.amount), 0) FROM "TrainingPayment" p
                JOIN "TrainingEnrollment" e ON e.id = p.enrollmentId
                WHERE {" AND ".join(all_payment_clauses)}''',
            all_payment_parameters,
        ).fetchone()[0]
        remaining_balance = connection.execute(
            f'''SELECT COALESCE(SUM(MAX(e.coursePrice - COALESCE((
                    SELECT SUM(p.amount) FROM "TrainingPayment" p
                    WHERE p.enrollmentId = e.id AND p.status = 'VALIDATED'
                ), 0), 0)), 0)
                FROM "TrainingEnrollment" e
                WHERE {enrollment_where}''',
            enrollment_parameters,
        ).fetchone()[0]
        overdue_clauses = [*enrollment_clauses, "nextDueDate IS NOT NULL", "nextDueDate < ?"]
        overdue_parameters = [*enrollment_parameters, today]
        overdue = connection.execute(
            f'''SELECT COUNT(*) FROM "TrainingEnrollment" e
                WHERE {" AND ".join("e." + clause if clause != "status = 'ACTIVE'" else "e.status = 'ACTIVE'" for clause in overdue_clauses)}
                  AND e.coursePrice > COALESCE((
                    SELECT SUM(p.amount) FROM "TrainingPayment" p
                    WHERE p.enrollmentId = e.id AND p.status = 'VALIDATED'
                  ), 0)''',
            overdue_parameters,
        ).fetchone()[0]
        courses = connection.execute(
            f'''SELECT e.courseId, e.courseName, e.shopType,
                       COUNT(DISTINCT CASE WHEN e.status = 'ACTIVE' THEN e.id END) AS enrollmentCount,
                       COALESCE(SUM(p.amount), 0) AS periodRevenue
                FROM "TrainingEnrollment" e
                LEFT JOIN "TrainingPayment" p ON p.enrollmentId = e.id
                    AND p.status = 'VALIDATED'
                    {"AND p.createdAt BETWEEN ? AND ?" if bounds else ""}
                WHERE 1 = 1 {"AND e.shopType = ?" if shop_type in {"HOMME", "FEMME"} else ""}
                GROUP BY e.courseId, e.courseName, e.shopType
                ORDER BY periodRevenue DESC, e.courseName COLLATE NOCASE''',
            ([*bounds] if bounds else []) + ([shop_type] if shop_type in {"HOMME", "FEMME"} else []),
        ).fetchall()
        audit_clauses = []
        audit_parameters = []
        if shop_type in {"HOMME", "FEMME"}:
            audit_clauses.append("a.shopType = ?")
            audit_parameters.append(shop_type)
        audit_where = f'WHERE {" AND ".join(audit_clauses)}' if audit_clauses else ""
        audit = [
            {
                **dict(row),
                "actorName": row["actorName"] or row["currentActorName"],
                "details": json.loads(row["details"] or "{}"),
            }
            for row in connection.execute(
                f'''SELECT a.*, u.name AS currentActorName,
                           e.studentName, e.courseName,
                           p.installmentNumber, p.paymentNumber
                    FROM "TrainingAudit" a
                    LEFT JOIN "User" u ON u.id = a.createdById
                    LEFT JOIN "TrainingEnrollment" e ON e.id = a.enrollmentId
                    LEFT JOIN "TrainingPayment" p ON p.id = a.paymentId
                    {audit_where}
                    ORDER BY a.createdAt DESC LIMIT 50''',
                audit_parameters,
            ).fetchall()
        ]

    payments = [payment_method_breakdown(row["paymentMethod"], row["amount"]) for row in paid]
    breakdown = {
        method: round(sum(payment[method] for payment in payments), 2)
        for method in ("CASH", "ONLINE", "ORANGE_MONEY")
    }
    return {
        "courseCount": len(list_courses(store, include_inactive=False)),
        "enrollmentCount": int(counts["enrollmentCount"] or 0),
        "learnerCount": int(counts["learnerCount"] or 0),
        "expectedRevenue": round(float(counts["expectedRevenue"] or 0), 2),
        "periodRevenue": round(sum(float(row["amount"] or 0) for row in paid), 2),
        "totalPaid": round(float(all_paid or 0), 2),
        "remainingBalance": round(float(remaining_balance or 0), 2),
        "overdueCount": int(overdue or 0),
        "paymentCount": len(paid),
        "payments": breakdown,
        "byCourse": [dict(row) for row in courses],
        "audit": audit,
    }
