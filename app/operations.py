import sqlite3
import threading
import time
from datetime import datetime, timezone
from pathlib import Path


def perform_database_backup(database_path, force=False, backups_directory=None):
    database = Path(database_path)
    if not database.exists():
        return None
    backups_dir = Path(backups_directory) if backups_directory else database.parent / "backups"
    backups_dir.mkdir(parents=True, exist_ok=True)
    current = sorted(
        path for path in backups_dir.glob("dev_backup_*.db") if path.is_file()
    )
    if not force and current and time.time() - current[-1].stat().st_mtime < 4 * 24 * 60 * 60:
        return None

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    filename = f"dev_backup_{timestamp}.db"
    target = backups_dir / filename
    temporary = target.with_suffix(".db.tmp")
    source = sqlite3.connect(database, timeout=10)
    destination = None
    try:
        result = source.execute("PRAGMA quick_check").fetchone()
        if not result or result[0] != "ok":
            return None
        destination = sqlite3.connect(temporary)
        source.backup(destination)
        backup_check = destination.execute("PRAGMA quick_check").fetchone()
        destination.close()
        destination = None
        if not backup_check or backup_check[0] != "ok":
            return None
        temporary.replace(target)
    except sqlite3.Error:
        return None
    finally:
        if destination is not None:
            destination.close()
        source.close()
        if temporary.exists():
            temporary.unlink()

    updated = sorted(path for path in backups_dir.glob("dev_backup_*.db") if path.is_file())
    for old_backup in updated[:-10]:
        try:
            old_backup.unlink()
        except OSError:
            pass
    return filename


def get_backups_list(backups_directory):
    backups_dir = Path(backups_directory)
    if not backups_dir.exists():
        return []
    result = []
    for backup in backups_dir.glob("dev_backup_*.db"):
        if not backup.is_file():
            continue
        stat = backup.stat()
        result.append({
            "filename": backup.name,
            "sizeBytes": stat.st_size,
            "sizeFormatted": f"{stat.st_size / 1024:.1f} KB",
            "createdAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        })
    return sorted(result, key=lambda entry: entry["createdAt"], reverse=True)


def schedule_automatic_backups(database_path, backups_directory=None, interval_seconds=24 * 60 * 60):
    stopped = threading.Event()

    def run():
        while not stopped.is_set():
            perform_database_backup(database_path, backups_directory=backups_directory)
            stopped.wait(interval_seconds)

    worker = threading.Thread(target=run, name="pos-database-backup", daemon=True)
    worker.start()
    return stopped


def list_windows_printers():
    import win32print

    default_printer = win32print.GetDefaultPrinter()
    flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
    printers = win32print.EnumPrinters(flags, None, 2)
    return {
        "configured": default_printer or "Default",
        "printers": [
            {
                "Name": printer["pPrinterName"],
                "Default": printer["pPrinterName"] == default_printer,
                "PrinterStatus": printer.get("Status", 0),
            }
            for printer in printers
        ],
    }


def database_diagnostics(database_path):
    database = Path(database_path)
    result = {
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "databasePath": str(database),
        "databaseExists": database.exists(),
        "walExists": Path(f"{database}-wal").exists(),
        "shmExists": Path(f"{database}-shm").exists(),
    }
    if not database.exists():
        result["status"] = "missing"
        return result
    try:
        connection = sqlite3.connect(f"file:{database.as_posix()}?mode=ro", uri=True, timeout=5)
        try:
            tables = [
                row[0]
                for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
            ]
            result["tables"] = tables
            result["quickCheck"] = connection.execute("PRAGMA quick_check").fetchone()[0]
            if "User" in tables:
                result["userCount"] = connection.execute('SELECT COUNT(*) FROM "User"').fetchone()[0]
                result["userColumns"] = [row[1] for row in connection.execute('PRAGMA table_info("User")')]
            if "Category" in tables:
                result["categoryCount"] = connection.execute('SELECT COUNT(*) FROM "Category"').fetchone()[0]
        finally:
            connection.close()
        result["status"] = "ok" if result.get("quickCheck") == "ok" else "error"
    except sqlite3.Error as error:
        result["status"] = "error"
        result["error"] = str(error)
    return result