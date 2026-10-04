"""API tests. Run from the repo root: pytest backend/tests

Every test runs twice: against a temporary copy of the SQLite file, and against a real, empty Postgres (seeded by the
app on first connect, as on Neon). The Postgres run needs `pip install pgserver psycopg[binary]` and is skipped
without it.
"""

import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app import db as db_module
from backend.app.main import app

SITE = {"name": "Westlink Cable Co.", "suburb": "Wetherill Park", "state": "NSW", "lat": -33.847, "lng": 150.9}
SQLITE_FILE = Path(db_module.__file__).resolve().parents[1] / "db" / "circulink.db"


@pytest.fixture(scope="session")
def postgres_url(tmp_path_factory):
    pgserver = pytest.importorskip("pgserver")
    pytest.importorskip("psycopg")
    server = pgserver.get_server(tmp_path_factory.mktemp("pg"), cleanup_mode="stop")
    yield server.get_uri()
    server.cleanup()


@pytest.fixture(params=["sqlite", "postgres"])
def client(request, tmp_path, monkeypatch):
    copy = tmp_path / "circulink.db"
    shutil.copy(SQLITE_FILE, copy)  # Postgres seeds itself from this file too
    monkeypatch.setattr(db_module, "DB_PATH", copy)
    monkeypatch.setattr(db_module, "_ready", set())
    if request.param == "postgres":
        import psycopg
        url = request.getfixturevalue("postgres_url")
        with psycopg.connect(url, autocommit=True) as conn:  # start from an empty database, like a new Neon project
            conn.execute("drop schema public cascade; create schema public;")
        monkeypatch.setattr(db_module, "DATABASE_URL", url)
    else:
        monkeypatch.setattr(db_module, "DATABASE_URL", "")
    return TestClient(app)


def seller_signup(**listing):
    return {
        "email": "Sam@SmithfieldSteel.com.au", "password": "correct-horse-9", "name": "Sam", "company": "Smithfield Steel Recovery",
        "abn": "22222222222", "role": "seller",
        "site": {"name": "Smithfield Steel Recovery", "suburb": "Smithfield", "state": "NSW", "lat": -33.85, "lng": 150.94},
        "listing": {"material": "steel", "grade": "High quality", "form": "Steel offcuts and swarf", "tonnes": 120,
                    "priceAud": 250, "certifications": ["Cert A", "Cert C"], "website": "https://smithfieldsteel.com.au",
                    "availableFrom": "2026-11-01", "availableTo": "2026-12-31", **listing},
    }


def buyer_signup(**listing):
    return {
        "email": "bea@penrithfab.com.au", "password": "correct-horse-9", "name": "Bea", "company": "Penrith Fabrication",
        "abn": "11111111111", "role": "buyer",
        "site": {"name": "Penrith Fabrication", "suburb": "Penrith", "state": "NSW", "lat": -33.75, "lng": 150.69},
        "listing": {"material": "steel", "grade": "high", "form": "Structural sections", "tonnes": 200,
                    "budgetAud": 80000, "orderBy": "2026-11-05", "deliverBy": "2026-11-28", **listing},
    }


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def test_listings_follow_the_contract(client):
    supply = client.get("/listings", params={"kind": "supply", "lat": SITE["lat"], "lng": SITE["lng"]}).json()
    demand = client.get("/listings", params={"kind": "demand"}).json()
    assert len(supply) == 63 and len(demand) == 45
    for l in supply + demand:
        assert l["id"][0] in "pm" and l["lat"] is not None and l["lng"] is not None
        assert l["frequency"] == "Monthly" and l["grade"] in {"High quality", "Medium quality", "Short use"}
    assert all(0 <= l["matchScore"] <= 100 for l in supply)
    one = client.get(f"/listings/{supply[0]['id']}").json()
    assert one["company"] == supply[0]["company"]
    assert client.get("/listings/p99999").status_code == 404
    assert client.get("/listings/nonsense").json()["error"]


def test_matches_use_model_eligibility(client):
    body = {"material": "steel", "grade": "high", "tonnesPerMonth": 300, "maxPriceAud": 520, "site": SITE}
    results = client.post("/matches", json=body).json()
    assert results and all(r["listing"]["material"] == "steel" for r in results)
    eligible = [r for r in results if r["eligible"]]
    excluded = [r for r in results if not r["eligible"]]
    assert all(r["listing"]["grade"] == "High quality" for r in eligible)
    assert excluded and all(r["score"] == 0 and "grade mismatch" in r["reasons"] for r in excluded)
    assert results.index(eligible[-1]) < results.index(excluded[0])  # eligible first
    assert any(r["inBestPlan"] for r in eligible)


def test_order_plan_meets_demand_within_budget(client):
    body = {"material": "steel", "grade": "high", "tonnesPerMonth": 300, "budgetAud": 160000, "site": SITE, "maxPartners": 4}
    plan = client.post("/orders/plan", json=body).json()
    assert plan["status"] == "feasible" and 1 <= len(plan["plans"]) <= 3
    supply = {l["id"]: l for l in client.get("/listings", params={"kind": "supply"}).json()}
    for p in plan["plans"]:
        assert abs(sum(l["tonnes"] for l in p["lines"]) - 300) < 1e-6
        assert p["totalCostAud"] <= 160000 and p["supplierCount"] <= 4
        for line in p["lines"]:
            listing = supply[line["listingId"]]
            assert listing["grade"] == "High quality" and line["tonnes"] <= listing["tonnes"]
    costs = [p["totalCostAud"] for p in plan["plans"]]
    assert costs == sorted(costs)  # best first


def test_order_plan_reports_shortfall(client):
    body = {"material": "copper", "tonnesPerMonth": 5000, "budgetAud": 9_000_000, "site": SITE}
    plan = client.post("/orders/plan", json=body).json()
    assert plan["status"] == "infeasible" and plan["shortfallTonnes"] > 0 and not plan["plans"]


def test_fewest_partners_strategy(client):
    base = {"material": "steel", "tonnesPerMonth": 300, "budgetAud": 140000, "site": SITE, "maxPartners": 8}
    cheapest = client.post("/orders/plan", json={**base, "strategy": "cost"}).json()["plans"][0]
    fewest = client.post("/orders/plan", json={**base, "strategy": "fewest"}).json()["plans"][0]
    assert fewest["supplierCount"] <= cheapest["supplierCount"]
    assert cheapest["totalCostAud"] <= fewest["totalCostAud"]


def test_bad_request_is_json_error(client):
    r = client.post("/orders/plan", json={"material": "gold", "tonnesPerMonth": 1, "budgetAud": 1, "site": SITE})
    assert r.status_code == 422 and "material" in r.json()["error"]


def test_seller_signup_saves_producer_and_account(client):
    r = client.post("/auth/signup", json=seller_signup())
    assert r.status_code == 201, r.text
    body = r.json()
    account = body["account"]
    assert account["email"] == "sam@smithfieldsteel.com.au" and account["role"] == "seller" and account["listingId"].startswith("p")
    assert account["site"]["suburb"] == "Smithfield"
    listing = client.get(f"/listings/{account['listingId']}").json()
    assert listing["company"] == "Smithfield Steel Recovery" and listing["abn"] == "22222222222"
    assert listing["gradeKey"] == "high" and listing["certifications"] == ["Cert A", "Cert C"] and listing["priceAud"] == 250
    assert len(client.get("/listings", params={"kind": "supply"}).json()) == 64
    assert client.get("/health").json()["accounts"] == 3  # two demo accounts + this one
    # The new producer is used by the matching model straight away: cheapest high-grade steel, so it leads the plan.
    plan = client.post("/orders/plan", json={"material": "steel", "grade": "high", "tonnesPerMonth": 300,
                                             "budgetAud": 160000, "site": SITE, "maxPartners": 4}).json()
    assert any(l["listingId"] == account["listingId"] for l in plan["plans"][0]["lines"])


def test_buyer_signup_saves_manufacturer(client):
    r = client.post("/auth/signup", json=buyer_signup())
    assert r.status_code == 201, r.text
    account = r.json()["account"]
    assert account["role"] == "buyer" and account["listingId"].startswith("m")
    listing = client.get(f"/listings/{account['listingId']}").json()
    assert listing["kind"] == "demand" and listing["budgetAud"] == 80000 and listing["priceAud"] == 400  # 80000 / 200 t
    assert listing["orderBy"] == "2026-11-05" and listing["deliverBy"] == "2026-11-28" and listing["form"] == "Structural sections"
    assert len(client.get("/listings", params={"kind": "demand"}).json()) == 46


def test_signup_rejects_bad_input_without_writing(client):
    assert client.post("/auth/signup", json=seller_signup()).status_code == 201
    dup = client.post("/auth/signup", json={**seller_signup(), "email": "sam@smithfieldsteel.com.au"})
    assert dup.status_code == 409 and "already exists" in dup.json()["error"]
    bad_dates = client.post("/auth/signup", json={**buyer_signup(deliverBy="2026-11-01")})
    assert bad_dates.status_code == 422 and "deliverBy" in bad_dates.json()["error"]
    short_pw = client.post("/auth/signup", json={**buyer_signup(), "password": "short"})
    assert short_pw.status_code == 422
    bad_grade = client.post("/auth/signup", json={**buyer_signup(grade="shiny")})
    assert bad_grade.status_code == 422
    # Only the first sign-up wrote anything.
    assert len(client.get("/listings", params={"kind": "supply"}).json()) == 64
    assert len(client.get("/listings", params={"kind": "demand"}).json()) == 45
    assert client.get("/health").json()["accounts"] == 3


def test_login_from_anywhere_and_logout(client):
    client.post("/auth/signup", json=seller_signup())
    wrong = client.post("/auth/login", json={"email": "sam@smithfieldsteel.com.au", "password": "nope-nope"})
    assert wrong.status_code == 401
    ok = client.post("/auth/login", json={"email": "SAM@smithfieldsteel.com.au", "password": "correct-horse-9"})
    assert ok.status_code == 200
    token = ok.json()["token"]
    assert client.get("/auth/me", headers=auth_header(token)).json()["company"] == "Smithfield Steel Recovery"
    assert client.post("/auth/logout", headers=auth_header(token)).status_code == 204
    assert client.get("/auth/me", headers=auth_header(token)).status_code == 401
    assert client.get("/auth/me").status_code == 401


def test_demo_logins(client):
    for role in ("buyer", "seller"):
        r = client.post("/auth/demo", json={"role": role})
        assert r.status_code == 200 and r.json()["account"]["role"] == role and r.json()["account"]["demo"] is True
    assert client.post("/auth/login", json={"email": "buyer@demo.resourcex.au", "password": "!demo"}).status_code == 401


def test_listings_and_enquiries_with_login(client):
    new = {"material": "copper", "grade": "High quality", "form": "Granules", "tonnes": 10, "frequency": "Weekly", "priceAud": 7000}
    copper_offered = lambda: next(b["offeredT"] for b in client.get("/impact").json()["byMaterial"] if b["material"] == "copper")  # noqa: E731
    token = client.post("/auth/signup", json=seller_signup()).json()["token"]
    copper_before = copper_offered()
    created = client.post("/listings", json={**new, "company": "Someone Else", "abn": "99999999999"}, headers=auth_header(token))
    assert created.status_code == 201, created.text
    listing = created.json()
    # Name and ABN come from the account, not the form; weekly tonnes become monthly.
    assert listing["company"] == "Smithfield Steel Recovery" and listing["abn"] == "22222222222"
    assert listing["tonnes"] == pytest.approx(43.33, abs=0.01) and listing["suburb"] == "Smithfield"
    assert client.post("/listings", json={**new, "kind": "demand"}, headers=auth_header(token)).status_code == 403
    sent = client.post(f"/listings/{listing['id']}/enquiries", json={"tonnesPerMonth": 5, "firstDelivery": "November 2026"},
                       headers=auth_header(token))
    assert sent.status_code == 201 and sent.json()["status"] == "sent"
    # The new listing counts towards the impact dashboard's supply straight away.
    assert copper_offered() == pytest.approx(copper_before + listing["tonnes"], abs=0.1)


def test_current_website_flow_without_login_still_works(client):
    """The website on main signs up with POST /listings (no token) and sends quote requests without one."""
    legacy = {"kind": "demand", "company": "Penrith Fabrication", "abn": "11111111111", "suburb": "Penrith", "state": "NSW",
              "lat": -33.75, "lng": 150.69, "material": "aluminium", "grade": "High quality", "form": "Window frames",
              "tonnes": 80, "frequency": "Monthly", "priceAud": 1600, "virginPriceAud": None, "purity": None,
              "certifications": [], "budgetAud": 128000, "orderBy": "2026-11-10", "deliverBy": "2026-11-28"}
    created = client.post("/listings", json=legacy)
    assert created.status_code == 201, created.text
    assert created.json()["company"] == "Penrith Fabrication" and created.json()["priceAud"] == 1600
    missing = client.post("/listings", json={k: v for k, v in legacy.items() if k not in ("abn", "lat")})
    assert missing.status_code == 422 and "abn" in missing.json()["error"]
    sent = client.post(f"/listings/{created.json()['id']}/enquiries", json={"tonnesPerMonth": 5, "firstDelivery": "Nov"})
    assert sent.status_code == 201


def test_buyer_scores_use_their_requirement(client):
    token = client.post("/auth/signup", json=buyer_signup()).json()["token"]
    params = {"kind": "supply", "lat": -33.75, "lng": 150.69}
    personal = {l["id"]: l for l in client.get("/listings", params=params, headers=auth_header(token)).json()}
    anonymous = {l["id"]: l for l in client.get("/listings", params=params).json()}
    best = max(personal.values(), key=lambda l: l["matchScore"])
    assert best["material"] == "steel" and best["grade"] == "High quality"  # what this buyer registered for
    off = [l for l in personal.values() if l["material"] != "steel"]
    assert all(l["matchScore"] <= anonymous[l["id"]]["matchScore"] for l in off)


def test_seller_scores_use_their_listing_and_new_buyers(client):
    buyer = client.post("/auth/signup", json=buyer_signup()).json()["account"]
    seller_token = client.post("/auth/signup", json=seller_signup()).json()["token"]
    params = {"kind": "demand", "lat": -33.85, "lng": 150.94}
    tenders = {l["id"]: l for l in client.get("/listings", params=params, headers=auth_header(seller_token)).json()}
    assert buyer["listingId"] in tenders  # the newly registered manufacturer is in the seller's market
    steel_high = [l for l in tenders.values() if l["material"] == "steel" and l["grade"] == "High quality"]
    other = [l for l in tenders.values() if l["material"] != "steel"]
    assert max(l["matchScore"] for l in steel_high) > max(l["matchScore"] for l in other)
    assert tenders[buyer["listingId"]]["matchScore"] >= 60  # this seller can help fill the new buyer's tender
