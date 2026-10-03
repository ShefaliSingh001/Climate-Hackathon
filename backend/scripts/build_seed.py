"""Build backend/supabase/seed.sql from the NSW producer and manufacturer spreadsheets.

Usage (from the repo root):
    python backend/scripts/build_seed.py
    python backend/scripts/build_seed.py --producers path/to/producers.xlsx --manufacturers path/to/manufacturers.xlsx

The seed only replaces rows with is_synthetic = true, so anything users have
entered through the app is kept when you re-run it.
"""

import argparse
import datetime as dt
import re
from pathlib import Path

import openpyxl

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO_ROOT / "backend" / "supabase" / "seed.sql"

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


def source_values(src: dict) -> list:
    """legal_entity, activity, lat, lng. Coordinates exist only for NPI-listed facilities."""
    return [src.get("Legal entity"), src.get("Published activity"), src.get("Latitude"), src.get("Longitude")]


def sql(value) -> str:
    """Format a Python value as a SQL literal."""
    if value is None or value == "":
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return repr(value)
    if isinstance(value, dt.datetime):
        value = value.date()
    if isinstance(value, dt.date):
        return f"'{value.isoformat()}'"
    if isinstance(value, list):
        return "array[" + ", ".join(sql(v) for v in value) + "]::text[]" if value else "'{}'::text[]"
    return "'" + str(value).strip().replace("'", "''") + "'"


def parse_date(text: str) -> dt.date:
    return dt.datetime.strptime(text, "%d %b %Y").date()


def producer_values(r: dict, sources: dict[str, dict]) -> list:
    return [
        r["Company / business"], str(r["ABN"]), *source_values(sources[str(r["ABN"])]), r["Website"],
        r["NSW locality"], r["NSW address"], r["Postcode"] and str(r["Postcode"]), "NSW",
        r["Input materials"], MATERIALS[r["Output material"]], r["Output quantity (tonnes)"],
        GRADES[r["Output grade"]], [c.strip() for c in str(r["Compliance"]).split(";") if c.strip()],
        r["Pricing (AUD/tonne)"], r["Supply period start"], r["Supply period end"],
        r["Data type"] == "Synthetic scenario",
    ]


def manufacturer_values(r: dict, sources: dict[str, dict]) -> list:
    m = TIMEFRAME.fullmatch(r["Timeframe"].strip())
    if not m:
        raise ValueError(f"Unrecognised timeframe for {r['Company / business']}: {r['Timeframe']!r}")
    return [
        r["Company / business"], str(r["ABN"]), *source_values(sources[str(r["ABN"])]), r["Website"],
        r["NSW locality"], r["NSW address"], r["Postcode"] and str(r["Postcode"]), "NSW",
        MATERIALS[r["Required material"]], r["Making with material"], r["Required quantity (tonnes)"],
        r["Manufacturer budget (AUD)"], GRADES[r["Output grade"]],
        parse_date(m.group(1)), parse_date(m.group(2)),
        r["Purchase period start"], r["Purchase period end"],
        r["Data type"] == "Synthetic scenario",
    ]


PRODUCER_COLUMNS = (
    "name, abn, legal_entity, activity, lat, lng, website, locality, address, postcode, state, input_materials, output_material, "
    "output_quantity_t, output_grade, compliance, price_aud_per_t, supply_start, supply_end, is_synthetic"
)
MANUFACTURER_COLUMNS = (
    "name, abn, legal_entity, activity, lat, lng, website, locality, address, postcode, state, required_material, product, "
    "required_quantity_t, budget_aud, output_grade_request, order_by, deliver_by, "
    "purchase_start, purchase_end, is_synthetic"
)


def insert(table: str, columns: str, rows: list[list]) -> str:
    values = ",\n".join("  (" + ", ".join(sql(v) for v in row) + ")" for row in rows)
    return f"insert into public.{table} ({columns}) values\n{values};\n"


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--producers", type=Path, default=None)
    p.add_argument("--manufacturers", type=Path, default=None)
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = p.parse_args()

    producers_path = args.producers or find_default("NSW_Steel_Scrap_Producers*.xlsx")
    manufacturers_path = args.manufacturers or find_default("NSW_Steel_Scrap_Manufacturers*.xlsx")

    producer_sources = read_sources(producers_path)
    manufacturer_sources = read_sources(manufacturers_path)
    producers = [producer_values(r, producer_sources) for r in read_rows(producers_path, "Producers")]
    manufacturers = [manufacturer_values(r, manufacturer_sources) for r in read_rows(manufacturers_path, "Manufacturers")]

    out = "\n".join([
        "-- Generated by backend/scripts/build_seed.py. Do not edit by hand; re-run the script.",
        f"-- Sources: {producers_path.name}, {manufacturers_path.name}",
        "-- Company names, ABNs and NSW locations are real; materials, quantities, compliance,",
        "-- grades, prices, budgets and timeframes are synthetic demo data.",
        "",
        "begin;",
        "",
        "delete from public.producers where is_synthetic;",
        "delete from public.manufacturers where is_synthetic;",
        "",
        insert("producers", PRODUCER_COLUMNS, producers),
        insert("manufacturers", MANUFACTURER_COLUMNS, manufacturers),
        "commit;",
        "",
    ])
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(out, encoding="utf-8", newline="\n")
    print(f"Wrote {len(producers)} producers and {len(manufacturers)} manufacturers to {args.out}")


if __name__ == "__main__":
    main()
