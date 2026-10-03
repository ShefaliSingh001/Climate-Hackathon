"""SQLite access. One short-lived connection per request; the dataset is small."""

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(os.getenv("CIRCULINK_DB", Path(__file__).resolve().parents[1] / "db" / "circulink.db"))


@contextmanager
def connect():
    if not DB_PATH.exists():
        raise RuntimeError(f"No database at {DB_PATH}. Run: python backend/scripts/load_db.py")
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("pragma foreign_keys = on")  # off by default in SQLite
    try:
        with db:  # commit on success, roll back on error
            yield db
    finally:
        db.close()
