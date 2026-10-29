import os
import sqlite3
import uuid
import time
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

from app.auth import hash_pin
from app.main import database_path
from app.schema import ensure_schema
from app.print_jobs import PrintJobStore


def reset_and_seed():
    db_file = database_path()
    print(f"Base de données cible : {db_file}")
    store = PrintJobStore(db_file)

    with store._connect() as connection:
        ensure_schema(connection)
        print("Schéma de base de données synchronisé.")

        # Vider les tables pour réinitialisation propre du salon
        tables_to_clear = [
            "InvoiceItem", "Invoice",
            "ReservationPayment", "ReservationItem", "Reservation",
            "SubCategory", "Category", "Product", "User"
        ]
        for table in tables_to_clear:
            try:
                connection.execute(f'DELETE FROM "{table}"')
            except sqlite3.OperationalError:
                pass

        print("Anciennes données purgées.")

        # 1. Utilisateurs (3 rôles : ADMIN, MANAGER, CASHIER)
        users = [
            ("Administrateur", "1234", "ADMIN", "ALL", "ALL"),
            ("Gérant Homme", "1111", "MANAGER", "ALL", "HOMME"),
            ("Gérante Femme", "2222", "MANAGER", "ALL", "FEMME"),
            ("Caissier Homme", "3333", "CASHIER", "ALL", "HOMME"),
            ("Caissière Femme", "4444", "CASHIER", "ALL", "FEMME"),
        ]
        for name, pin, role, perms, shop in users:
            connection.execute(
                'INSERT INTO "User" (id, name, pin, role, permissions, needsPinReset, shopType) VALUES (?, ?, ?, ?, ?, 0, ?)',
                (str(uuid.uuid4()), name, hash_pin(pin), role, perms, shop)
            )
        print(f"{len(users)} utilisateurs créés.")

        # 2. Catégories & Prestations de Services
        salon_services = [
            {
                "name": "Barber Homme",
                "color": "bg-amber-700",
                "shopType": "HOMME",
                "subs": [
                    ("Coupe simple homme", 2000),
                    ("Dégradé américain / Fade", 3000),
                    ("Barbe & Traçage contours", 1500),
                    ("Coupe + Barbe VIP", 4000),
                    ("Coloration barbe", 2500),
                    ("Rasage traditionnel à l'ancienne", 2000),
                ]
            },
            {
                "name": "Coiffure Homme",
                "color": "bg-stone-600",
                "shopType": "HOMME",
                "subs": [
                    ("Shampoing traitant homme", 1500),
                    ("Défrisage homme", 3000),
                    ("Soin capillaire cuir chevelu", 2500),
                ]
            },
            {
                "name": "Coiffure Femme & Tresses",
                "color": "bg-rose-600",
                "shopType": "FEMME",
                "subs": [
                    ("Tresses simples", 5000),
                    ("Nattes collées", 4000),
                    ("Rasta / Box Braids", 10000),
                    ("Nattes avec mèches", 8000),
                    ("Pose perruque & Customisation", 7000),
                    ("Tissage ouvert / fermé", 6000),
                    ("Shampoing + Brushing femme", 4000),
                    ("Défrisage & Soin nourrissant", 5000),
                ]
            },
            {
                "name": "Manucure & Pédicure",
                "color": "bg-amber-800",
                "shopType": "ALL",
                "subs": [
                    ("Manucure simple", 2500),
                    ("Pédicure complète spa", 4000),
                    ("Pose vernis simple", 1500),
                    ("Pose faux ongles / Résine / Gel", 7000),
                    ("Manucure + Pédicure Duo", 6000),
                ]
            },
            {
                "name": "Soin de Visage & Gommage",
                "color": "bg-emerald-700",
                "shopType": "ALL",
                "subs": [
                    ("Soin visage éclat hydratant", 5000),
                    ("Gommage visage & Masque purifiant", 6000),
                    ("Nettoyage de peau en profondeur", 8000),
                    ("Gommage corporel complet", 12000),
                ]
            },
            {
                "name": "Massage & Détente",
                "color": "bg-amber-900",
                "shopType": "ALL",
                "subs": [
                    ("Massage relaxant dos & nuque (30 min)", 6000),
                    ("Massage corps complet (1h)", 12000),
                    ("Massage crânien anti-stress", 5000),
                ]
            },
            {
                "name": "La Totale (Packs VIP)",
                "color": "bg-yellow-700",
                "shopType": "ALL",
                "subs": [
                    ("La Totale Homme VIP (Coupe + Barbe + Soin visage + Shampoing)", 10000),
                    ("La Totale Femme VIP (Coiffure + Manucure/Pédicure + Soin visage + Massage)", 25000),
                ]
            },
        ]

        total_subs = 0
        for cat in salon_services:
            cat_id = str(uuid.uuid4())
            connection.execute(
                'INSERT INTO "Category" (id, name, color, shopType) VALUES (?, ?, ?, ?)',
                (cat_id, cat["name"], cat["color"], cat["shopType"])
            )
            for sub_name, price in cat["subs"]:
                connection.execute(
                    'INSERT INTO "SubCategory" (id, name, categoryId, price) VALUES (?, ?, ?, ?)',
                    (str(uuid.uuid4()), sub_name, cat_id, price)
                )
                total_subs += 1

        print(f"{len(salon_services)} catégories de services et {total_subs} prestations créées.")

        # 3. Produits en Stock / Consommables (Mèches, Crèmes, etc.)
        products = [
            ("Mèche X-Pression", 2000, "Mèches", "FEMME"),
            ("Mèche Darling", 1500, "Mèches", "FEMME"),
            ("Mèche Curly / Bouclée", 3500, "Mèches", "FEMME"),
            ("Mèche Tissage Naturel", 15000, "Mèches", "FEMME"),
            ("Gel coiffant Eco Styler", 2500, "Produits capillaires", "ALL"),
            ("Cire coiffante mat", 2000, "Produits capillaires", "HOMME"),
            ("Huile de pousse & Sérum", 3000, "Produits capillaires", "ALL"),
            ("Vernis à ongles", 1000, "Beauté", "FEMME"),
            ("Crème hydratante visage", 4000, "Soins", "ALL"),
            ("Lames de rasoir professionnelles", 500, "Consommables", "HOMME"),
            ("Bonnet de protection satin", 2500, "Accessoires", "FEMME"),
        ]
        for name, price, category, shop in products:
            connection.execute(
                'INSERT INTO "Product" (id, name, price, category, shopType) VALUES (?, ?, ?, ?, ?)',
                (str(uuid.uuid4()), name, price, category, shop)
            )
        print(f"{len(products)} produits de stock ajoutés.")

        # Ensure station Homme & station Femme exist in PrintStation
        has_stations = connection.execute('SELECT COUNT(*) FROM PrintStation').fetchone()[0]
        if not has_stations:
            import secrets
            import hashlib
            for s_name in ["Caisse Shop Homme", "Caisse Shop Femme"]:
                s_id = str(uuid.uuid4())
                tok = secrets.token_hex(16)
                tok_hash = hashlib.sha256(tok.encode("utf-8")).hexdigest()
                connection.execute(
                    "INSERT INTO PrintStation (id, name, tokenHash, createdAt, active) VALUES (?, ?, ?, ?, 1)",
                    (s_id, s_name, tok_hash, time.time())
                )
            print("2 stations d'impression créées (Shop Homme & Shop Femme).")

    print("=== RÉINITIALISATION SALON DE BEAUTÉ TERMINÉE AVEC SUCCÈS ===")


if __name__ == "__main__":
    reset_and_seed()
