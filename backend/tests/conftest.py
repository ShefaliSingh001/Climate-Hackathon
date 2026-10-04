"""Shared fixtures for the impact tests (test_impact.py, test_forecast.py, test_report.py)."""

import shutil
from pathlib import Path

import pytest

from backend.app import db as db_module
from backend.app.impact import load_marketplace

SQLITE_FILE = Path(db_module.__file__).resolve().parents[1] / "db" / "circulink.db"


@pytest.fixture(scope="module")
def marketplace(tmp_path_factory):
    """(producers, manufacturers) read from a temporary copy of the committed SQLite file."""
    copy = tmp_path_factory.mktemp("db") / "circulink.db"
    shutil.copy(SQLITE_FILE, copy)
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(db_module, "DB_PATH", copy)
        mp.setattr(db_module, "_ready", set())
        mp.setattr(db_module, "DATABASE_URL", "")
        yield load_marketplace()
