"""API tests against a temporary copy of the database. Run from the repo root: pytest backend/tests"""

import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app import db as db_module
from backend.app.main import app

SITE = {"name": "Westlink Cable Co.", "suburb": "Wetherill Park", "state": "NSW", "lat": -33.847, "lng": 150.9}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    copy = tmp_path / "circulink.db"
    shutil.copy(Path(db_module.__file__).resolve().parents[1] / "db" / "circulink.db", copy)
    monkeypatch.setattr(db_module, "DB_PATH", copy)
    return TestClient(app)


def test_listings_follow_the_contract(client):
    supply = client.get("/listings", params={"kind": "supply", "lat": SITE["lat"], "lng": SITE["lng"]}).json()
    demand = client.get("/listings", params={"kind": "demand"}).json()
    assert len(supply) == 63 and len(demand) == 61
    for l in supply + demand:
        assert l["id"][0] in "pm" and l["lat"] is not None and l["lng"] is not None
        assert l["frequency"] == "Monthly" and l["grade"] in {"High quality", "Medium quality", "Short use"}
    assert all(0 <= l["matchScore"] <= 100 for l in supply)
    one = client.get(f"/listings/{supply[0]['id']}").json()
    assert one["company"] == supply[0]["company"]
    assert client.get("/listings/p99999").status_code == 404
    assert client.get("/listings/nonsense").json()["error"]


def test_matches_use_model_eligibility(client):
    body = {"material": "steel", "grade": "high", "tonnesPerMonth": 300, "maxPriceAud": 330, "site": SITE}
    results = client.post("/matches", json=body).json()
    assert results and all(r["listing"]["material"] == "steel" for r in results)
    eligible = [r for r in results if r["eligible"]]
    excluded = [r for r in results if not r["eligible"]]
    assert all(r["listing"]["grade"] == "High quality" for r in eligible)
    assert excluded and all(r["score"] == 0 and "grade mismatch" in r["reasons"] for r in excluded)
    assert results.index(eligible[-1]) < results.index(excluded[0])  # eligible first
    assert any(r["inBestPlan"] for r in eligible)


def test_order_plan_meets_demand_within_budget(client):
    body = {"material": "steel", "grade": "high", "tonnesPerMonth": 300, "budgetAud": 95000, "site": SITE, "maxPartners": 4}
    plan = client.post("/orders/plan", json=body).json()
    assert plan["status"] == "feasible" and 1 <= len(plan["plans"]) <= 3
    supply = {l["id"]: l for l in client.get("/listings", params={"kind": "supply"}).json()}
    for p in plan["plans"]:
        assert abs(sum(l["tonnes"] for l in p["lines"]) - 300) < 1e-6
        assert p["totalCostAud"] <= 95000 and p["supplierCount"] <= 4
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
    base = {"material": "steel", "tonnesPerMonth": 300, "budgetAud": 120000, "site": SITE, "maxPartners": 8}
    cheapest = client.post("/orders/plan", json={**base, "strategy": "cost"}).json()["plans"][0]
    fewest = client.post("/orders/plan", json={**base, "strategy": "fewest"}).json()["plans"][0]
    assert fewest["supplierCount"] <= cheapest["supplierCount"]
    assert cheapest["totalCostAud"] <= fewest["totalCostAud"]


def test_create_listing_and_enquiry(client):
    new = {"kind": "supply", "company": "Test Yard", "abn": "12345678901", "suburb": "Wetherill Park", "state": "NSW",
           "lat": -33.85, "lng": 150.9, "material": "copper", "grade": "High quality", "form": "Granules",
           "tonnes": 10, "frequency": "Weekly", "priceAud": 7000, "certifications": ["EPA licence"],
           "purity": 99.9, "virginPriceAud": None}
    created = client.post("/listings", json=new)
    assert created.status_code == 201
    listing = created.json()
    assert listing["id"].startswith("p") and listing["tonnes"] == pytest.approx(43.33, abs=0.01)
    assert client.post("/listings", json={**new, "abn": "123"}).status_code == 422
    assert client.post("/listings", json={**new, "grade": "shiny"}).status_code == 422
    sent = client.post(f"/listings/{listing['id']}/enquiries", json={"tonnesPerMonth": 5, "firstDelivery": "November 2026", "message": "hi"})
    assert sent.status_code == 201 and sent.json()["status"] == "sent"
    assert client.get("/impact").json()["matchesConverted"] == 1


def test_bad_request_is_json_error(client):
    r = client.post("/orders/plan", json={"material": "gold", "tonnesPerMonth": 1, "budgetAud": 1, "site": SITE})
    assert r.status_code == 422 and "material" in r.json()["error"]
