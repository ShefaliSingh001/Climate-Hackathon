"""ResourceX API: serves frontend/API_CONTRACT.md, plus accounts (frontend/AUTH.md).

Database: Neon Postgres when DATABASE_URL is set (Vercel), else the local SQLite file (backend/app/db.py).

Run locally from the repo root:
    pip install -r backend/requirements.txt
    uvicorn backend.app.main:app --reload --port 8000
Then set VITE_API_URL=http://localhost:8000 in frontend/.env.local. Docs at http://localhost:8000/docs.
"""

import datetime as dt
import json
import os
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from . import auth, impact, matching, report
from .db import DB, connect, integrity_errors, is_postgres
from .listings import GRADE_LABELS, all_listings, get_listing, parse_id

app = FastAPI(title="ResourceX API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()],
    allow_origin_regex=os.getenv("CORS_ORIGIN_REGEX") or None,  # e.g. https://climate-hackathon-.*\.vercel\.app for previews
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)

MaterialKey = Literal["steel", "alloys", "aluminium", "copper", "brass", "plastics", "paper", "glass", "ewaste"]
GradeKey = Literal["high", "medium", "short_use"]
StateCode = Literal["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"]

PERIODS_PER_MONTH = {"Weekly": 52 / 12, "Fortnightly": 26 / 12, "Monthly": 1}


# ---------------------------------------------------------------------------------------------
# Errors: always { "error": "..." }
# ---------------------------------------------------------------------------------------------

@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


async def integrity_error(_: Request, exc: Exception):
    # A database CHECK, UNIQUE or foreign key the request validation didn't catch.
    return JSONResponse(status_code=422, content={"error": f"Rejected by the database: {exc}"})

for _error in integrity_errors():
    app.add_exception_handler(_error, integrity_error)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    msgs = [f"{'.'.join(str(p) for p in e['loc'][1:])}: {e['msg']}" for e in exc.errors()]
    return JSONResponse(status_code=422, content={"error": "; ".join(msgs)})


# ---------------------------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------------------------

class Site(BaseModel):
    name: str = ""
    suburb: str = Field(default="", max_length=100)
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


class BusinessDetails(BaseModel):
    """What a producer sells or a manufacturer needs: one producers / manufacturers row."""
    material: MaterialKey
    grade: str  # 'high' / 'medium' / 'short_use' or their labels
    form: str = Field(default="", max_length=300)  # supply: input materials; demand: product made
    tonnes: float = Field(gt=0, le=1_000_000)
    frequency: Literal["Weekly", "Fortnightly", "Monthly"] = "Monthly"
    priceAud: float = Field(default=0, ge=0)
    certifications: list[str] = Field(default_factory=list, max_length=20)
    website: str | None = Field(default=None, max_length=300)
    # Supply: the period the tonnes are available. Default: today to 90 days out.
    availableFrom: dt.date | None = None
    availableTo: dt.date | None = None
    # Demand: total tender budget (default priceAud x tonnes) and timeframe (default: today, 30 days out).
    budgetAud: float | None = Field(default=None, ge=0)
    orderBy: dt.date | None = None
    deliverBy: dt.date | None = None

    model_config = {"extra": "ignore"}  # the UI also sends purity, virginPriceAud, ...


class NewListing(BusinessDetails):
    """POST /listings.

    Signed in: the business (name, ABN) and side come from the account, and the location defaults to its site.
    Not signed in (the current website's sign-up, before it moves to /auth/signup): kind, company, abn, suburb, lat
    and lng must all be sent, as before.
    """
    kind: Literal["supply", "demand"] | None = None
    company: str | None = Field(default=None, min_length=1, max_length=200)
    abn: str | None = Field(default=None, pattern=r"^\d{11}$", description="11 digits, no spaces")
    suburb: str | None = Field(default=None, max_length=100)
    state: StateCode | None = None
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)


class SignUp(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=254)
    password: str = Field(min_length=8, max_length=200)
    name: str = Field(min_length=1, max_length=200)
    company: str = Field(min_length=1, max_length=200)
    abn: str = Field(pattern=r"^\d{11}$", description="11 digits, no spaces")
    role: Literal["buyer", "seller"]
    site: Site
    listing: BusinessDetails  # seller -> producers row, buyer -> manufacturers row


class Login(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=200)


class DemoLogin(BaseModel):
    role: Literal["buyer", "seller"]


class Enquiry(BaseModel):
    tonnesPerMonth: float = Field(gt=0)
    firstDelivery: str = Field(min_length=1, max_length=100)
    message: str = Field(default="", max_length=5000)


# ---------------------------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------------------------

def run(fn, *args):
    """The model raises RuntimeError when the solver times out; that's a 503, not 'no match'."""
    try:
        return fn(*args)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def grade_key(text: str) -> str:
    by_label = {v.lower(): k for k, v in GRADE_LABELS.items()}
    grade = text if text in GRADE_LABELS else by_label.get(text.strip().lower())
    if grade is None:
        raise HTTPException(status_code=422, detail="grade must be one of: High quality, Medium quality, Short use")
    return grade


def insert_listing(db: DB, body: BusinessDetails, *, kind: str, company: str, abn: str, site: dict) -> str:
    """Write one producers (supply) or manufacturers (demand) row. Returns its listing id ('p12' / 'm7')."""
    grade = grade_key(body.grade)
    monthly = round(body.tonnes * PERIODS_PER_MONTH[body.frequency], 2)
    today = dt.date.today()
    common = dict(name=company.strip(), abn=abn, website=(body.website or "").strip() or None,
                  locality=site["suburb"].strip() or "Unknown", state=site["state"], lat=site["lat"], lng=site["lng"],
                  geo_source="user")
    if kind == "supply":
        start = body.availableFrom or today
        end = body.availableTo or start + dt.timedelta(days=90)
        if end < start:
            raise HTTPException(status_code=422, detail="availableTo must not be before availableFrom")
        return "p" + str(db.insert("producers", dict(
            common, input_materials=body.form.strip() or body.material, output_material=body.material,
            output_quantity_t=monthly, output_grade=grade, compliance=json.dumps(body.certifications),
            price_aud_per_t=body.priceAud, supply_start=start.isoformat(), supply_end=end.isoformat())))
    order_by = body.orderBy or today
    deliver_by = body.deliverBy or order_by + dt.timedelta(days=30)
    if deliver_by < order_by:
        raise HTTPException(status_code=422, detail="deliverBy must not be before orderBy")
    budget = body.budgetAud if body.budgetAud is not None else body.priceAud * monthly
    if not budget > 0:
        raise HTTPException(status_code=422, detail="Enter a budget above zero.")
    return "m" + str(db.insert("manufacturers", dict(
        common, product=body.form.strip() or None, required_material=body.material, required_quantity_t=monthly,
        budget_aud=round(budget, 2), output_grade_request=grade,
        order_by=order_by.isoformat(), deliver_by=deliver_by.isoformat(),
        purchase_start=min(today, order_by).isoformat(), purchase_end=deliver_by.isoformat())))


def account_site(account: dict) -> dict:
    return {"suburb": account["locality"], "state": account["state"], "lat": account["lat"], "lng": account["lng"]}


# ---------------------------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------------------------

@app.post("/auth/signup", status_code=201)
def signup(body: SignUp):
    """Create the business (producers or manufacturers row) and its login in one transaction."""
    email = body.email.strip().lower()
    site = {"suburb": body.site.suburb, "state": body.site.state, "lat": body.site.lat, "lng": body.site.lng}
    if not site["suburb"].strip():
        raise HTTPException(status_code=422, detail="site.suburb is required")
    with connect() as db:
        if db.execute("select 1 as x from accounts where email = ?", (email,)).fetchone():
            raise HTTPException(status_code=409, detail="An account with this email already exists. Log in instead.")
        kind = "supply" if body.role == "seller" else "demand"
        listing_id = insert_listing(db, body.listing, kind=kind, company=body.company, abn=body.abn, site=site)
        account_id = db.insert("accounts", {
            "email": email, "password_hash": auth.hash_password(body.password), "name": body.name.strip(),
            "company": body.company.strip(), "abn": body.abn, "role": body.role,
            "locality": site["suburb"].strip(), "state": site["state"], "lat": site["lat"], "lng": site["lng"],
            "producer_id" if kind == "supply" else "manufacturer_id": int(listing_id[1:]),
        })
        token = auth.create_session(db, account_id)
        account = db.execute("select * from accounts where id = ?", (account_id,)).fetchone()
    return {"token": token, "account": auth.account_json(account)}


@app.post("/auth/login")
def login(body: Login):
    with connect() as db:
        account = db.execute("select * from accounts where email = ?", (body.email.strip().lower(),)).fetchone()
        if account is None or not auth.verify_password(body.password, account["password_hash"]):
            raise HTTPException(status_code=401, detail="Email or password is incorrect.")
        token = auth.create_session(db, account["id"])
    return {"token": token, "account": auth.account_json(account)}


@app.post("/auth/demo")
def demo_login(body: DemoLogin):
    """One-click demo buyer / seller (seeded by db.py; they have no password)."""
    with connect() as db:
        account = db.execute("select * from accounts where is_demo = ? and role = ? order by id limit 1",
                             (True if db.postgres else 1, body.role)).fetchone()
        if account is None:
            raise HTTPException(status_code=404, detail="Demo accounts are not set up.")
        token = auth.create_session(db, account["id"])
    return {"token": token, "account": auth.account_json(account)}


@app.get("/auth/me")
def me(account: dict = Depends(auth.require_account)):
    return auth.account_json(account)


@app.post("/auth/logout", status_code=204)
def logout(authorization: str | None = Header(default=None)):
    token = auth.bearer(authorization)
    if token:
        with connect() as db:
            auth.delete_session(db, token)
    return Response(status_code=204)


# ---------------------------------------------------------------------------------------------
# Listings and matching
# ---------------------------------------------------------------------------------------------

@app.get("/health")
def health():
    with connect() as db:
        counts = {t: db.execute(f"select count(*) as n from {t}").fetchone()["n"] for t in ("producers", "manufacturers", "accounts")}
    return {"status": "ok", "database": "postgres" if is_postgres() else "sqlite", **counts}


@app.get("/listings")
def list_listings(kind: Literal["supply", "demand"] = "supply", lat: float | None = None, lng: float | None = None,
                  account: dict | None = Depends(auth.optional_account)):
    """All listings of one side. With lat/lng, each gets a matchScore for that site.

    Signed-in buyers who registered a requirement get supply scored by the matching model against it; signed-in
    sellers get buyer requests scored by whether their own listings can help fill each tender. New producers and
    manufacturers take part as soon as they register.
    """
    with connect() as db:
        listings = all_listings(db, kind)
        other = all_listings(db, "supply") if kind == "demand" else None
        own = None
        if account and account["role"] == "buyer" and account.get("manufacturer_id") and kind == "supply":
            own = get_listing(db, f"m{account['manufacturer_id']}")
        if account and account["role"] == "seller" and kind == "demand":
            own = [l for l in (other or []) if l["abn"] == account["abn"]]
    if lat is None or lng is None or not listings:
        return listings
    site = {"lat": lat, "lng": lng}
    if kind == "supply" and own:
        scores = run(matching.buyer_scores, listings, own, site)
    elif kind == "demand" and own:
        scores = run(matching.seller_scores, other, listings, own, site)
    else:
        scores = matching.baseline_scores(listings, site)
    for l in listings:
        l["matchScore"] = scores[l["id"]]
    return listings


@app.get("/listings/{listing_id}")
def read_listing(listing_id: str):
    with connect() as db:
        listing = get_listing(db, listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail=f"Listing {listing_id} not found")
    return listing


@app.post("/listings", status_code=201)
def create_listing(body: NewListing, account: dict | None = Depends(auth.optional_account)):
    """A seller lists material (producers row); a buyer posts a requirement (manufacturers row)."""
    if account is None:
        # Without a login (the website before it adopts /auth/*): everything comes from the body, as before.
        missing = [f for f in ("kind", "company", "abn", "suburb", "lat", "lng") if getattr(body, f) in (None, "")]
        if missing:
            raise HTTPException(status_code=422, detail=f"Log in, or send: {', '.join(missing)}")
        site = {"suburb": body.suburb, "state": body.state or "NSW", "lat": body.lat, "lng": body.lng}
        with connect() as db:
            listing_id = insert_listing(db, body, kind=body.kind, company=body.company, abn=body.abn, site=site)
            return get_listing(db, listing_id)
    kind = "supply" if account["role"] == "seller" else "demand"
    if body.kind and body.kind != kind:
        raise HTTPException(status_code=403, detail=f"A {account['role']} account can't create {body.kind} listings.")
    site = account_site(account)
    if body.lat is not None and body.lng is not None:
        site = {"suburb": body.suburb or site["suburb"], "state": body.state or site["state"], "lat": body.lat, "lng": body.lng}
    with connect() as db:
        listing_id = insert_listing(db, body, kind=kind, company=account["company"], abn=account["abn"], site=site)
        column = "producer_id" if kind == "supply" else "manufacturer_id"
        db.execute(f"update accounts set {column} = ? where id = ? and {column} is null", (int(listing_id[1:]), account["id"]))
        return get_listing(db, listing_id)


@app.post("/listings/{listing_id}/enquiries", status_code=201)
def send_enquiry(listing_id: str, body: Enquiry, account: dict | None = Depends(auth.optional_account)):
    parsed = parse_id(listing_id)
    with connect() as db:
        if parsed is None or get_listing(db, listing_id) is None:
            raise HTTPException(status_code=404, detail=f"Listing {listing_id} not found")
        column = "producer_id" if parsed[0] == "producers" else "manufacturer_id"
        enquiry_id = db.insert("enquiries", {column: parsed[1], "tonnes_per_month": body.tonnesPerMonth,
                                             "first_delivery": body.firstDelivery, "message": body.message,
                                             "account_id": account["id"] if account else None})
    return {"id": f"enq{enquiry_id}", "status": "sent"}


def supply_listings() -> list[dict]:
    with connect() as db:
        return all_listings(db, "supply")


@app.post("/matches")
def find_matches(body: MatchRequest):
    return run(matching.ranked_matches, supply_listings(), body.model_dump(mode="json"))


@app.post("/orders/plan")
def plan_order(body: OrderPlanRequest):
    return run(matching.plan_order, supply_listings(), body.model_dump(mode="json"))


@app.get("/impact")
def impact_stats():
    """This month's projected trades and the 2035 outlook, from the marketplace's producers and manufacturers.

    Sourced factors and the method are in backend/app/impact.py and forecast.py. isSample stays true while the
    demo dataset is in use.
    """
    return impact.impact_for(*impact.load_marketplace())


# One report per set of numbers: it only changes when the marketplace data does.
_reports: dict[str, dict] = {}


@app.post("/impact/report")
def impact_report(refresh: bool = False):
    """Plain-language monthly report written by Claude from the /impact numbers (a template without an API key)."""
    stats = impact_stats()
    key = json.dumps(stats, sort_keys=True, default=str)
    if refresh or key not in _reports or _reports[key]["source"] != "claude":
        _reports[key] = {**report.write_report(stats), "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat()}
    return _reports[key]
