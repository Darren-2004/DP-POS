"""
Utilitaire : modifier le PIN de l'administrateur.
Usage : py change_admin_pin.py <nouveau_pin>
"""
import sys
from app.main import database_path
from app.auth import hash_pin

def main():
    if len(sys.argv) != 2:
        print("Usage: py change_admin_pin.py <nouveau_pin>")
        sys.exit(1)

    nouveau_pin = sys.argv[1].strip()
    if not nouveau_pin.isdigit():
        print("Erreur : le PIN doit être numérique.")
        sys.exit(1)

    db_path = database_path()
    import sqlite3
    con = sqlite3.connect(db_path)
    cur = con.cursor()
    cur.execute(
        'UPDATE "User" SET pin = ? WHERE role = "ADMIN"',
        (hash_pin(nouveau_pin),)
    )
    con.commit()
    rows = cur.rowcount
    con.close()

    if rows == 0:
        print("Aucun compte ADMIN trouve en base de donnees.")
    else:
        print(f"OK - PIN Admin mis a jour ! ({rows} compte(s) modifie(s))")

if __name__ == "__main__":
    main()
