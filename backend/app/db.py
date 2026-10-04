"""Database access: Neon Postgres when DATABASE_URL is set (production on Vercel), else the local SQLite file.

Both engines have the same tables (backend/db/schema.sql and schema.postgres.sql). Queries are written once with `?`
placeholders; rows come back as plain dicts with dates as ISO strings and numbers as floats, so the rest of the app
doesn't care which engine it's talking to.

On the first connection in a process the schema is applied (it's idempotent). An empty Postgres database is then
seeded with the NSW dataset copied from the committed SQLite file.
"""

import datetime as dt
import decimal
import os
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path

DB_DIR = Path(__file__).resolve().parents[1] / "db"
DB_PATH = Path(os.getenv("CIRCULINK_DB", DB_DIR / "circulink.db"))
# Vercel's Neon integration sets DATABASE_URL (and POSTGRES_URL); either works.
DATABASE_URL = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or ""

_ready: set[str] = set()
_ready_lock = threading.Lock()


def is_postgres() -> bool:
    return bool(DATABASE_URL)


def _value(v):
    if isinstance(v, dt.datetime):
        return v.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if isinstance(v, dt.date):
        return v.isoformat()
    if isinstance(v, decimal.Decimal):
        return float(v)
    return v


class Result:
    def __init__(self, rows: list[dict], rowcount: int = 0):
        self._rows = rows
        self.rowcount = rowcount

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return self._rows

    def __iter__(self):
        return iter(self._rows)


class DB:
    """A connection with one API for both engines. Use `?` placeholders."""

    def __init__(self, raw, postgres: bool):
        self.raw = raw
        self.postgres = postgres

    def execute(self, sql: str, params=()) -> Result:
        if self.postgres:
            cur = self.raw.execute(sql.replace("?", "%s"), params)
            if cur.description is None:
                return Result([], cur.rowcount)
            cols = [c.name for c in cur.description]
            return Result([{k: _value(v) for k, v in zip(cols, r)} for r in cur.fetchall()], cur.rowcount)
        cur = self.raw.execute(sql, params)
        rows = cur.fetchall()
        cols = [c[0] for c in cur.description] if cur.description else []
        return Result([dict(zip(cols, r)) for r in rows], cur.rowcount)

    def insert(self, table: str, row: dict) -> int:
        """Insert one row and return its id."""
        sql = f"insert into {table} ({', '.join(row)}) values ({', '.join('?' * len(row))}) returning id"
        return self.execute(sql, list(row.values())).fetchone()["id"]


def integrity_errors() -> tuple[type[Exception], ...]:
    """Exception types raised when a CHECK, UNIQUE or foreign key rejects a write."""
    errors: list[type[Exception]] = [sqlite3.IntegrityError]
    try:
        import psycopg
        errors.append(psycopg.errors.IntegrityError)
    except ImportError:
        pass
    return tuple(errors)


@contextmanager
def connect():
    """A transaction: commits on success, rolls back on error."""
    if is_postgres():
        import psycopg
        raw = psycopg.connect(DATABASE_URL, connect_timeout=10, autocommit=True)  # transaction() below is the unit of work
        try:
            with raw.transaction():
                db = DB(raw, True)
                _ensure_ready(db)
                yield db
        finally:
            raw.close()
        return

    if not DB_PATH.exists():
        raise RuntimeError(f"No database at {DB_PATH}. Run: python backend/scripts/load_db.py")
    raw = sqlite3.connect(DB_PATH)
    raw.execute("pragma foreign_keys = on")  # off by default in SQLite
    try:
        with raw:
            db = DB(raw, False)
            _ensure_ready(db)
            yield db
    finally:
        raw.close()


def _ensure_ready(db: DB) -> None:
    key = DATABASE_URL or str(DB_PATH)
    if key in _ready:
        return
    with _ready_lock:
        if key in _ready:
            return
        if db.postgres:
            db.raw.execute((DB_DIR / "schema.postgres.sql").read_text(encoding="utf-8"))
            seed_postgres(db)
        else:
            db.raw.executescript((DB_DIR / "schema.sql").read_text(encoding="utf-8"))
            upgrade_sqlite(db)
        seed_demo_accounts(db)
        from .trade import seed_demo_activity  # trade imports impact, which imports this module
        seed_demo_activity(db)
        _ready.add(key)


def upgrade_sqlite(db: DB) -> None:
    """Columns added after a SQLite file was first created (schema.sql only creates missing tables)."""
    for table, column, ddl in (
        ("producers", "geo_source", "text check (geo_source in ('npi', 'locality', 'user'))"),
        ("manufacturers", "geo_source", "text check (geo_source in ('npi', 'locality', 'user'))"),
        ("enquiries", "account_id", "integer references accounts (id) on delete set null"),
    ):
        cols = {r["name"] for r in db.execute(f"pragma table_info({table})")}
        if column not in cols:
            db.execute(f"alter table {table} add column {column} {ddl}")


# Columns copied from SQLite to Postgres (max_price_aud_per_t is generated, so it's left out).
PRODUCER_COLUMNS = [
    "id", "name", "abn", "legal_entity", "activity", "website", "locality", "address", "postcode", "state", "lat", "lng",
    "geo_source", "material_focus", "input_materials", "output_material", "output_quantity_t", "output_grade",
    "compliance", "price_aud_per_t", "supply_start", "supply_end", "is_synthetic", "created_at", "updated_at",
]
MANUFACTURER_COLUMNS = [
    "id", "name", "abn", "legal_entity", "activity", "website", "locality", "address", "postcode", "state", "lat", "lng",
    "geo_source", "required_material", "product", "required_quantity_t", "budget_aud", "output_grade_request",
    "order_by", "deliver_by", "purchase_start", "purchase_end", "is_synthetic", "created_at", "updated_at",
]


def seed_postgres(db: DB, replace_synthetic: bool = False) -> int:
    """Copy the NSW dataset (is_synthetic rows) from the committed SQLite file into Postgres.

    Runs automatically when Postgres has no producers yet. With replace_synthetic=True (the sync script) it updates
    the dataset rows in place by id and removes dataset rows that are no longer in the file, so updated spreadsheets
    can be pushed without touching users' rows, or quote requests already sent to dataset businesses.
    Returns the number of rows copied.
    """
    db.execute("select pg_advisory_xact_lock(4242)")  # one seeder at a time across cold starts
    if not replace_synthetic and db.execute("select count(*) as n from producers").fetchone()["n"]:
        return 0
    source = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)  # Vercel's file system is read-only
    copied = 0
    try:
        for table, columns in (("producers", PRODUCER_COLUMNS), ("manufacturers", MANUFACTURER_COLUMNS)):
            rows = source.execute(f"select {', '.join(columns)} from {table} where is_synthetic = 1").fetchall()
            placeholders = ", ".join("%s" for _ in columns)
            values = [tuple(bool(v) if c == "is_synthetic" else v for c, v in zip(columns, r)) for r in rows]
            on_conflict = "do nothing"
            if replace_synthetic:
                ids = [r[0] for r in rows]
                db.execute(f"delete from {table} where is_synthetic and not (id = any(?))", (ids,))
                updates = ", ".join(f"{c} = excluded.{c}" for c in columns if c not in ("id", "created_at"))
                on_conflict = f"do update set {updates} where {table}.is_synthetic"
            with db.raw.cursor() as cur:
                # Keep the SQLite ids so p1..p63 / m1..m61 mean the same thing everywhere; user rows never clash
                # because new ids continue after the highest one.
                cur.executemany(
                    f"insert into {table} ({', '.join(columns)}) overriding system value values ({placeholders}) "
                    f"on conflict (id) {on_conflict}", values)
            db.execute(f"select setval(pg_get_serial_sequence('{table}', 'id'), greatest((select max(id) from {table}), 1))")
            copied += len(rows)
    finally:
        source.close()
    return copied


DEMO_ACCOUNTS = [
    # email, name, company, abn, role, locality, state, lat, lng. ABNs starting 99000 are placeholders.
    ("buyer@demo.resourcex.au", "Alex Morgan", "Westlink Cable Co.", "99000000001", "buyer", "Wetherill Park", "NSW", -33.847, 150.9),
    ("seller@demo.resourcex.au", "Sam Taylor", "Hunter Copper Reclaim", "99000000002", "seller", "Kooragang", "NSW", -32.87, 151.76),
]


def seed_demo_accounts(db: DB) -> None:
    """The one-click demo logins. Their password hash is unusable; they sign in through /auth/demo only."""
    for email, name, company, abn, role, locality, state, lat, lng in DEMO_ACCOUNTS:
        db.execute(
            "insert into accounts (email, password_hash, name, company, abn, role, locality, state, lat, lng, is_demo) "
            "values (?, '!demo', ?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict (email) do nothing",
            (email, name, company, abn, role, locality, state, lat, lng, True if db.postgres else 1))
