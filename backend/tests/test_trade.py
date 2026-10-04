"""Orders and seller collaborations (app/trade.py). Runs on SQLite and Postgres like test_api.py."""

import pytest

from backend.tests.test_api import auth_header, client, postgres_url, seller_signup  # noqa: F401 (fixtures)


def demo(client, role):
    return client.post("/auth/demo", json={"role": role}).json()["token"]


# A material with several suppliers and at least one buyer request in the dataset.
TEAM_MATERIAL = "alloys"


def copper(client, kind):
    return [l for l in client.get("/listings", params={"kind": kind}).json() if l["material"] == "copper"]


def team_material(client, kind):
    return [l for l in client.get("/listings", params={"kind": kind}).json() if l["material"] == TEAM_MATERIAL]


def test_orders_need_a_login(client):
    assert client.get("/orders").status_code == 401
    assert client.get("/collaborations").status_code == 401


def test_demo_accounts_have_order_history(client):
    buyer = client.get("/orders", headers=auth_header(demo(client, "buyer"))).json()
    seller = client.get("/orders", headers=auth_header(demo(client, "seller"))).json()
    assert len(buyer) > 30 and len(seller) > 30
    assert all(o["buyer"]["company"] == "Westlink Cable Co." for o in buyer)
    assert all(o["seller"]["company"] == "Hunter Copper Reclaim" and o["material"] == "copper" for o in seller)
    assert {o["status"] for o in buyer} >= {"delivered", "pending"}
    o = buyer[0]
    assert o["ref"].startswith("RX-") and o["placedAt"] >= buyer[-1]["placedAt"]  # newest first
    assert o["tonnes"] > 0 and o["priceAud"] > 0 and o["freightAud"] >= 0 and o["co2eAvoidedT"] >= 0
    assert o["listingId"] is None or o["listingId"].startswith("p")
    # The seed runs once: a second connection doesn't duplicate it.
    assert len(client.get("/orders", headers=auth_header(demo(client, "buyer"))).json()) == len(buyer)


def test_quote_request_becomes_a_pending_order_for_both_sides(client):
    token = demo(client, "buyer")
    supplier = copper(client, "supply")[0]
    before = len(client.get("/orders", headers=auth_header(token)).json())
    r = client.post(f"/listings/{supplier['id']}/enquiries", headers=auth_header(token),
                    json={"tonnesPerMonth": 12, "firstDelivery": "November 2026", "message": "Hi"})
    assert r.status_code == 201 and r.json()["status"] == "sent"
    orders = client.get("/orders", headers=auth_header(token)).json()
    assert len(orders) == before + 1
    new = orders[0]
    assert new["status"] == "pending" and new["tonnes"] == 12 and new["listingId"] == supplier["id"]
    assert new["seller"]["company"] == supplier["company"] and new["priceAud"] == supplier["priceAud"]
    # Without a login the enquiry still works (the current website) but no order is recorded.
    client.post(f"/listings/{supplier['id']}/enquiries", json={"tonnesPerMonth": 5, "firstDelivery": "Soon"})
    assert len(client.get("/orders", headers=auth_header(token)).json()) == before + 1


def test_seller_offer_on_a_buyer_request(client):
    token = demo(client, "seller")
    request = team_material(client, "demand")[0]
    client.post(f"/listings/{request['id']}/enquiries", headers=auth_header(token),
                json={"tonnesPerMonth": 8, "firstDelivery": "December 2026", "message": ""})
    new = client.get("/orders", headers=auth_header(token)).json()[0]
    assert new["status"] == "pending" and new["buyer"]["company"] == request["company"] and new["listingId"] == request["id"]


def test_demo_seller_has_invites_and_can_reply(client):
    token = demo(client, "seller")
    teams = client.get("/collaborations", headers=auth_header(token)).json()
    assert len(teams) == 2
    for t in teams:
        me = [m for m in t["members"] if m["abn"] == "99000000002"]
        assert me and me[0]["status"] == "invited" and t["members"][0]["status"] == "lead"
        assert t["requestId"].startswith("m") and t["tonnesNeeded"] > 0
    r = client.post(f"/collaborations/{teams[0]['id']}/respond", headers=auth_header(token), json={"accept": True})
    assert r.status_code == 200
    assert [m["status"] for m in r.json()["members"] if m["abn"] == "99000000002"] == ["accepted"]
    again = client.post(f"/collaborations/{teams[0]['id']}/respond", headers=auth_header(token), json={"accept": False})
    assert again.status_code == 409
    # Only the lead sends the offer.
    assert client.post(f"/collaborations/{teams[0]['id']}/offer", headers=auth_header(token)).status_code == 403


def test_team_up_invite_accept_offer_becomes_joint_order(client):
    # A recycler signs up and leads a team with a dataset recycler.
    lead = client.post("/auth/signup", json=seller_signup(material=TEAM_MATERIAL, tonnes=10, priceAud=2500)).json()
    lead_token, lead_listing = lead["token"], lead["account"]["listingId"]
    request = team_material(client, "demand")[0]
    other = next(l for l in team_material(client, "supply") if l["id"] != lead_listing and l["abn"] != request["abn"])
    body = {"requestId": request["id"], "message": "Can you cover the rest?",
            "members": [{"listingId": lead_listing, "tonnes": 10}, {"listingId": other["id"], "tonnes": 5}]}
    r = client.post("/collaborations", headers=auth_header(lead_token), json=body)
    assert r.status_code == 201, r.text
    team = r.json()
    assert team["status"] == "forming" and [m["status"] for m in team["members"]] == ["lead", "invited"]

    # Can't send while a partner hasn't replied.
    assert client.post(f"/collaborations/{team['id']}/offer", headers=auth_header(lead_token)).status_code == 409

    # The invited business signs up (same ABN as its listing) and accepts.
    partner = client.post("/auth/signup", json={**seller_signup(), "email": "ops@partner.com.au", "abn": other["abn"],
                                                "company": other["company"]}).json()
    seen = client.get("/collaborations", headers=auth_header(partner["token"])).json()
    assert team["id"] in [t["id"] for t in seen]
    client.post(f"/collaborations/{team['id']}/respond", headers=auth_header(partner["token"]), json={"accept": True})

    sent = client.post(f"/collaborations/{team['id']}/offer", headers=auth_header(lead_token))
    assert sent.status_code == 200 and sent.json()["status"] == "offer_sent"
    order = client.get("/orders", headers=auth_header(lead_token)).json()[0]
    assert order["tonnes"] == 15 and order["partners"] == [other["company"]] and order["collaborationId"] == team["id"]
    assert order["buyer"]["company"] == request["company"] and order["status"] == "pending"
    assert order["priceAud"] == pytest.approx((10 * 2500 + 5 * other["priceAud"]) / 15, abs=0.01)
    # Once sent, the team can't change.
    assert client.post(f"/collaborations/{team['id']}/withdraw", headers=auth_header(lead_token)).status_code == 409


def test_collaboration_rules(client):
    seller = client.post("/auth/signup", json=seller_signup(material=TEAM_MATERIAL)).json()["token"]
    request = team_material(client, "demand")[0]
    steel = next(l for l in client.get("/listings", params={"kind": "supply"}).json() if l["material"] == "steel")
    cu = next(l for l in team_material(client, "supply") if l["abn"] != request["abn"])
    def create(token, members):
        return client.post("/collaborations", headers=auth_header(token), json={"requestId": request["id"], "members": members})
    assert create(seller, [{"listingId": steel["id"], "tonnes": 5}]).status_code == 422  # wrong material
    assert create(seller, [{"listingId": "m1", "tonnes": 5}]).status_code == 422          # not a supply listing
    same_business = next((l for l in team_material(client, "supply") if l["abn"] == request["abn"]), None)
    if same_business:  # a business can't supply its own request
        assert create(seller, [{"listingId": same_business["id"], "tonnes": 5}]).status_code == 422
    assert create(demo(client, "buyer"), [{"listingId": cu["id"], "tonnes": 5}]).status_code == 403  # buyers can't
    # A seller with no listing of that material still leads (0 tonnes) and invites others.
    team = create(demo(client, "seller"), [{"listingId": cu["id"], "tonnes": 5}]).json()
    assert [(m["status"], m["tonnes"]) for m in team["members"]] == [("lead", 0), ("invited", 5)]
    assert client.post(f"/collaborations/{team['id']}/withdraw", headers=auth_header(seller)).status_code == 404  # not in it
    ok = client.post(f"/collaborations/{team['id']}/withdraw", headers=auth_header(demo(client, "seller")))
    assert ok.status_code == 200 and ok.json()["status"] == "withdrawn"
    assert client.get("/collaborations/c99999").status_code in (404, 405)


def test_verified_means_abn_and_address_round_trips(client):
    supply = client.get("/listings", params={"kind": "supply"}).json()
    assert all(l["verified"] for l in supply)
    token = client.post("/auth/signup", json=seller_signup()).json()["token"]
    r = client.post("/listings", headers=auth_header(token), json={
        "material": "steel", "grade": "High quality", "tonnes": 20, "priceAud": 300,
        "suburb": "Tomago", "state": "NSW", "lat": -32.87, "lng": 151.76, "address": "12 Old Punt Road", "postcode": "2322"})
    assert r.status_code == 201, r.text
    listing = r.json()
    assert listing["address"] == "12 Old Punt Road" and listing["postcode"] == "2322" and listing["verified"]
    bad = client.post("/listings", headers=auth_header(token), json={
        "material": "steel", "grade": "High quality", "tonnes": 20, "priceAud": 300, "lat": -32.8, "lng": 151.7, "postcode": "23"})
    assert bad.status_code == 422 and "postcode" in bad.json()["error"]
