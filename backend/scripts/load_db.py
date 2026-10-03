"""Load the NSW producer and manufacturer spreadsheets into the SQLite database.

Usage (from the repo root):
    python backend/scripts/load_db.py
    python backend/scripts/load_db.py --producers path/to/producers.xlsx --manufacturers path/to/manufacturers.xlsx
    python backend/scripts/load_db.py --db path/to/other.db

Creates the database from backend/db/schema.sql if it does not exist yet. Only rows
with is_synthetic = 1 are replaced, so anything users have entered through the app is
kept when you re-run it.
"""

import argparse
import csv
import datetime as dt
import json
import re
import sqlite3
from pathlib import Path

import openpyxl

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA = REPO_ROOT / "backend" / "db" / "schema.sql"
DEFAULT_DB = REPO_ROOT / "backend" / "db" / "circulink.db"
LOCALITY_COORDS = REPO_ROOT / "backend" / "data" / "locality_coords.csv"

GRADES = {"High quality": "high", "Medium quality": "medium", "Short use": "short_use"}
MATERIALS = {"Steel": "steel", "Aluminium": "aluminium", "Copper": "copper", "Brass": "brass", "Alloys": "alloys"}
TIMEFRAME = re.compile(r"Order by (\d{1,2} \w{3} \d{4}); deliver by (\d{1,2} \w{3} \d{4})")


def find_default(pattern: str) -> Path:
    matches = sorted(REPO_ROOT.glob(pattern))
    if not matches:
        raise SystemExit(f"No file matching {pattern} in {REPO_ROOT}; pass the path explicitly.")
    return matches[0]


def read_rows(path: Path, sheet: str) -> list[dict]:
    """Return the data rows as dicts keyed by the header row (the row whose second cell is 'ABN')."""
    ws = openpyxl.load_workbook(path, data_only=True)[sheet]
    rows = list(ws.iter_rows(values_only=True))
    header_idx = next(i for i, r in enumerate(rows) if len(r) > 1 and r[1] == "ABN")
    header = rows[header_idx]
    return [dict(zip(header, r)) for r in rows[header_idx + 1:] if r[0] and r[1]]


def read_sources(path: Path) -> dict[str, dict]:
    """Return the 'Sources' sheet (legal entity, activity, NPI coordinates) keyed by ABN."""
    return {str(r["ABN"]): r for r in read_rows(path, "Sources")}


def text(value) -> str | None:
    """Strip text cells; blank becomes NULL."""
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def iso(value) -> str | None:
    """Excel date cell -> 'YYYY-MM-DD'."""
    if value is None or value == "":
        return None
    if isinstance(value, dt.datetime):
        value = value.date()
    if isinstance(value, dt.date):
        return value.isoformat()
    return dt.datetime.strptime(str(value).strip(), "%d %b %Y").date().isoformat()


def read_locality_coords() -> dict[tuple[str, str], tuple[float, float]]:
    """(LOCALITY, postcode) -> suburb-centre lat/lng, written by geocode_localities.py."""
    if not LOCALITY_COORDS.exists():
        return {}
    with LOCALITY_COORDS.open(encoding="utf-8") as f:
        return {(r["locality"], r["postcode"]): (float(r["lat"]), float(r["lng"])) for r in csv.DictReader(f)}


LOCALITIES = read_locality_coords()


def location(r: dict, src: dict) -> dict:
    """NPI facility coordinates where published, else the suburb centre."""
    if src.get("Latitude") is not None and src.get("Longitude") is not None:
        return {"lat": src["Latitude"], "lng": src["Longitude"], "geo_source": "npi"}
    key = (str(r["NSW locality"]).strip().upper(), r["Postcode"] and str(r["Postcode"]) or "")
    if key in LOCALITIES:
        lat, lng = LOCALITIES[key]
        return {"lat": lat, "lng": lng, "geo_source": "locality"}
    return {"lat": None, "lng": None, "geo_source": None}


def business(r: dict, sources: dict[str, dict]) -> dict:
    """Columns both tables share: identity and location."""
    src = sources[str(r["ABN"])]
    return {
        "name": text(r["Company / business"]),
        "abn": str(r["ABN"]),
        "legal_entity": text(src.get("Legal entity")),
        "activity": text(src.get("Published activity")),
        "website": text(r["Website"]),
        "locality": text(r["NSW locality"]),
        "address": text(r["NSW address"]),
        "postcode": r["Postcode"] and str(r["Postcode"]),
        "state": "NSW",
        **location(r, src),
        "is_synthetic": int(r["Data type"] == "Synthetic scenario"),
    }


def producer(r: dict, sources: dict[str, dict]) -> dict:
    return {
        **business(r, sources),
        "input_materials": text(r["Input materials"]),
        "output_material": MATERIALS[r["Output material"]],
        "output_quantity_t": r["Output quantity (tonnes)"],
        "output_grade": GRADES[r["Output grade"]],
        "compliance": json.dumps([c.strip() for c in str(r["Compliance"]).split(";") if c.strip()]),
        "price_aud_per_t": r["Pricing (AUD/tonne)"],
        "supply_start": iso(r["Supply period start"]),
        "supply_end": iso(r["Supply period end"]),
    }


def manufacturer(r: dict, sources: dict[str, dict]) -> dict:
    m = TIMEFRAME.fullmatch(r["Timeframe"].strip())
    if not m:
        raise ValueError(f"Unrecognised timeframe for {r['Company / business']}: {r['Timeframe']!r}")
    return {
        **business(r, sources),
        "required_material": MATERIALS[r["Required material"]],
        "product": text(r["Making with material"]),
        "required_quantity_t": r["Required quantity (tonnes)"],
        "budget_aud": r["Manufacturer budget (AUD)"],
        "output_grade_request": GRADES[r["Output grade"]],
        "order_by": iso(m.group(1)),
        "deliver_by": iso(m.group(2)),
        "purchase_start": iso(r["Purchase period start"]),
        "purchase_end": iso(r["Purchase period end"]),
    }


def upgrade(db: sqlite3.Connection) -> None:
    """Add columns introduced after a database was first created (schema.sql only creates missing tables)."""
    for table in ("producers", "manufacturers"):
        cols = {row[1] for row in db.execute(f"pragma table_info({table})")}
        if "geo_source" not in cols:
            db.execute(f"alter table {table} add column geo_source text check (geo_source in ('npi', 'locality', 'user'))")


def insert(db: sqlite3.Connection, table: str, rows: list[dict]) -> None:
    cols = list(rows[0])
    db.executemany(
        f"insert into {table} ({', '.join(cols)}) values ({', '.join(':' + c for c in cols)})",
        rows,
    )


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--producers", type=Path, default=None)
    p.add_argument("--manufacturers", type=Path, default=None)
    p.add_argument("--db", type=Path, default=DEFAULT_DB)
    args = p.parse_args()

    producers_path = args.producers or find_default("NSW_Steel_Scrap_Producers*.xlsx")
    manufacturers_path = args.manufacturers or find_default("NSW_Steel_Scrap_Manufacturers*.xlsx")

    producer_sources = read_sources(producers_path)
    manufacturer_sources = read_sources(manufacturers_path)
    producers = [producer(r, producer_sources) for r in read_rows(producers_path, "Producers")]
    manufacturers = [manufacturer(r, manufacturer_sources) for r in read_rows(manufacturers_path, "Manufacturers")]

    args.db.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(args.db)
    try:
        db.executescript(SCHEMA.read_text(encoding="utf-8"))
        upgrade(db)
        with db:  # one transaction: all or nothing
            db.execute("delete from producers where is_synthetic = 1")
            db.execute("delete from manufacturers where is_synthetic = 1")
            insert(db, "producers", producers)
            insert(db, "manufacturers", manufacturers)
    finally:
        db.close()
    print(f"Loaded {len(producers)} producers and {len(manufacturers)} manufacturers into {args.db}")
    unplaced = [row["name"] for row in producers + manufacturers if row["lat"] is None]
    if unplaced:
        print("No coordinates (run geocode_localities.py):", ", ".join(unplaced))


if __name__ == "__main__":
    main()
