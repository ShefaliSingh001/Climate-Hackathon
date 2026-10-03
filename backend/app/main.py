"""CircuLink API: serves frontend/API_CONTRACT.md from the SQLite database.

Run from the repo root:
    pip install -r backend/requirements.txt
    uvicorn backend.app.main:app --reload --port 8000
Then set VITE_API_URL=http://localhost:8000 in frontend/.env.local. Docs at http://localhost:8000/docs.
"""

import datetime as dt
import json
import os
import sqlite3
import statistics
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import matching
from .db import connect
from .listings import GRADE_LABELS, all_listings, get_listing, parse_id

app = FastAPI(title="CircuLink API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

MaterialKey = Literal["steel", "alloys", "aluminium", "copper", "brass", "plastics", "paper", "glass", "ewaste"]
GradeKey = Literal["high", "medium", "short_use"]
StateCode = Literal["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"]

# Indicative t CO2e avoided per tonne recycled; same preview values as frontend/src/lib/materials.ts.
CO2_PER_TONNE = {"copper": 3.0, "aluminium": 9.0, "paper": 0.7, "steel": 1.4, "plastics": 1.5, "ewaste": 2.0,
                 "glass": 0.3, "brass": 2.5, "alloys": 2.0}
PERIODS_PER_MONTH = {"Weekly": 52 / 12, "Fortnightly": 26 / 12, "Monthly": 1}


# ---------------------------------------------------------------------------------------------
# Errors: always { "error": "..." }
# ---------------------------------------------------------------------------------------------

@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.exception_handler(sqlite3.IntegrityError)
async def integrity_error(_: Request, exc: sqlite3.IntegrityError):
    # A database CHECK or foreign key the request validation didn't catch.
    return JSONResponse(status_code=422, content={"error": f"Rejected by the database: {exc}"})


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    msgs = [f"{'.'.join(str(p) for p in e['loc'][1:])}: {e['msg']}" for e in exc.errors()]
    return JSONResponse(status_code=422, content={"error": "; ".join(msgs)})


# ---------------------------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------------------------

class Site(BaseModel):
    name: str = ""
    suburb: str = ""
    state: StateCode = "NSW"
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class Requirement(BaseModel):
    material: MaterialKey
    tonnesPerMonth: float = Field(gt=0, le=1_000_000)
    site: Site
    grade: GradeKey | None = None  # None = any grade
    certifications: list[str] = Field(default_factory=list, max_length=20)
    windowStart: dt.date | None = None  # default: next calendar month
    windowEnd: dt.date | None = None
    verifiedOnly: bool = False


class MatchRequest(Requirement):
    minPurity: float | None = None  # accepted for compatibility; the dataset grades material instead
    maxPriceAud: float = Field(default=0, ge=0)


class OrderPlanRequest(Requirement):
    budgetAud: float = Field(gt=0, description="A$ for the material, excluding freight")
    maxPartners: int = Field(default=4, ge=1, le=20)
    strategy: Literal["cost", "fewest", "emissions"] = "cost"
    alternatives: int = Field(default=3, ge=1, le=5)


class NewListing(BaseModel):
    kind: Literal["supply", "demand"]
    company: str = Field(min_length=1, max_length=200)
    abn: str = Field(pattern=r"^\d{11}$", description="11 digits, no spaces")
    suburb: str = Field(min_length=1, max_length=100)
    state: StateCode = "NSW"
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    material: MaterialKey
    grade: str  # 'high' / 'medium' / 'short_use' or their labels
    form: str = ""
    tonnes: float = Field(gt=0)
    frequency: Literal["Weekly", "Fortnightly", "Monthly"] = "Monthly"
    priceAud: float = Field(ge=0)
    certifications: list[str] = Field(default_factory=list)
    website: str | None = Field(default=None, max_length=300)
    # Supply: the period the tonnes are available. Default: today to 90 days out.
    availableFrom: dt.date | None = None
    availableTo: dt.date | None = None
    # Demand: total tender budget (default priceAud x tonnes) and timeframe (default: today, 30 days out).
    budgetAud: float | None = Field(default=None, ge=0)
    orderBy: dt.date | None = None
    deliverBy: dt.date | None = None

    model_config = {"extra": "ignore"}  # the UI also sends purity, virginPriceAud, ...


class Enquiry(BaseModel):
    tonnesPerMonth: float = Field(gt=0)
    firstDelivery: str = Field(min_length=1, max_length=100)
    message: str = Field(default="", max_length=5000)


# ---------------------------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------------------------

def supply_listings() -> list[dict]:
    with connect() as db:
        return all_listings(db, "supply")


def run(fn, *args):
    """The model raises RuntimeError when the solver times out; that's a 503, not 'no match'."""
    try:
        return fn(*args)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/health")
def health():
    with connect() as db:
        counts = {t: db.execute(f"select count(*) from {t}").fetchone()[0] for t in ("producers", "manufacturers")}
    return {"status": "ok", **counts}


@app.get("/listings")
def list_listings(kind: Literal["supply", "demand"] = "supply", lat: float | None = None, lng: float | None = None):
    with connect() as db:
        listings = all_listings(db, kind)
    if lat is not None and lng is not None:
        site = {"lat": lat, "lng": lng}
        medians = {m: statistics.median(l["priceAud"] for l in listings if l["material"] == m)
                   for m in {l["material"] for l in listings}}
        for l in listings:
            l["matchScore"] = matching.baseline_score(l, site, medians[l["material"]])
    return listings


@app.get("/listings/{listing_id}")
def read_listing(listing_id: str):
    with connect() as db:
        listing = get_listing(db, listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail=f"Listing {listing_id} not found")
    return listing


@app.post("/listings", status_code=201)
def create_listing(body: NewListing):
    by_label = {v.lower(): k for k, v in GRADE_LABELS.items()}
    grade = body.grade if body.grade in GRADE_LABELS else by_label.get(body.grade.strip().lower())
    if grade is None:
        raise HTTPException(status_code=422, detail="grade must be one of: High quality, Medium quality, Short use")
    monthly = round(body.tonnes * PERIODS_PER_MONTH[body.frequency], 2)
    today = dt.date.today()
    common = dict(name=body.company.strip(), abn=body.abn, website=(body.website or "").strip() or None,
                  locality=body.suburb.strip(), state=body.state, lat=body.lat, lng=body.lng, geo_source="user")
    if body.kind == "supply":
        start = body.availableFrom or today
        end = body.availableTo or start + dt.timedelta(days=90)
        if end < start:
            raise HTTPException(status_code=422, detail="availableTo must not be before availableFrom")
        table, row = "producers", dict(
            common, input_materials=body.form.strip() or body.material, output_material=body.material,
            output_quantity_t=monthly, output_grade=grade, compliance=json.dumps(body.certifications),
            price_aud_per_t=body.priceAud, supply_start=start.isoformat(), supply_end=end.isoformat())
    else:
        order_by = body.orderBy or today
        deliver_by = body.deliverBy or order_by + dt.timedelta(days=30)
        if deliver_by < order_by:
            raise HTTPException(status_code=422, detail="deliverBy must not be before orderBy")
        budget = body.budgetAud if body.budgetAud is not None else body.priceAud * monthly
        table, row = "manufacturers", dict(
            common, product=body.form.strip() or None, required_material=body.material, required_quantity_t=monthly,
            budget_aud=round(budget, 2), output_grade_request=grade,
            order_by=order_by.isoformat(), deliver_by=deliver_by.isoformat(),
            purchase_start=min(today, order_by).isoformat(), purchase_end=deliver_by.isoformat())
    with connect() as db:
        cur = db.execute(f"insert into {table} ({', '.join(row)}) values ({', '.join('?' * len(row))})", list(row.values()))
        return get_listing(db, f"{'p' if table == 'producers' else 'm'}{cur.lastrowid}")


@app.post("/listings/{listing_id}/enquiries", status_code=201)
def send_enquiry(listing_id: str, body: Enquiry):
    parsed = parse_id(listing_id)
    with connect() as db:
        if parsed is None or get_listing(db, listing_id) is None:
            raise HTTPException(status_code=404, detail=f"Listing {listing_id} not found")
        column = "producer_id" if parsed[0] == "producers" else "manufacturer_id"
        cur = db.execute(f"insert into enquiries ({column}, tonnes_per_month, first_delivery, message) values (?, ?, ?, ?)",
                         (parsed[1], body.tonnesPerMonth, body.firstDelivery, body.message))
    return {"id": f"enq{cur.lastrowid}", "status": "sent"}


@app.post("/matches")
def find_matches(body: MatchRequest):
    return run(matching.ranked_matches, supply_listings(), body.model_dump(mode="json"))


@app.post("/orders/plan")
def plan_order(body: OrderPlanRequest):
    return run(matching.plan_order, supply_listings(), body.model_dump(mode="json"))


@app.get("/impact")
def impact():
    """Listed supply, not completed trades, so isSample stays true until trades are recorded."""
    with connect() as db:
        by_material = db.execute(
            "select output_material as material, sum(output_quantity_t) as tonnes from producers "
            "group by output_material order by tonnes desc").fetchall()
        sites = db.execute("select count(distinct abn) from (select abn, legal_entity from producers "
                           "union all select abn, legal_entity from manufacturers) where legal_entity is not null").fetchone()[0]
        enquiries = db.execute("select count(*) from enquiries").fetchone()[0]
    tonnes = sum(r["tonnes"] for r in by_material)
    return {
        "tonnesRecirculated": round(tonnes),
        "co2eAvoidedT": round(sum(r["tonnes"] * CO2_PER_TONNE[r["material"]] for r in by_material)),
        "activeVerifiedSites": sites,
        "matchesConverted": enquiries,
        "byMaterial": [{"material": r["material"], "tonnes": round(r["tonnes"])} for r in by_material],
        "isSample": True,
    }
