import re
import sqlite3


TABLES = {
    "User": '''CREATE TABLE IF NOT EXISTS "User" (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        pin TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT 'CASHIER',
        permissions TEXT NOT NULL DEFAULT 'ALL',
        needsPinReset INTEGER NOT NULL DEFAULT 1,
        shopType TEXT NOT NULL DEFAULT 'ALL'
    )''',
    "Category": '''CREATE TABLE IF NOT EXISTS "Category" (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        color TEXT NOT NULL DEFAULT 'bg-blue-500',
        shopType TEXT NOT NULL DEFAULT 'ALL'
    )''',
    "SubCategory": '''CREATE TABLE IF NOT EXISTS "SubCategory" (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        categoryId TEXT NOT NULL REFERENCES "Category"(id) ON DELETE CASCADE,
        price REAL NOT NULL DEFAULT 0,
        UNIQUE(name, categoryId)
    )''',
    "Product": '''CREATE TABLE IF NOT EXISTS "Product" (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        price REAL NOT NULL DEFAULT 0,
        category TEXT NOT NULL DEFAULT 'PRODUIT',
        shopType TEXT NOT NULL DEFAULT 'ALL',
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )''',
    "Invoice": '''CREATE TABLE IF NOT EXISTS "Invoice" (
        id TEXT PRIMARY KEY,
        invoiceNumber TEXT NOT NULL UNIQUE,
        totalAmount REAL NOT NULL,
        paymentMethod TEXT NOT NULL DEFAULT 'CASH',
        clientName TEXT,
        clientPhone TEXT,
        shopType TEXT NOT NULL DEFAULT 'FEMME',
        isReservation INTEGER NOT NULL DEFAULT 0,
        reservationNo TEXT,
        isDelivery INTEGER NOT NULL DEFAULT 0,
        deliveryNo TEXT,
        deliveryAddress TEXT,
        deliveryStatus TEXT,
        deliveredAt TEXT,
        deliveryFee REAL DEFAULT 0,
        deliveryPerson TEXT,
        isPaid INTEGER NOT NULL DEFAULT 0,
        paidAt TEXT,
        status TEXT NOT NULL DEFAULT 'VALIDATED',
        cancellationReason TEXT,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        createdById TEXT NOT NULL REFERENCES "User"(id),
        cancelledById TEXT REFERENCES "User"(id)
    )''',
    "InvoiceItem": '''CREATE TABLE IF NOT EXISTS "InvoiceItem" (
        id TEXT PRIMARY KEY,
        invoiceId TEXT NOT NULL REFERENCES "Invoice"(id) ON DELETE CASCADE,
        categoryName TEXT NOT NULL,
        price REAL NOT NULL,
        qty INTEGER NOT NULL DEFAULT 1,
        itemType TEXT NOT NULL DEFAULT 'SERVICE'
    )''',
    "Reservation": '''CREATE TABLE IF NOT EXISTS "Reservation" (
        id TEXT PRIMARY KEY,
        reservationNo TEXT NOT NULL UNIQUE,
        clientName TEXT NOT NULL,
        clientPhone TEXT,
        scheduledAt TEXT,
        bookingTime TEXT,
        serviceName TEXT,
        shopType TEXT NOT NULL DEFAULT 'FEMME',
        notes TEXT,
        totalAmount REAL NOT NULL DEFAULT 0,
        advanceAmount REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'PENDING',
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        createdById TEXT NOT NULL REFERENCES "User"(id),
        updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedById TEXT REFERENCES "User"(id)
    )''',
    "ReservationItem": '''CREATE TABLE IF NOT EXISTS "ReservationItem" (
        id TEXT PRIMARY KEY,
        reservationId TEXT NOT NULL REFERENCES "Reservation"(id) ON DELETE CASCADE,
        categoryName TEXT NOT NULL,
        price REAL NOT NULL,
        qty INTEGER NOT NULL DEFAULT 1
    )''',
    "ReservationPayment": '''CREATE TABLE IF NOT EXISTS "ReservationPayment" (
        id TEXT PRIMARY KEY,
        reservationId TEXT NOT NULL REFERENCES "Reservation"(id) ON DELETE CASCADE,
        amount REAL NOT NULL,
        paymentMethod TEXT NOT NULL DEFAULT 'CASH',
        installmentNumber INTEGER NOT NULL,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        createdById TEXT NOT NULL REFERENCES "User"(id)
    )''',
    "Client": '''CREATE TABLE IF NOT EXISTS "Client" (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        phone TEXT,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )''',
    "DeliveryPerson": '''CREATE TABLE IF NOT EXISTS "DeliveryPerson" (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        phone TEXT,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )''',
}


ADDITIVE_COLUMNS = {
    "User": {
        "pin": "TEXT NOT NULL DEFAULT ''",
        "role": "TEXT NOT NULL DEFAULT 'CASHIER'",
        "permissions": "TEXT NOT NULL DEFAULT 'ALL'",
        "needsPinReset": "INTEGER NOT NULL DEFAULT 1",
        "shopType": "TEXT NOT NULL DEFAULT 'ALL'",
    },
    "Category": {
        "color": "TEXT NOT NULL DEFAULT 'bg-blue-500'",
        "shopType": "TEXT NOT NULL DEFAULT 'ALL'",
    },
    "SubCategory": {
        "price": "REAL NOT NULL DEFAULT 0",
    },
    "Reservation": {
        "clientName": "TEXT",
        "clientPhone": "TEXT",
        "scheduledAt": "TEXT",
        "bookingTime": "TEXT",
        "serviceName": "TEXT",
        "shopType": "TEXT NOT NULL DEFAULT 'FEMME'",
        "notes": "TEXT",
        "totalAmount": "REAL NOT NULL DEFAULT 0",
        "advanceAmount": "REAL NOT NULL DEFAULT 0",
        "status": "TEXT NOT NULL DEFAULT 'PENDING'",
        "createdAt": "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
        "createdById": "TEXT",
        "updatedAt": "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
        "updatedById": "TEXT",
        "reservationNo": "TEXT",
    },
    "ReservationItem": {
        "reservationId": "TEXT",
        "categoryName": "TEXT",
        "price": "REAL NOT NULL DEFAULT 0",
        "qty": "INTEGER NOT NULL DEFAULT 1",
    },
    "ReservationPayment": {
        "reservationId": "TEXT",
        "amount": "REAL NOT NULL DEFAULT 0",
        "paymentMethod": "TEXT NOT NULL DEFAULT 'CASH'",
        "installmentNumber": "INTEGER NOT NULL DEFAULT 1",
        "createdAt": "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
        "createdById": "TEXT",
    },
    "Invoice": {
        "clientPhone": "TEXT",
        "shopType": "TEXT NOT NULL DEFAULT 'FEMME'",
        "isReservation": "INTEGER NOT NULL DEFAULT 0",
        "reservationNo": "TEXT",
        "isDelivery": "INTEGER NOT NULL DEFAULT 0",
        "deliveryNo": "TEXT",
        "deliveryAddress": "TEXT",
        "deliveryStatus": "TEXT",
        "deliveredAt": "TEXT",
        "deliveryFee": "REAL DEFAULT 0",
        "deliveryPerson": "TEXT",
        "isPaid": "INTEGER NOT NULL DEFAULT 0",
        "paidAt": "TEXT",
        "status": "TEXT NOT NULL DEFAULT 'VALIDATED'",
        "cancellationReason": "TEXT",
        "cancelledById": "TEXT",
    },
    "InvoiceItem": {
        "qty": "INTEGER NOT NULL DEFAULT 1",
        "itemType": "TEXT NOT NULL DEFAULT 'SERVICE'",
    },
}


INDEXES = (
    'CREATE UNIQUE INDEX IF NOT EXISTS User_name_key ON "User"(name)',
    'CREATE UNIQUE INDEX IF NOT EXISTS Category_name_key ON "Category"(name)',
    'CREATE UNIQUE INDEX IF NOT EXISTS Invoice_invoiceNumber_key ON "Invoice"(invoiceNumber)',
    'CREATE UNIQUE INDEX IF NOT EXISTS Reservation_reservationNo_key ON "Reservation"(reservationNo)',
    'CREATE UNIQUE INDEX IF NOT EXISTS Client_name_key ON "Client"(name)',
    'CREATE UNIQUE INDEX IF NOT EXISTS DeliveryPerson_name_key ON "DeliveryPerson"(name)',
    'CREATE UNIQUE INDEX IF NOT EXISTS SubCategory_name_categoryId_key ON "SubCategory"(name, categoryId)',
    'CREATE INDEX IF NOT EXISTS Invoice_createdAt_status_idx ON "Invoice"(createdAt, status)',
    'CREATE INDEX IF NOT EXISTS InvoiceItem_invoiceId_idx ON "InvoiceItem"(invoiceId)',
    'CREATE INDEX IF NOT EXISTS Reservation_createdAt_status_idx ON "Reservation"(createdAt, status)',
    'CREATE INDEX IF NOT EXISTS Reservation_scheduledAt_idx ON "Reservation"(scheduledAt)',
    'CREATE INDEX IF NOT EXISTS ReservationPayment_createdAt_idx ON "ReservationPayment"(createdAt)',
    'CREATE INDEX IF NOT EXISTS ReservationPayment_reservationId_idx ON "ReservationPayment"(reservationId)',
    'CREATE INDEX IF NOT EXISTS Product_name_idx ON "Product"(name)',
)


def schema_needs_changes(connection):
    tables = {
        row[0]
        for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
    }
    expected = set(TABLES) | {"PrintStation", "PrintJob"}
    if not expected.issubset(tables):
        return True
    for table_name, columns_to_add in ADDITIVE_COLUMNS.items():
        existing_columns = {
            row[1]
            for row in connection.execute(f'PRAGMA table_info("{table_name}")').fetchall()
        }
        if set(columns_to_add) - existing_columns:
            return True
    return False


def _table_columns(connection, table_name):
    return {
        row[1]
        for row in connection.execute(f'PRAGMA table_info("{table_name}")').fetchall()
    }


def _index_columns(statement):
    match = re.search(
        r'CREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+\S+\s+ON\s+"?([A-Za-z_]+)"?\s*\((.*)\)',
        statement,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    table_name = match.group(2)
    columns = [column.strip().strip('"') for column in match.group(3).split(',') if column.strip()]
    return table_name, columns


def ensure_schema(connection):
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("BEGIN IMMEDIATE")
    try:
        for table_name, statement in TABLES.items():
            connection.execute(statement)
            columns = _table_columns(connection, table_name)
            for column_name, definition in ADDITIVE_COLUMNS.get(table_name, {}).items():
                if column_name not in columns:
                    connection.execute(
                        f'ALTER TABLE "{table_name}" ADD COLUMN "{column_name}" {definition}'
                    )
        for statement in INDEXES:
            index_columns = _index_columns(statement)
            if index_columns is None:
                continue
            table_name, columns = index_columns
            if not connection.execute('SELECT name FROM sqlite_master WHERE type = "table" AND name = ?', (table_name,)).fetchone():
                continue
            existing_columns = _table_columns(connection, table_name)
            if not all(column in existing_columns for column in columns):
                continue
            connection.execute(statement)
        connection.commit()
    except Exception:
        if connection.in_transaction:
            connection.rollback()
        raise
