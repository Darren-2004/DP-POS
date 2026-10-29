import hashlib
import hmac
import json
import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager
from pathlib import Path


class PrintJobError(Exception):
    pass


class UnknownStation(PrintJobError):
    pass


class InvalidAgentToken(PrintJobError):
    pass


class InvalidJobState(PrintJobError):
    pass


MAX_PREPRINT_ATTEMPTS = 3
STALE_JOB_SECONDS = 15 * 60


class PrintJobStore:
    def __init__(self, database_path):
        self.database_path = str(database_path)
        Path(self.database_path).parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _open_connection(self):
        connection = sqlite3.connect(self.database_path, timeout=5)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 5000")
        return connection

    @contextmanager
    def _connect(self):
        connection = self._open_connection()
        try:
            yield connection
            if connection.in_transaction:
                connection.commit()
        except Exception:
            if connection.in_transaction:
                connection.rollback()
            raise
        finally:
            connection.close()

    def _initialize(self):
        self._backup_before_schema_change()
        with self._connect() as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS PrintStation (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    tokenHash TEXT NOT NULL UNIQUE,
                    active INTEGER NOT NULL DEFAULT 1,
                    createdAt REAL NOT NULL,
                    lastSeen REAL,
                    hostName TEXT,
                    printerName TEXT,
                    agentVersion TEXT
                );

                CREATE TABLE IF NOT EXISTS PrintJob (
                    id TEXT PRIMARY KEY,
                    stationId TEXT NOT NULL REFERENCES PrintStation(id),
                    invoiceId TEXT,
                    payload TEXT NOT NULL,
                    idempotencyKey TEXT,
                    status TEXT NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued', 'claimed', 'printing', 'printed', 'failed', 'unknown')),
                    leaseToken TEXT,
                    leaseUntil REAL,
                    error TEXT,
                    attemptCount INTEGER NOT NULL DEFAULT 0,
                    nextAttemptAt REAL,
                    requiresConfirmation INTEGER NOT NULL DEFAULT 0,
                    createdAt REAL NOT NULL,
                    updatedAt REAL NOT NULL,
                    UNIQUE (stationId, idempotencyKey)
                );

                CREATE INDEX IF NOT EXISTS PrintJob_station_status_created
                    ON PrintJob(stationId, status, createdAt);
                """
            )
            self._ensure_columns(connection, "PrintStation", {
                "lastSeen": "REAL",
                "hostName": "TEXT",
                "printerName": "TEXT",
                "agentVersion": "TEXT",
            })
            self._ensure_columns(connection, "PrintJob", {
                "attemptCount": "INTEGER NOT NULL DEFAULT 0",
                "nextAttemptAt": "REAL",
                "requiresConfirmation": "INTEGER NOT NULL DEFAULT 0",
            })

    @staticmethod
    def _ensure_columns(connection, table_name, columns):
        existing = {row[1] for row in connection.execute(f'PRAGMA table_info("{table_name}")')}
        for column_name, column_type in columns.items():
            if column_name not in existing:
                connection.execute(f'ALTER TABLE "{table_name}" ADD COLUMN "{column_name}" {column_type}')

    def _backup_before_schema_change(self):
        database = Path(self.database_path)
        if not database.exists() or database.stat().st_size == 0:
            return

        source = sqlite3.connect(self.database_path, timeout=5)
        try:
            check = source.execute("PRAGMA quick_check").fetchone()
            if not check or check[0] != "ok":
                raise sqlite3.DatabaseError("Existing POS database failed SQLite quick_check; refusing print schema changes")
            tables = {
                row[0]
                for row in source.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
            }
            print_columns_missing = False
            expected_print_columns = {
                "PrintStation": {"lastSeen", "hostName", "printerName", "agentVersion"},
                "PrintJob": {"attemptCount", "nextAttemptAt", "requiresConfirmation"},
            }
            for table_name, columns in expected_print_columns.items():
                if table_name not in tables:
                    continue
                existing = {
                    row[1]
                    for row in source.execute(f'PRAGMA table_info("{table_name}")').fetchall()
                }
                if columns - existing:
                    print_columns_missing = True
                    break
            from app.schema import schema_needs_changes
            if not schema_needs_changes(source) and not print_columns_missing:
                return

            backup_directory = database.parent / "backups"
            backup_directory.mkdir(parents=True, exist_ok=True)
            backup_path = backup_directory / f"{database.stem}-before-print-schema-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:8]}.sqlite"
            destination = sqlite3.connect(backup_path)
            try:
                source.backup(destination)
                backup_check = destination.execute("PRAGMA quick_check").fetchone()
                if not backup_check or backup_check[0] != "ok":
                    raise sqlite3.DatabaseError("SQLite backup verification failed; refusing print schema changes")
            finally:
                destination.close()
        finally:
            source.close()

    @staticmethod
    def _token_hash(token):
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def create_station(self, name):
        clean_name = str(name or "").strip()
        if not clean_name:
            raise ValueError("Station name is required")
        station_id = str(uuid.uuid4())
        token = secrets.token_urlsafe(32)
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO PrintStation (id, name, tokenHash, createdAt) VALUES (?, ?, ?, ?)",
                (station_id, clean_name, self._token_hash(token), time.time()),
            )
        return {"stationId": station_id, "name": clean_name, "agentToken": token}

    def rotate_station_token(self, station_key):
        token = secrets.token_urlsafe(32)
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT id, name FROM PrintStation WHERE id = ? OR name = ? COLLATE NOCASE",
                (station_key, station_key),
            ).fetchall()
            if len(rows) != 1:
                raise ValueError("Station not found or name is ambiguous; use the station ID")
            station = rows[0]
            if not connection.execute(
                "SELECT 1 FROM PrintStation WHERE id = ? AND active = 1", (station["id"],)
            ).fetchone():
                raise ValueError("Cannot rotate a revoked station")
            connection.execute(
                "UPDATE PrintStation SET tokenHash = ?, lastSeen = NULL WHERE id = ?",
                (self._token_hash(token), station["id"]),
            )
        return {"stationId": station["id"], "name": station["name"], "agentToken": token}

    def revoke_station(self, station_key):
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT id, name FROM PrintStation WHERE id = ? OR name = ? COLLATE NOCASE",
                (station_key, station_key),
            ).fetchall()
            if len(rows) != 1:
                raise ValueError("Station not found or name is ambiguous; use the station ID")
            station = rows[0]
            connection.execute(
                "UPDATE PrintStation SET active = 0, lastSeen = NULL WHERE id = ?",
                (station["id"],),
            )
        return {"stationId": station["id"], "name": station["name"], "revoked": True}

    def authenticate_agent(self, token):
        if not token:
            raise InvalidAgentToken("Missing station agent token")
        digest = self._token_hash(token)
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT id, name, tokenHash FROM PrintStation WHERE active = 1"
            ).fetchall()
        for row in rows:
            if hmac.compare_digest(row["tokenHash"], digest):
                return {"stationId": row["id"], "name": row["name"]}
        raise InvalidAgentToken("Invalid station agent token")

    def record_agent_heartbeat(self, token, host_name=None, printer_name=None, agent_version=None):
        station = self.authenticate_agent(token)
        now = time.time()
        with self._connect() as connection:
            connection.execute(
                """UPDATE PrintStation SET lastSeen = ?, hostName = ?, printerName = ?, agentVersion = ?
                   WHERE id = ? AND active = 1""",
                (now, host_name, printer_name, agent_version, station["stationId"]),
            )
        return {"stationId": station["stationId"], "lastSeen": now}

    def list_stations(self, online_seconds=45):
        now = time.time()
        with self._connect() as connection:
            rows = connection.execute(
                """SELECT id, name, lastSeen, hostName, printerName, agentVersion
                   FROM PrintStation WHERE active = 1 ORDER BY name COLLATE NOCASE"""
            ).fetchall()
            result = []
            for row in rows:
                station = dict(row)
                last_seen = station["lastSeen"]
                station["online"] = last_seen is not None and now - last_seen <= online_seconds
                host_name = station["hostName"]
                printer_name = station["printerName"]
                duplicate = False
                if host_name and printer_name:
                    duplicate = connection.execute(
                        """SELECT 1 FROM PrintStation
                           WHERE active = 1 AND id != ? AND hostName = ? COLLATE NOCASE
                             AND printerName = ? COLLATE NOCASE LIMIT 1""",
                        (station["id"], host_name, printer_name),
                    ).fetchone() is not None
                station["duplicatePrinter"] = duplicate
                result.append(station)
        return result

    def enqueue(self, station_id, payload, invoice_id=None, idempotency_key=None):
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            return self.enqueue_in_transaction(connection, station_id, payload, invoice_id, idempotency_key)

    def enqueue_in_transaction(self, connection, station_id, payload, invoice_id=None, idempotency_key=None):
        serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        now = time.time()
        station = connection.execute(
            "SELECT id FROM PrintStation WHERE id = ? AND active = 1", (station_id,)
        ).fetchone()
        if station is None:
            raise UnknownStation("Unknown or inactive print station")

        if idempotency_key:
            existing = connection.execute(
                "SELECT id, status FROM PrintJob WHERE stationId = ? AND idempotencyKey = ?",
                (station_id, idempotency_key),
            ).fetchone()
            if existing:
                return {"jobId": existing["id"], "status": existing["status"], "duplicate": True}

        job_id = str(uuid.uuid4())
        connection.execute(
            """INSERT INTO PrintJob
               (id, stationId, invoiceId, payload, idempotencyKey, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (job_id, station_id, invoice_id, serialized, idempotency_key, now, now),
        )
        return {"jobId": job_id, "status": "queued", "duplicate": False}

    def claim_next(self, station_id, lease_seconds=30):
        now = time.time()
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            if not connection.execute(
                "SELECT 1 FROM PrintStation WHERE id = ? AND active = 1", (station_id,)
            ).fetchone():
                raise UnknownStation("Unknown or inactive print station")
            connection.execute(
                """UPDATE PrintJob SET status = 'unknown', requiresConfirmation = 1,
                       leaseToken = NULL, leaseUntil = NULL,
                       error = 'Print job expired; cashier confirmation required',
                       updatedAt = ?
                   WHERE stationId = ? AND status IN ('queued', 'claimed') AND createdAt <= ?""",
                (now, station_id, now - STALE_JOB_SECONDS),
            )
            connection.execute(
                """UPDATE PrintJob SET
                       status = CASE WHEN attemptCount >= ? THEN 'failed' ELSE 'queued' END,
                       leaseToken = NULL, leaseUntil = NULL,
                       nextAttemptAt = CASE WHEN attemptCount >= ? THEN NULL ELSE ? END,
                       error = COALESCE(error, 'Agent disconnected before printing'), updatedAt = ?
                   WHERE stationId = ? AND status = 'claimed' AND leaseUntil < ?""",
                (MAX_PREPRINT_ATTEMPTS, MAX_PREPRINT_ATTEMPTS, now + 5, now, station_id, now),
            )
            connection.execute(
                """UPDATE PrintJob SET status = 'unknown', requiresConfirmation = 1,
                       error = COALESCE(error, 'Agent stopped during printing'),
                       leaseToken = NULL, leaseUntil = NULL, updatedAt = ?
                   WHERE stationId = ? AND status = 'printing' AND leaseUntil < ?""",
                (now, station_id, now),
            )
            row = connection.execute(
                """SELECT id, invoiceId, payload FROM PrintJob
                         WHERE stationId = ? AND status = 'queued'
                            AND (nextAttemptAt IS NULL OR nextAttemptAt <= ?)
                         ORDER BY createdAt, id LIMIT 1""",
                     (station_id, now),
            ).fetchone()
            if row is None:
                return None

            lease_token = secrets.token_urlsafe(24)
            connection.execute(
                  """UPDATE PrintJob SET status = 'claimed', leaseToken = ?, leaseUntil = ?,
                      attemptCount = attemptCount + 1, updatedAt = ?
                   WHERE id = ? AND status = 'queued'""",
                (lease_token, now + lease_seconds, now, row["id"]),
            )
            return {
                "jobId": row["id"],
                "invoiceId": row["invoiceId"],
                "payload": json.loads(row["payload"]),
                "leaseToken": lease_token,
                "attemptCount": connection.execute(
                    "SELECT attemptCount FROM PrintJob WHERE id = ?", (row["id"],)
                ).fetchone()[0],
            }

    def update_job(self, station_id, job_id, lease_token, status, error=None, lease_seconds=300):
        transitions = {"printing", "printed", "failed", "unknown"}
        if status not in transitions:
            raise InvalidJobState("Unsupported print job status")

        now = time.time()
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                     """SELECT status, attemptCount FROM PrintJob
                   WHERE id = ? AND stationId = ? AND leaseToken = ?""",
                (job_id, station_id, lease_token),
            ).fetchone()
            if row is None:
                raise InvalidJobState("Print job lease is no longer valid")

            current = row["status"]
            allowed = {
                "claimed": {"printing", "failed"},
                "printing": {"printed", "failed", "unknown"},
            }
            if status not in allowed.get(current, set()):
                raise InvalidJobState(f"Cannot change print job from {current} to {status}")

            next_status = status
            next_attempt_at = None
            requires_confirmation = 1 if status == "unknown" else 0
            if status == "failed" and current == "claimed" and row["attemptCount"] < MAX_PREPRINT_ATTEMPTS:
                next_status = "queued"
                retry_delay = min(30, 5 * (2 ** (row["attemptCount"] - 1)))
                next_attempt_at = now + retry_delay

            lease_until = now + lease_seconds if status == "printing" else None
            connection.execute(
                """UPDATE PrintJob SET status = ?, error = ?, leaseUntil = ?, leaseToken = ?,
                       nextAttemptAt = ?, requiresConfirmation = ?, updatedAt = ?
                   WHERE id = ?""",
                (next_status, error, lease_until, lease_token if status == "printing" else None,
                 next_attempt_at, requires_confirmation, now, job_id),
            )
        return {
            "jobId": job_id,
            "status": next_status,
            "attemptCount": row["attemptCount"],
            "retryAt": next_attempt_at,
            "requiresConfirmation": bool(requires_confirmation),
        }

    def get_job(self, station_id, job_id):
        with self._connect() as connection:
            row = connection.execute(
                """SELECT id, invoiceId, status, error, attemptCount, nextAttemptAt AS retryAt, requiresConfirmation,
                          createdAt, updatedAt
                   FROM PrintJob WHERE id = ? AND stationId = ?""",
                (job_id, station_id),
            ).fetchone()
        return dict(row) if row else None