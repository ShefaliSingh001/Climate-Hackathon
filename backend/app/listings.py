"""Map database rows to the frontend's Listing shape (frontend/API_CONTRACT.md).

Producers become `kind: "supply"` listings with ids like "p12"; manufacturers become
`kind: "demand"` listings with ids like "m7".
"""

import datetime as dt
import json
import math
import sqlite3

GRADE_LABELS = {"high": "High quality", "medium": "Medium quality", "short_use": "Short use"}

# A$/t for the new feedstock each recycled material replaces, October 2026 at 0.6957 USD per AUD (sources in
# backend/data/MARKET_RESEARCH.md): steel = pig iron (Brazil FOB US$475), aluminium = LME (US$3,119), copper = LME
# (US$14,259), brass = metal value of 63% copper / 37% zinc (zinc US$3,736), stainless = 304 sheet (US$2,765).
VIRGIN_PRICE_AUD = {"steel": 680, "aluminium": 4480, "copper": 20500, "brass": 14900, "alloys": 3970}

ROAD_FACTOR = 1.25  # straight line x 1.25, same as frontend/src/lib/geo.ts


def road_km(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    rad = math.pi / 180
    h = (math.sin((b_lat - a_lat) * rad / 2) ** 2
         + math.cos(a_lat * rad) * math.cos(b_lat * rad) * math.sin((b_lng - a_lng) * rad / 2) ** 2)
    return 2 * 6371 * math.asin(math.sqrt(h)) * ROAD_FACTOR


def months_since(timestamp: str) -> int:
    created = dt.datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    days = (dt.datetime.now(dt.timezone.utc) - created).days
    return max(0, days // 30)


def _common(row: sqlite3.Row) -> dict:
    return {
        "company": row["name"],
        "suburb": row["locality"],
        "state": row["state"],
        "lat": row["lat"],
        "lng": row["lng"],
        # Verified = the business has an ABN on file (the team's rule; ABN Lookup checks can tighten it later).
        "verified": bool(row["abn"]) and len(row["abn"]) == 11 and row["abn"].isdigit(),
        "monthsOnPlatform": months_since(row["created_at"]),
        "abn": row["abn"],
        "website": row["website"],
        "locationApprox": row["geo_source"] == "locality",  # suburb centre, not the yard itself
        "address": row["address"],
        "postcode": row["postcode"],
    }


def producer_listing(row: sqlite3.Row) -> dict:
    return {
        "id": f"p{row['id']}",
        "kind": "supply",
        **_common(row),
        "material": row["output_material"],
        "grade": GRADE_LABELS[row["output_grade"]],
        "gradeKey": row["output_grade"],
        "form": row["input_materials"],
        "tonnes": row["output_quantity_t"],
        "frequency": "Monthly",
        "priceAud": row["price_aud_per_t"],
        "virginPriceAud": VIRGIN_PRICE_AUD.get(row["output_material"]),
        "purity": None,  # the dataset grades material instead of assaying it
        "certifications": json.loads(row["compliance"]),
        "availableFrom": row["supply_start"],
        "availableTo": row["supply_end"],
    }


def manufacturer_listing(row: sqlite3.Row) -> dict:
    return {
        "id": f"m{row['id']}",
        "kind": "demand",
        **_common(row),
        "material": row["required_material"],
        "grade": GRADE_LABELS[row["output_grade_request"]],
        "gradeKey": row["output_grade_request"],
        "form": row["product"] or "",
        "tonnes": row["required_quantity_t"],
        "frequency": "Monthly",
        "priceAud": row["max_price_aud_per_t"],
        "virginPriceAud": VIRGIN_PRICE_AUD.get(row["required_material"]),
        "purity": None,
        "certifications": [],
        "availableFrom": row["purchase_start"],
        "availableTo": row["purchase_end"],
        "budgetAud": row["budget_aud"],
        "orderBy": row["order_by"],
        "deliverBy": row["deliver_by"],
    }


def all_listings(db: sqlite3.Connection, kind: str) -> list[dict]:
    if kind == "supply":
        return [producer_listing(r) for r in db.execute("select * from producers where lat is not null order by name")]
    return [manufacturer_listing(r) for r in db.execute("select * from manufacturers where lat is not null order by name")]


def parse_id(listing_id: str) -> tuple[str, int] | None:
    """'p12' -> ('producers', 12), 'm7' -> ('manufacturers', 7), anything else -> None."""
    table = {"p": "producers", "m": "manufacturers"}.get(listing_id[:1])
    if table is None or not listing_id[1:].isdigit():
        return None
    return table, int(listing_id[1:])


def get_listing(db: sqlite3.Connection, listing_id: str) -> dict | None:
    parsed = parse_id(listing_id)
    if parsed is None:
        return None
    table, row_id = parsed
    row = db.execute(f"select * from {table} where id = ?", (row_id,)).fetchone()
    if row is None:
        return None
    return producer_listing(row) if table == "producers" else manufacturer_listing(row)
