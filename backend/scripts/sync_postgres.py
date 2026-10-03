"""Push the NSW dataset from backend/db/circulink.db to the live Postgres (Neon) database.

You don't need this for the first deploy: the API creates the tables and copies the dataset into an empty database
by itself. Run it after the spreadsheets change:

    python backend/scripts/load_db.py                         # rebuild the SQLite file from the spreadsheets
    DATABASE_URL='postgresql://...' python backend/scripts/sync_postgres.py

Only dataset rows (is_synthetic) are replaced; producers, manufacturers and accounts created through the app are kept.
Copy DATABASE_URL from Vercel (Project -> Settings -> Environment Variables) or the Neon console.
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.app import db as db_module  # noqa: E402


def main() -> None:
    if not db_module.is_postgres():
        raise SystemExit("Set DATABASE_URL to the Neon connection string first.")
    with db_module.connect() as db:  # also applies the schema if needed
        copied = db_module.seed_postgres(db, replace_synthetic=True)
        counts = {t: db.execute(f"select count(*) as n from {t}").fetchone()["n"] for t in ("producers", "manufacturers", "accounts")}
    host = os.environ.get("DATABASE_URL", "").split("@")[-1].split("/")[0]
    print(f"Copied {copied} dataset rows to {host}. Now: {counts}")


if __name__ == "__main__":
    main()
