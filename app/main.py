import asyncio
import os
import secrets
import sqlite3
import uuid
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

from app.auth import create_session_token, hash_pin, verify_pin, verify_session_token
from app.print_jobs import InvalidAgentToken, InvalidJobState, PrintJobStore, UnknownStation
from app.schema import ensure_schema
from app.invoices import InvoiceError, cancel_invoice, create_invoice
from app.queries import client_stats, get_invoice_with_relations, list_clients, list_invoices
from app.reservations import (
    ReservationError,
    add_reservation_payment,
    cancel_reservation,
    create_reservation,
    create_reservation_invoice,
    delete_reservation,
    list_reservations,
    reservation_payments,
    update_reservation,
)
from app.deliveries import (
    DeliveryError,
    list_deliveries,
    list_delivery_persons,
    update_deliveries_bulk,
    update_delivery,
    upsert_delivery_person,
)
from app.reports import dashboard_stats, product_sales_report, z_report
from app.operations import (
    database_diagnostics,
    get_backups_list,
    list_windows_printers,
    perform_database_backup,
    schedule_automatic_backups,
)


def database_path():
    configured = os.getenv("POS_DB_PATH")
    if configured:
        return Path(configured).expanduser().resolve()
    root_database = ROOT / "dev.db"
    prisma_database = ROOT / "prisma" / "dev.db"
    return root_database if root_database.exists() or not prisma_database.exists() else prisma_database


def ensure_database_ready(database_file):
    database_file = Path(database_file)
    if database_file.exists():
        try:
            connection = sqlite3.connect(database_file)
            try:
                result = connection.execute("PRAGMA quick_check").fetchone()
                if result and result[0] == "ok":
                    return database_file
            finally:
                connection.close()
        except sqlite3.DatabaseError:
            pass

        backup_dir = ROOT / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        backup_path = backup_dir / f"{database_file.stem}-corrupt-{uuid.uuid4().hex[:8]}.db"
        if database_file.exists():
            database_file.replace(backup_path)

    database_file.parent.mkdir(parents=True, exist_ok=True)
    sqlite3.connect(database_file).close()
    return database_file


def ensure_default_admin(store):
    with store._connect() as connection:
        has_users = connection.execute('SELECT COUNT(*) FROM "User"').fetchone()[0]
        if has_users:
            return
        admin_name = os.getenv("POS_ADMIN_NAME", "Administrateur")
        admin_pin = os.getenv("POS_ADMIN_PIN", "1234")
        connection.execute(
            'INSERT INTO "User" (id, name, pin, role, permissions, needsPinReset) VALUES (?, ?, ?, ?, ?, ?)',
            (str(uuid.uuid4()), admin_name, hash_pin(admin_pin), "ADMIN", "ALL", 0),
        )


def create_app(store=None):
    app = FastAPI(title="POS Server", version="0.1.0")
    app.state.print_store = store
    configured_session_secret = os.getenv("POS_SESSION_SECRET")
    app.state.session_secret = (
        configured_session_secret.encode("utf-8")
        if configured_session_secret
        else secrets.token_bytes(32)
    )
    app.state.station_events = {}
    app.state.agent_sockets = {}
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    if store is None:
        @app.on_event("startup")
        async def start_automatic_backups():
            app.state.backup_stop = schedule_automatic_backups(database_path(), ROOT / "backups")

        @app.on_event("shutdown")
        async def stop_automatic_backups():
            stop_event = getattr(app.state, "backup_stop", None)
            if stop_event:
                stop_event.set()

    def authenticated_user(request):
        scheme, _, token = (request.headers.get("authorization") or "").partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise HTTPException(status_code=401, detail="Authentification requise")
        user_id = verify_session_token(token, app.state.session_secret)
        if not user_id:
            raise HTTPException(status_code=401, detail="Session invalide ou expirée")
        with get_store()._connect() as connection:
            user = connection.execute(
                'SELECT id, role, shopType FROM "User" WHERE id = ?', (user_id,)
            ).fetchone()
        if user is None:
            raise HTTPException(status_code=401, detail="Session invalide ou expirée")
        return {
            "id": user["id"],
            "role": user["role"] or "CASHIER",
            "shopType": user["shopType"] or "ALL",
        }

    def require_admin(request):
        user = authenticated_user(request)
        if user["role"] != "ADMIN":
            raise HTTPException(status_code=403, detail="Droits administrateur requis")
        return user

    @app.get("/api/users")
    def list_users():
        with get_store()._connect() as connection:
            rows = connection.execute(
                'SELECT id, name, role, permissions, needsPinReset, shopType FROM "User" ORDER BY name ASC'
            ).fetchall()
        return [
            {
                "id": row["id"],
                "name": row["name"],
                "role": row["role"] or "CASHIER",
                "permissions": row["permissions"] or "ALL",
                "needsPinReset": bool(row["needsPinReset"]),
                "shopType": row["shopType"] or "ALL",
            }
            for row in rows
        ]

    @app.post("/api/users", status_code=201)
    async def create_user(request: Request):
        actor = authenticated_user(request)
        body = await request.json()
        name = str(body.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Nom requis")
        pin = str(body.get("pin") or "").strip()
        initial_pin = pin if len(pin) >= 4 else "0000"
        valid_permissions = {"ALL", "DIRECT_SALE", "CUSTOMER_SERVICE"}
        permissions = body.get("permissions") if body.get("permissions") in valid_permissions else "ALL"
        role = body.get("role") if body.get("role") in {"CASHIER", "MANAGER", "ADMIN"} else "CASHIER"
        shop_type = body.get("shopType") or "ALL"
        if actor["role"] == "MANAGER":
            if role != "CASHIER" or actor["shopType"] not in {"HOMME", "FEMME"}:
                raise HTTPException(status_code=403, detail="Un gérant peut uniquement gérer les caissiers de son shop")
            if shop_type not in {"ALL", actor["shopType"]}:
                raise HTTPException(status_code=403, detail="Shop non autorisé")
            shop_type = actor["shopType"]
        elif actor["role"] != "ADMIN":
            raise HTTPException(status_code=403, detail="Droits insuffisants")
        if shop_type not in {"ALL", "HOMME", "FEMME"}:
            raise HTTPException(status_code=400, detail="Shop invalide")
        needs_reset = 1 if role == "CASHIER" else 0
        result = {"id": str(uuid.uuid4()), "name": name, "role": role, "permissions": permissions, "shopType": shop_type, "needsPinReset": bool(needs_reset)}
        try:
            with get_store()._connect() as connection:
                connection.execute(
                    'INSERT INTO "User" (id, name, pin, role, permissions, needsPinReset, shopType) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    (result["id"], name, hash_pin(initial_pin), role, permissions, needs_reset, shop_type),
                )
        except sqlite3.IntegrityError as error:
            raise HTTPException(status_code=400, detail="Un utilisateur avec ce nom existe déjà") from error
        return result

    @app.put("/api/users/{user_id}")
    async def update_user(user_id: str, request: Request):
        actor = authenticated_user(request)
        body = await request.json()
        with get_store()._connect() as connection:
            current_user = connection.execute(
                'SELECT id, role, shopType FROM "User" WHERE id = ?', (user_id,)
            ).fetchone()
        if current_user is None:
            raise HTTPException(status_code=404, detail="Utilisateur introuvable")
        if actor["role"] == "MANAGER":
            if (
                current_user["role"] != "CASHIER"
                or (current_user["shopType"] or "ALL") != actor["shopType"]
                or body.get("role", "CASHIER") != "CASHIER"
                or body.get("shopType", actor["shopType"]) != actor["shopType"]
            ):
                raise HTTPException(status_code=403, detail="Utilisateur hors de votre périmètre")
        elif actor["role"] != "ADMIN":
            raise HTTPException(status_code=403, detail="Droits insuffisants")
        updates = {}
        if body.get("name") and str(body["name"]).strip():
            updates["name"] = str(body["name"]).strip()
        if body.get("role") in {"CASHIER", "MANAGER", "ADMIN"}:
            updates["role"] = str(body["role"])
        if body.get("shopType"):
            if body["shopType"] not in {"ALL", "HOMME", "FEMME"}:
                raise HTTPException(status_code=400, detail="Shop invalide")
            updates["shopType"] = str(body["shopType"])
        if body.get("permissions") in {"ALL", "DIRECT_SALE", "CUSTOMER_SERVICE"}:
            updates["permissions"] = body["permissions"]
        pin = str(body.get("pin") or "").strip()
        if len(pin) >= 4:
            updates["pin"] = hash_pin(pin)
            updates["needsPinReset"] = 0
        if not updates:
            with get_store()._connect() as connection:
                user = connection.execute(
                    'SELECT id, name, role, permissions, needsPinReset, shopType FROM "User" WHERE id = ?', (user_id,)
                ).fetchone()
            if user is None:
                raise HTTPException(status_code=404, detail="Utilisateur introuvable")
            return {**dict(user), "needsPinReset": bool(user["needsPinReset"]), "shopType": user["shopType"] or "ALL"}
        try:
            with get_store()._connect() as connection:
                assignments = ", ".join(f'"{column}" = ?' for column in updates)
                cursor = connection.execute(
                    f'UPDATE "User" SET {assignments} WHERE id = ?', (*updates.values(), user_id)
                )
                if cursor.rowcount == 0:
                    raise HTTPException(status_code=404, detail="Utilisateur introuvable")
                user = connection.execute(
                    'SELECT id, name, role, permissions, needsPinReset, shopType FROM "User" WHERE id = ?', (user_id,)
                ).fetchone()
        except sqlite3.IntegrityError as error:
            raise HTTPException(status_code=400, detail="Un utilisateur avec ce nom existe déjà") from error
        return {**dict(user), "needsPinReset": bool(user["needsPinReset"]), "shopType": user["shopType"] or "ALL"}

    @app.delete("/api/users/{user_id}")
    def delete_user(user_id: str, request: Request):
        actor = authenticated_user(request)
        with get_store()._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            user = connection.execute('SELECT id, role, shopType FROM "User" WHERE id = ?', (user_id,)).fetchone()
            if user is None:
                raise HTTPException(status_code=404, detail="Utilisateur introuvable")
            if actor["role"] == "MANAGER":
                if user["role"] != "CASHIER" or (user["shopType"] or "ALL") != actor["shopType"]:
                    raise HTTPException(status_code=403, detail="Utilisateur hors de votre périmètre")
            elif actor["role"] != "ADMIN":
                raise HTTPException(status_code=403, detail="Droits insuffisants")
            if user["role"] == "ADMIN":
                raise HTTPException(status_code=400, detail="Impossible de supprimer un administrateur")
            admin = connection.execute('SELECT id FROM "User" WHERE role = \'ADMIN\' LIMIT 1').fetchone()
            if admin:
                connection.execute('UPDATE "Invoice" SET createdById = ? WHERE createdById = ?', (admin["id"], user_id))
                connection.execute('UPDATE "Invoice" SET cancelledById = NULL WHERE cancelledById = ?', (user_id,))
                connection.execute('UPDATE "Reservation" SET createdById = ? WHERE createdById = ?', (admin["id"], user_id))
                connection.execute('UPDATE "Reservation" SET updatedById = NULL WHERE updatedById = ?', (user_id,))
                connection.execute('UPDATE "ReservationPayment" SET createdById = ? WHERE createdById = ?', (admin["id"], user_id))
            connection.execute('DELETE FROM "User" WHERE id = ?', (user_id,))
        return {"message": "Utilisateur supprimé"}

    @app.post("/api/auth/login")
    async def login(request: Request):
        body = await request.json()
        user_id = body.get("userId")
        pin = body.get("pin")
        if not user_id or not pin:
            raise HTTPException(status_code=400, detail="ID utilisateur et code PIN requis")
        with get_store()._connect() as connection:
            user = connection.execute(
                'SELECT id, name, pin, role, permissions, needsPinReset, shopType FROM "User" WHERE id = ?',
                (user_id,),
            ).fetchone()
        if user is None:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
        if not verify_pin(str(pin), user["pin"]):
            raise HTTPException(status_code=401, detail="Code PIN incorrect")
        return {
            "id": user["id"],
            "name": user["name"],
            "role": user["role"],
            "shopType": user["shopType"] or "ALL",
            "permissions": user["permissions"] or "ALL",
            "needsPinReset": bool(user["needsPinReset"]),
            "accessToken": create_session_token(user["id"], app.state.session_secret),
        }

    @app.post("/api/auth/reset-pin")
    async def reset_pin(request: Request):
        body = await request.json()
        user_id = body.get("userId")
        old_pin = body.get("oldPin")
        new_pin = str(body.get("newPin") or "")
        if not user_id or not old_pin or not new_pin:
            raise HTTPException(status_code=400, detail="Tous les champs sont requis")
        if len(new_pin) < 4:
            raise HTTPException(status_code=400, detail="Le nouveau code PIN doit comporter au moins 4 chiffres")
        with get_store()._connect() as connection:
            user = connection.execute('SELECT id, pin FROM "User" WHERE id = ?', (user_id,)).fetchone()
            if user is None:
                raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
            if not verify_pin(str(old_pin), user["pin"]):
                raise HTTPException(status_code=401, detail="Ancien code PIN incorrect")
            connection.execute(
                'UPDATE "User" SET pin = ?, needsPinReset = 0 WHERE id = ?',
                (hash_pin(new_pin), user_id),
            )
        return {"message": "Code PIN personnalisé mis à jour avec succès"}

    @app.get("/api/categories")
    def list_categories():
        with get_store()._connect() as connection:
            categories = connection.execute('SELECT id, name, color, COALESCE(shopType, \'ALL\') AS shopType FROM "Category" ORDER BY name ASC').fetchall()
            subcategories = connection.execute(
                'SELECT id, name, categoryId, COALESCE(price, 0) AS price FROM "SubCategory" ORDER BY name ASC'
            ).fetchall()
        subs_by_category = {}
        for subcategory in subcategories:
            subs_by_category.setdefault(subcategory["categoryId"], []).append(dict(subcategory))
        return [
            {**dict(category), "subCategories": subs_by_category.get(category["id"], [])}
            for category in categories
        ]

    @app.get("/api/clients")
    def get_clients(request: Request):
        try:
            return list_clients(get_store(), request.query_params.get("q", ""))
        except sqlite3.OperationalError:
            return []

    @app.get("/api/clients/stats")
    def get_client_stats(request: Request):
        try:
            return client_stats(get_store(), request.query_params.get("q", ""))
        except sqlite3.OperationalError:
            return []

    @app.get("/api/invoices")
    def get_invoices(request: Request):
        return list_invoices(get_store(), dict(request.query_params))

    @app.delete("/api/invoices/{invoice_id}")
    async def delete_invoice(invoice_id: str, request: Request):
        try:
            body = await request.json()
        except Exception:
            body = {}
        admin_pin = request.headers.get("x-admin-pin") or body.get("adminPin") or request.query_params.get("adminPin")
        admin_id = request.headers.get("x-admin-id") or body.get("adminId") or request.query_params.get("adminId")
        if not admin_pin:
            raise HTTPException(status_code=400, detail="Mot de passe administrateur requis")
        with get_store()._connect() as connection:
            if admin_id:
                admin = connection.execute('SELECT id, pin, role FROM "User" WHERE id = ?', (admin_id,)).fetchone()
            else:
                admin = connection.execute(
                    'SELECT id, pin, role FROM "User" WHERE role = \'ADMIN\' LIMIT 1'
                ).fetchone()
            if admin is None:
                raise HTTPException(status_code=403, detail="Compte administrateur introuvable")
            if admin["role"] != "ADMIN":
                raise HTTPException(status_code=403, detail="Compte administrateur introuvable")
            if not verify_pin(str(admin_pin), admin["pin"]):
                raise HTTPException(status_code=401, detail="Mot de passe administrateur incorrect")
            cursor = connection.execute('DELETE FROM "Invoice" WHERE id = ?', (invoice_id,))
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Facture non trouvée")
        return {"message": "Facture supprimée avec succès"}

    @app.post("/api/invoices/{invoice_id}/cancel")
    async def cancel_invoice_route(invoice_id: str, request: Request):
        body = await request.json()
        try:
            return cancel_invoice(
                get_store(),
                invoice_id,
                body.get("adminId"),
                body.get("adminPin"),
                body.get("cancellationReason"),
            )
        except InvoiceError as error:
            raise HTTPException(status_code=error.status_code, detail=str(error)) from error

    @app.get("/api/reservations")
    def get_reservations(request: Request):
        return list_reservations(get_store(), dict(request.query_params))

    @app.post("/api/reservations", status_code=201)
    async def post_reservation(request: Request):
        try:
            result = create_reservation(get_store(), await request.json())
            if result.get("printJob"):
                notify_station(result["printJob"]["stationId"])
            return result
        except ReservationError as error:
            raise HTTPException(status_code=error.status_code, detail=str(error)) from error

    @app.post("/api/reservations/{reservation_id}/payments")
    async def post_reservation_payment(reservation_id: str, request: Request):
        try:
            result = add_reservation_payment(get_store(), reservation_id, await request.json())
            if result.get("printJob"):
                notify_station(result["printJob"]["stationId"])
            return result
        except ReservationError as error:
            raise HTTPException(status_code=error.status_code, detail=str(error)) from error

    @app.put("/api/reservations/{reservation_id}")
    async def put_reservation(reservation_id: str, request: Request):
        try:
            result = update_reservation(get_store(), reservation_id, await request.json())
            if result.get("printJob"):
                notify_station(result["printJob"]["stationId"])
            return result
        except ReservationError as error:
            raise HTTPException(status_code=error.status_code, detail=str(error)) from error

    @app.post("/api/reservations/{reservation_id}/cancel")
    def post_cancel_reservation(reservation_id: str):
        try:
            return cancel_reservation(get_store(), reservation_id)
        except ReservationError as error:
            raise HTTPException(status_code=error.status_code, detail=str(error)) from error

    @app.delete("/api/reservations/{reservation_id}")
    def delete_reservation_route(reservation_id: str):
        try:
            return delete_reservation(get_store(), reservation_id)
        except ReservationError as error:
            raise HTTPException(status_code=error.status_code, detail=str(error)) from error

    @app.post("/api/reservations/{reservation_id}/create-invoice", status_code=201)
    async def post_create_reservation_invoice(reservation_id: str, request: Request):
        body = await request.json()
        try:
            invoice = create_reservation_invoice(
                get_store(), reservation_id, body.get("createdById"), body.get("stationId")
            )
            if invoice.get("printJob"):
                notify_station(invoice["printJob"]["stationId"])
            return invoice
        except ReservationError as error:
            raise HTTPException(status_code=error.status_code, detail=str(error)) from error

    @app.get("/api/reservation-payments")
    def get_reservation_payments(request: Request):
        return reservation_payments(get_store(), dict(request.query_params))

    @app.get("/api/delivery-persons")
    def get_delivery_persons():
        try:
            return list_delivery_persons(get_store())
        except sqlite3.OperationalError:
            return []

    @app.post("/api/delivery-persons")
    async def post_delivery_person(request: Request):
        body = await request.json()
        try:
            return upsert_delivery_person(get_store(), body.get("name"), body.get("phone"))
        except DeliveryError as error:
            raise HTTPException(status_code=error.status_code, detail=str(error)) from error

    @app.get("/api/deliveries")
    def get_deliveries(request: Request):
        try:
            return list_deliveries(get_store(), dict(request.query_params))
        except sqlite3.OperationalError:
            return []

    @app.put("/api/deliveries/{invoice_id}/status")
    async def put_delivery_status(invoice_id: str, request: Request):
        try:
            return update_delivery(get_store(), invoice_id, await request.json())
        except DeliveryError as error:
            raise HTTPException(status_code=error.status_code, detail=str(error)) from error

    @app.post("/api/deliveries/bulk-status")
    async def post_deliveries_bulk(request: Request):
        try:
            return update_deliveries_bulk(get_store(), await request.json())
        except DeliveryError as error:
            raise HTTPException(status_code=error.status_code, detail=str(error)) from error


    @app.get("/api/products")
    def list_products(request: Request):
        shop_type = request.query_params.get("shopType")
        with get_store()._connect() as connection:
            if shop_type and shop_type != "ALL":
                rows = connection.execute(
                    'SELECT id, name, price, category, shopType, createdAt FROM "Product" WHERE shopType = ? OR shopType = \'ALL\' ORDER BY name ASC',
                    (shop_type,)
                ).fetchall()
            else:
                rows = connection.execute(
                    'SELECT id, name, price, category, shopType, createdAt FROM "Product" ORDER BY name ASC'
                ).fetchall()
        return [dict(row) for row in rows]

    @app.post("/api/products", status_code=201)
    async def create_product(request: Request):
        body = await request.json()
        name = str(body.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Nom du produit requis")
        try:
            price = float(body.get("price") or 0)
        except (ValueError, TypeError):
            price = 0
        category = str(body.get("category") or "PRODUIT").strip()
        shop_type = str(body.get("shopType") or "ALL").strip()
        product_id = str(uuid.uuid4())
        with get_store()._connect() as connection:
            connection.execute(
                'INSERT INTO "Product" (id, name, price, category, shopType) VALUES (?, ?, ?, ?, ?)',
                (product_id, name, price, category, shop_type)
            )
        return {"id": product_id, "name": name, "price": price, "category": category, "shopType": shop_type}

    @app.put("/api/products/{product_id}")
    async def update_product(product_id: str, request: Request):
        body = await request.json()
        updates = {}
        if "name" in body:
            updates["name"] = str(body["name"]).strip()
        if "price" in body:
            try:
                updates["price"] = float(body["price"])
            except (ValueError, TypeError):
                pass
        if "category" in body:
            updates["category"] = str(body["category"]).strip()
        if "shopType" in body:
            updates["shopType"] = str(body["shopType"]).strip()
        if updates:
            with get_store()._connect() as connection:
                assignments = ", ".join(f'"{col}" = ?' for col in updates)
                connection.execute(f'UPDATE "Product" SET {assignments} WHERE id = ?', (*updates.values(), product_id))
        with get_store()._connect() as connection:
            row = connection.execute('SELECT id, name, price, category, shopType, createdAt FROM "Product" WHERE id = ?', (product_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Produit non trouvé")
            return dict(row)

    @app.delete("/api/products/{product_id}")
    def delete_product(product_id: str):
        with get_store()._connect() as connection:
            connection.execute('DELETE FROM "Product" WHERE id = ?', (product_id,))
        return {"message": "Produit supprimé avec succès"}

    @app.post("/api/system/reset-salon")
    def api_reset_salon(request: Request):
        require_admin(request)
        from reset_and_seed import reset_and_seed
        reset_and_seed()
        return {"success": True, "message": "Salon réinitialisé avec succès"}

    @app.get("/api/stats")
    def get_stats(request: Request):
        return dashboard_stats(get_store(), dict(request.query_params))

    @app.get("/api/z-report")
    def get_z_report(request: Request):
        return z_report(get_store(), dict(request.query_params))

    @app.get("/api/product-sales-report")
    def get_product_sales_report(request: Request):
        return product_sales_report(get_store(), dict(request.query_params))

    @app.post("/api/categories", status_code=201)
    async def create_category(request: Request):
        body = await request.json()
        name = str(body.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Nom requis")
        shop_type = str(body.get("shopType") or "ALL").strip()
        if shop_type not in {"ALL", "HOMME", "FEMME"}:
            raise HTTPException(status_code=400, detail="Shop invalide")
        category = {
            "id": str(uuid.uuid4()),
            "name": name,
            "color": body.get("color") or "bg-blue-500",
            "shopType": shop_type,
            "subCategories": [],
        }
        try:
            with get_store()._connect() as connection:
                connection.execute(
                    'INSERT INTO "Category" (id, name, color, shopType) VALUES (?, ?, ?, ?)',
                    (category["id"], category["name"], category["color"], category["shopType"]),
                )
        except sqlite3.IntegrityError as error:
            raise HTTPException(status_code=400, detail="Le nom de catégorie est déjà utilisé") from error
        return category

    @app.put("/api/categories/{category_id}")
    async def update_category(category_id: str, request: Request):
        body = await request.json()
        updates = {}
        if body.get("name"):
            updates["name"] = str(body["name"]).strip()
        if body.get("color"):
            updates["color"] = body["color"]
        if not updates:
            raise HTTPException(status_code=400, detail="Aucun champ à mettre à jour")
        try:
            with get_store()._connect() as connection:
                assignments = ", ".join(f'"{column}" = ?' for column in updates)
                cursor = connection.execute(
                    f'UPDATE "Category" SET {assignments} WHERE id = ?', (*updates.values(), category_id)
                )
                if cursor.rowcount == 0:
                    raise HTTPException(status_code=500, detail="Erreur lors de la mise à jour de la catégorie")
                category = connection.execute(
                    'SELECT id, name, color, shopType FROM "Category" WHERE id = ?', (category_id,)
                ).fetchone()
                subs = connection.execute(
                    'SELECT id, name, categoryId FROM "SubCategory" WHERE categoryId = ? ORDER BY name ASC',
                    (category_id,),
                ).fetchall()
        except sqlite3.IntegrityError as error:
            raise HTTPException(status_code=400, detail="Le nom de catégorie est déjà utilisé") from error
        return {**dict(category), "shopType": category["shopType"] or "ALL", "subCategories": [dict(sub) for sub in subs]}

    @app.delete("/api/categories/{category_id}")
    def delete_category(category_id: str):
        with get_store()._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute('DELETE FROM "SubCategory" WHERE categoryId = ?', (category_id,))
            connection.execute('DELETE FROM "Category" WHERE id = ?', (category_id,))
        return {"message": "Catégorie supprimée avec succès"}

    @app.post("/api/categories/{category_id}/duplicate", status_code=201)
    async def duplicate_category(category_id: str, request: Request):
        body = await request.json()
        new_name = str(body.get("newName") or "").strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Nouveau nom requis")
        new_id = str(uuid.uuid4())
        try:
            with get_store()._connect() as connection:
                connection.execute("BEGIN IMMEDIATE")
                original = connection.execute(
                    'SELECT id, color, shopType FROM "Category" WHERE id = ?', (category_id,)
                ).fetchone()
                if original is None:
                    raise HTTPException(status_code=404, detail="Catégorie originale non trouvée")
                connection.execute(
                    'INSERT INTO "Category" (id, name, color, shopType) VALUES (?, ?, ?, ?)',
                    (new_id, new_name, original["color"] or "bg-blue-500", original["shopType"] or "ALL"),
                )
                source_subs = connection.execute(
                    'SELECT name FROM "SubCategory" WHERE categoryId = ? ORDER BY name ASC', (category_id,)
                ).fetchall()
                for sub in source_subs:
                    connection.execute(
                        'INSERT INTO "SubCategory" (id, name, categoryId) VALUES (?, ?, ?)',
                        (str(uuid.uuid4()), sub["name"], new_id),
                    )
                subs = connection.execute(
                    'SELECT id, name, categoryId FROM "SubCategory" WHERE categoryId = ? ORDER BY name ASC',
                    (new_id,),
                ).fetchall()
        except sqlite3.IntegrityError as error:
            raise HTTPException(status_code=400, detail="Le nom de catégorie est déjà utilisé") from error
        return {
            "id": new_id,
            "name": new_name,
            "color": original["color"] or "bg-blue-500",
            "shopType": original["shopType"] or "ALL",
            "subCategories": [dict(sub) for sub in subs],
        }

    @app.post("/api/subcategories/batch", status_code=201)
    async def create_subcategories_batch(request: Request):
        body = await request.json()
        name = str(body.get("name") or "").strip()
        category_ids = body.get("categoryIds")
        if not name or not isinstance(category_ids, list) or not category_ids:
            raise HTTPException(status_code=400, detail="Nom et identifiants de catégories requis")
        created = []
        with get_store()._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            for category_id in category_ids:
                exists = connection.execute(
                    'SELECT 1 FROM "SubCategory" WHERE name = ? AND categoryId = ?', (name, category_id)
                ).fetchone()
                if exists:
                    continue
                subcategory = {"id": str(uuid.uuid4()), "name": name, "categoryId": category_id}
                connection.execute(
                    'INSERT INTO "SubCategory" (id, name, categoryId) VALUES (?, ?, ?)',
                    (subcategory["id"], name, category_id),
                )
                created.append(subcategory)
        return {"message": f"{len(created)} sous-catégorie(s) créée(s)", "created": created}

    @app.post("/api/subcategories", status_code=201)
    async def create_subcategory(request: Request):
        body = await request.json()
        name = str(body.get("name") or "").strip()
        category_id = body.get("categoryId")
        if not name or not category_id:
            raise HTTPException(status_code=400, detail="Nom et catégorie parent requis")
        subcategory = {"id": str(uuid.uuid4()), "name": name, "categoryId": category_id}
        try:
            with get_store()._connect() as connection:
                connection.execute(
                    'INSERT INTO "SubCategory" (id, name, categoryId) VALUES (?, ?, ?)',
                    (subcategory["id"], name, category_id),
                )
        except sqlite3.IntegrityError as error:
            raise HTTPException(status_code=400, detail="Une sous-catégorie avec ce nom existe déjà dans cette catégorie") from error
        return subcategory

    @app.put("/api/subcategories/{subcategory_id}")
    async def update_subcategory(subcategory_id: str, request: Request):
        body = await request.json()
        name = str(body.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Nom requis")
        try:
            with get_store()._connect() as connection:
                cursor = connection.execute(
                    'UPDATE "SubCategory" SET name = ? WHERE id = ?', (name, subcategory_id)
                )
                if cursor.rowcount == 0:
                    raise HTTPException(status_code=500, detail="Erreur lors de la mise à jour de la sous-catégorie")
                subcategory = connection.execute(
                    'SELECT id, name, categoryId FROM "SubCategory" WHERE id = ?', (subcategory_id,)
                ).fetchone()
        except sqlite3.IntegrityError as error:
            raise HTTPException(status_code=400, detail="Une sous-catégorie avec ce nom existe déjà dans cette catégorie") from error
        return dict(subcategory)

    @app.delete("/api/subcategories/{subcategory_id}")
    def delete_subcategory(subcategory_id: str):
        with get_store()._connect() as connection:
            connection.execute('DELETE FROM "SubCategory" WHERE id = ?', (subcategory_id,))
        return {"message": "Sous-catégorie supprimée avec succès"}

    def agent_station(authorization):
        scheme, _, token = (authorization or "").partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise HTTPException(status_code=401, detail="Station agent authentication required")
        try:
            return get_store().authenticate_agent(token)
        except InvalidAgentToken as error:
            raise HTTPException(status_code=401, detail=str(error)) from error

    def get_store():
        if app.state.print_store is None:
            database_file = ensure_database_ready(database_path())
            app.state.print_store = PrintJobStore(database_file)
            with app.state.print_store._connect() as connection:
                ensure_schema(connection)
            ensure_default_admin(app.state.print_store)
        return app.state.print_store

    def station_event(station_id):
        if station_id not in app.state.station_events:
            app.state.station_events[station_id] = asyncio.Event()
        return app.state.station_events[station_id]

    def notify_station(station_id):
        event = app.state.station_events.get(station_id)
        if event:
            event.set()

    @app.exception_handler(HTTPException)
    async def http_error_response(request: Request, exception: HTTPException):
        return JSONResponse(status_code=exception.status_code, content={"error": exception.detail})

    @app.get("/api/heartbeat")
    def heartbeat():
        return {"status": "ok"}

    @app.get("/api/debug")
    def debug():
        result = database_diagnostics(database_path())
        result["dbPath"] = result["databasePath"]
        result["dbExists"] = result["databaseExists"]
        return result

    @app.get("/api/printers")
    def get_printers():
        try:
            return list_windows_printers()
        except Exception as error:
            raise HTTPException(status_code=500, detail=str(error)) from error

    @app.get("/api/admin/backups")
    def list_backups():
        return get_backups_list(ROOT / "backups")

    @app.post("/api/admin/backup")
    def create_manual_backup():
        filename = perform_database_backup(
            database_path(), force=True, backups_directory=ROOT / "backups"
        )
        if filename:
            return {"message": "Sauvegarde créée avec succès", "filename": filename}
        raise HTTPException(status_code=500, detail="Échec de la création de la sauvegarde")

    @app.post("/api/invoices", status_code=201)
    async def create_invoice_route(request: Request):
        try:
            invoice = create_invoice(get_store(), await request.json())
            if invoice.get("printJob"):
                notify_station(invoice["printJob"].get("stationId", ""))
            return invoice
        except InvoiceError as error:
            raise HTTPException(status_code=error.status_code, detail=str(error)) from error

    @app.post("/api/print", status_code=202)
    async def enqueue_print(request: Request, idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")):
        body = await request.json()
        station_id = body.get("stationId")
        if not station_id:
            raise HTTPException(status_code=400, detail="stationId is required")
        payload = {key: value for key, value in body.items() if key not in {"stationId", "idempotencyKey"}}
        invoice = payload.get("invoiceData") or payload.get("reservation") or {}
        invoice_id = invoice.get("id")
        idempotency_key = idempotency_key or body.get("idempotencyKey")
        try:
            result = get_store().enqueue(station_id, payload, invoice_id, idempotency_key)
        except UnknownStation as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        notify_station(station_id)
        return result

    @app.get("/api/print/jobs/{job_id}")
    def get_print_job(job_id: str, request: Request):
        station_id = request.query_params.get("stationId") or request.query_params.get("station_id", "")
        job = get_store().get_job(station_id, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Print job not found")
        return job

    @app.post("/api/print/test", status_code=202)
    async def enqueue_test_print(request: Request):
        body = await request.json()
        station_id = body.get("stationId")
        if not station_id:
            raise HTTPException(status_code=400, detail="stationId is required")
        store = get_store()
        with store._connect() as connection:
            station = connection.execute(
                "SELECT name FROM PrintStation WHERE id = ? AND active = 1", (station_id,)
            ).fetchone()
        if station is None:
            raise HTTPException(status_code=404, detail="Unknown or inactive print station")
        try:
            result = store.enqueue(
                station_id,
                {
                    "testPage": True,
                    "stationName": station["name"],
                    "invoiceData": {"createdBy": {"name": "Darren"}},
                },
            )
        except UnknownStation as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        notify_station(station_id)
        return {**result, "stationId": station_id}

    @app.post("/api/print/agent/heartbeat")
    async def print_agent_heartbeat(request: Request, authorization: str | None = Header(default=None)):
        station = agent_station(authorization)
        body = await request.json()
        _, _, token = (authorization or "").partition(" ")
        try:
            heartbeat = get_store().record_agent_heartbeat(
                token,
                body.get("hostName"),
                body.get("printerName"),
                body.get("agentVersion"),
            )
        except InvalidAgentToken as error:
            raise HTTPException(status_code=401, detail=str(error)) from error
        return {**heartbeat, "stationName": station["name"]}

    @app.get("/api/print/stations")
    def list_print_stations():
        return get_store().list_stations()

    @app.post("/api/print/stations", status_code=201)
    async def create_print_station(request: Request):
        body = await request.json()
        name = str(body.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Station name is required")
        try:
            return get_store().create_station(name)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    @app.delete("/api/print/stations/{station_id}")
    async def delete_print_station(station_id: str, request: Request):
        admin_pin = request.headers.get("x-admin-pin") or request.query_params.get("adminPin")
        if not admin_pin:
            raise HTTPException(status_code=400, detail="Code PIN administrateur requis")
        store = get_store()
        ensure_default_admin(store)
        with store._connect() as connection:
            admin = connection.execute(
                'SELECT id, pin, role FROM "User" WHERE role = \'ADMIN\' LIMIT 1'
            ).fetchone()
            if admin is None:
                raise HTTPException(status_code=403, detail="Compte administrateur introuvable")
            if admin["role"] != "ADMIN":
                raise HTTPException(status_code=403, detail="Compte administrateur introuvable")
            if not verify_pin(str(admin_pin), admin["pin"]):
                raise HTTPException(status_code=401, detail="Mot de passe administrateur incorrect")
            station = connection.execute(
                'SELECT id, name FROM PrintStation WHERE id = ? AND active = 1', (station_id,)
            ).fetchone()
            if station is None:
                raise HTTPException(status_code=404, detail="Périphérique introuvable")
            connection.execute("UPDATE PrintStation SET active = 0, lastSeen = NULL WHERE id = ?", (station_id,))
        return {"stationId": station["id"], "name": station["name"], "revoked": True}

    @app.get("/api/print/agent/next")
    def next_print_job(authorization: str | None = Header(default=None)):
        station = agent_station(authorization)
        try:
            job = get_store().claim_next(station["stationId"])
        except UnknownStation as error:
            raise HTTPException(status_code=401, detail=str(error)) from error
        return {"job": job}

    @app.websocket("/api/print/agent/ws")
    async def print_agent_socket(websocket: WebSocket):
        authorization = websocket.headers.get("authorization", "")
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token:
            await websocket.close(code=4401)
            return
        try:
            station = get_store().authenticate_agent(token)
        except InvalidAgentToken:
            await websocket.close(code=4401)
            return

        station_id = station["stationId"]
        await websocket.accept()
        previous = app.state.agent_sockets.get(station_id)
        if previous:
            await previous.close(code=4001, reason="A station agent reconnected")
        app.state.agent_sockets[station_id] = websocket
        event = station_event(station_id)
        try:
            while True:
                event.clear()
                job = get_store().claim_next(station_id)
                if job:
                    await websocket.send_json(job)
                    continue
                try:
                    await asyncio.wait_for(event.wait(), timeout=20)
                except asyncio.TimeoutError:
                    continue
        except WebSocketDisconnect:
            pass
        finally:
            if app.state.agent_sockets.get(station_id) is websocket:
                del app.state.agent_sockets[station_id]

    @app.post("/api/print/agent/jobs/{job_id}/{status}")
    async def update_print_job(job_id: str, status: str, request: Request, authorization: str | None = Header(default=None)):
        station = agent_station(authorization)
        body = await request.json()
        try:
            result = get_store().update_job(
                station["stationId"],
                job_id,
                body.get("leaseToken"),
                status,
                body.get("error"),
            )
            if result["status"] == "queued":
                notify_station(station["stationId"])
            return result
        except InvalidJobState as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

    frontend_dist = ROOT / "frontend" / "dist"
    if frontend_dist.exists():
        app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")

        @app.get("/{path:path}")
        def frontend_fallback(path: str):
            target = (frontend_dist / path).resolve()
            if target.is_relative_to(frontend_dist.resolve()) and target.is_file():
                return FileResponse(target)
            return FileResponse(frontend_dist / "index.html")

    return app


app = create_app()