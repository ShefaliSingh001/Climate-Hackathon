"""Orders and seller collaborations (GET /orders, /collaborations...). Shapes: frontend/API_CONTRACT.md.

An order is one delivery agreement between a buyer and a seller. Quote requests and offers sent by a signed-in
account start as `pending` orders; a team's joint offer starts as a pending order with `partners`. Both parties are
copied onto the order, so an account sees the orders whose buyer_abn or seller_abn is its ABN.

A collaboration is several sellers filling one buyer request (a manufacturers row) together. The member with status
`lead` invites the others, and sends the joint offer once nobody is still `invited`.
"""

import datetime as dt
import json
import math
import random

from fastapi import HTTPException

from .db import DB
from .impact import EMISSION_FACTORS, TRUCK_KG_CO2E_PER_TKM
from .listings import GRADE_LABELS, get_listing, parse_id, road_km

# ---------------------------------------------------------------------------
# Freight and emissions (same rates as frontend/src/lib/logistics.ts)
# ---------------------------------------------------------------------------

# payload tonnes, A$ per km travelled (driver, fuel and tolls averaged)
TRUCKS = {"rigid": (12, 2.9), "semi": (24, 3.6), "bdouble": (38, 4.4)}
FEE_PER_TRIP = 180  # loading, weighbridge and unloading, A$

# Materials without a sourced factor in impact.py yet: the frontend's preview values (lib/materials.ts).
PREVIEW_TCO2E_PER_T = {"paper": 0.7, "plastics": 1.5, "ewaste": 2.0, "glass": 0.3}


def freight_per_tonne(tonnes: float, km: float) -> float:
    """Cheapest truck for this load and distance, empty return leg included, as A$ per tonne."""
    if tonnes <= 0:
        return 0.0
    cost = min(math.ceil(tonnes / payload) * (FEE_PER_TRIP + 2 * km * rate) for payload, rate in TRUCKS.values())
    return cost / tonnes


def co2e_avoided(material: str, tonnes: float, km: float) -> float:
    """Tonnes CO2e avoided against newly sourced material, net of trucking (same method as /impact)."""
    factor = EMISSION_FACTORS[material].tco2e_per_t if material in EMISSION_FACTORS else PREVIEW_TCO2E_PER_T.get(material, 0)
    return max(0.0, tonnes * factor - tonnes * km * TRUCK_KG_CO2E_PER_TKM / 1000)


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _iso(d: dt.datetime) -> str:
    return d.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------

def party(name: str, abn: str, locality: str, state: str) -> dict:
    return {"name": name, "abn": abn, "locality": locality, "state": state}


def account_party(account: dict) -> dict:
    return party(account["company"], account["abn"], account["locality"], account["state"])


def listing_party(listing: dict) -> dict:
    return party(listing["company"], listing["abn"], listing["suburb"], listing["state"])


def insert_order(db: DB, *, buyer: dict, seller: dict, material: str, grade: str, tonnes: float, price: float,
                 km: float, producer_id: int | None = None, manufacturer_id: int | None = None,
                 status: str = "pending", placed: dt.datetime | None = None, collaboration_id: int | None = None,
                 partners: list[str] | None = None, enquiry_id: int | None = None, synthetic: bool = False) -> int:
    placed = placed or _now()
    delivery = (placed + dt.timedelta(days=9 + round(km / 120))).date().isoformat()
    row = {
        "producer_id": producer_id, "manufacturer_id": manufacturer_id,
        "buyer_name": buyer["name"], "buyer_abn": buyer["abn"], "buyer_locality": buyer["locality"], "buyer_state": buyer["state"],
        "seller_name": seller["name"], "seller_abn": seller["abn"], "seller_locality": seller["locality"], "seller_state": seller["state"],
        "material": material, "grade": grade, "tonnes": round(tonnes, 2), "price_aud_per_t": round(price, 2),
        "freight_aud_per_t": round(freight_per_tonne(tonnes, km), 2), "distance_km": round(km, 1),
        "status": status, "placed_at": _iso(placed), "delivery_date": delivery,
        "co2e_avoided_t": round(co2e_avoided(material, tonnes, km), 2),
        "collaboration_id": collaboration_id, "partners": json.dumps(partners or []), "enquiry_id": enquiry_id,
        "is_synthetic": synthetic if db.postgres else int(synthetic),
    }
    return db.insert("orders", row)


def order_for_enquiry(db: DB, account: dict, listing: dict, tonnes: float, enquiry_id: int) -> int | None:
    """A signed-in quote request (buyer -> supply) or offer (seller -> buyer request) becomes a pending order."""
    table, row_id = parse_id(listing["id"])
    me = account_party(account)
    if account["abn"] == listing["abn"]:
        return None  # your own listing
    km = road_km(account["lat"], account["lng"], listing["lat"], listing["lng"])
    if table == "producers":
        buyer, seller, ids = me, listing_party(listing), {"producer_id": row_id, "manufacturer_id": account.get("manufacturer_id")}
    else:
        buyer, seller, ids = listing_party(listing), me, {"manufacturer_id": row_id, "producer_id": account.get("producer_id")}
    return insert_order(db, buyer=buyer, seller=seller, material=listing["material"], grade=listing["grade"],
                        tonnes=tonnes, price=listing["priceAud"], km=km, enquiry_id=enquiry_id, **ids)


def order_json(row: dict, role: str) -> dict:
    """The Order shape. listingId is the listing this account would open: supply for buyers, the request for sellers."""
    if role == "buyer":
        listing_id = f"p{row['producer_id']}" if row.get("producer_id") else None
    else:
        listing_id = f"m{row['manufacturer_id']}" if row.get("manufacturer_id") else None
    return {
        "id": f"o{row['id']}",
        "ref": f"RX-{10000 + row['id']}",
        "listingId": listing_id,
        "material": row["material"],
        "grade": row["grade"],
        "buyer": {"company": row["buyer_name"], "suburb": row["buyer_locality"], "state": row["buyer_state"]},
        "seller": {"company": row["seller_name"], "suburb": row["seller_locality"], "state": row["seller_state"]},
        "tonnes": row["tonnes"],
        "priceAud": row["price_aud_per_t"],
        "freightAud": row["freight_aud_per_t"],
        "distanceKm": row["distance_km"],
        "status": row["status"],
        "placedAt": row["placed_at"],
        "deliveryDate": row["delivery_date"],
        "co2eAvoidedT": row["co2e_avoided_t"],
        "collaborationId": f"c{row['collaboration_id']}" if row.get("collaboration_id") else None,
        "partners": json.loads(row["partners"] or "[]"),
    }


def orders_for(db: DB, account: dict) -> list[dict]:
    column = "buyer_abn" if account["role"] == "buyer" else "seller_abn"
    rows = db.execute(f"select * from orders where {column} = ? order by placed_at desc, id desc", (account["abn"],))
    return [order_json(r, account["role"]) for r in rows]


# ---------------------------------------------------------------------------
# Collaborations
# ---------------------------------------------------------------------------

def _collab_id(cid: str) -> int:
    if not (cid.startswith("c") and cid[1:].isdigit()):
        raise HTTPException(status_code=404, detail=f"Collaboration {cid} not found")
    return int(cid[1:])


def collaboration_json(db: DB, collab: dict) -> dict:
    request = get_listing(db, f"m{collab['manufacturer_id']}")
    members = db.execute("select * from collaboration_members where collaboration_id = ? order by "
                         "case status when 'lead' then 0 else 1 end, id", (collab["id"],)).fetchall()
    return {
        "id": f"c{collab['id']}",
        "requestId": f"m{collab['manufacturer_id']}",
        "buyer": {"company": request["company"], "suburb": request["suburb"], "state": request["state"]},
        "material": request["material"],
        "tonnesNeeded": request["tonnes"],
        "maxPriceAud": request["priceAud"],
        "members": [{
            "company": m["name"], "suburb": m["locality"], "state": m["state"], "abn": m["abn"],
            "listingId": f"p{m['producer_id']}" if m.get("producer_id") else None,
            "tonnes": m["tonnes"], "priceAud": m["price_aud_per_t"], "distanceKm": m["distance_km"], "status": m["status"],
        } for m in members],
        "status": collab["status"],
        "message": collab["message"],
        "createdAt": collab["created_at"],
    }


def collaborations_for(db: DB, account: dict) -> list[dict]:
    rows = db.execute(
        "select c.* from collaborations c where exists (select 1 from collaboration_members m "
        "where m.collaboration_id = c.id and m.abn = ?) order by c.created_at desc, c.id desc", (account["abn"],))
    return [collaboration_json(db, c) for c in rows]


def _load(db: DB, cid: str, account: dict) -> tuple[dict, dict]:
    """The collaboration and the caller's member row; 404 if it doesn't exist or the caller isn't in it."""
    collab = db.execute("select * from collaborations where id = ?", (_collab_id(cid),)).fetchone()
    mine = collab and db.execute("select * from collaboration_members where collaboration_id = ? and abn = ?",
                                 (collab["id"], account["abn"])).fetchone()
    if not collab or not mine:
        raise HTTPException(status_code=404, detail=f"Collaboration {cid} not found")
    return collab, mine


def _require_forming(collab: dict):
    if collab["status"] != "forming":
        raise HTTPException(status_code=409, detail="This team has already sent its offer or been withdrawn.")


def create_collaboration(db: DB, account: dict, request_id: str, members: list[dict], message: str) -> dict:
    request = get_listing(db, request_id)
    if request is None or request["kind"] != "demand":
        raise HTTPException(status_code=404, detail=f"Buyer request {request_id} not found")
    if request["abn"] == account["abn"]:
        raise HTTPException(status_code=422, detail="You can't team up on your own request.")
    rows, seen = [], set()
    for m in members:
        listing = get_listing(db, m["listingId"])
        if listing is None or listing["kind"] != "supply":
            raise HTTPException(status_code=422, detail=f"{m['listingId']} is not a supply listing")
        if listing["material"] != request["material"]:
            raise HTTPException(status_code=422, detail=f"{listing['company']} doesn't list {request['material']}")
        if listing["abn"] in seen:
            raise HTTPException(status_code=422, detail=f"{listing['company']} is listed twice")
        seen.add(listing["abn"])
        rows.append({
            "producer_id": int(listing["id"][1:]), "name": listing["company"], "abn": listing["abn"],
            "locality": listing["suburb"], "state": listing["state"], "tonnes": m["tonnes"],
            "price_aud_per_t": listing["priceAud"],
            "distance_km": round(road_km(listing["lat"], listing["lng"], request["lat"], request["lng"]), 1),
            "status": "lead" if listing["abn"] == account["abn"] else "invited",
        })
    if not any(r["status"] == "invited" for r in rows):
        raise HTTPException(status_code=422, detail="Invite at least one other recycler.")
    if account["abn"] not in seen:  # the lead has no listing of this material: it coordinates the team
        rows.insert(0, {"producer_id": None, "name": account["company"], "abn": account["abn"],
                        "locality": account["locality"], "state": account["state"], "tonnes": 0, "price_aud_per_t": 0,
                        "distance_km": round(road_km(account["lat"], account["lng"], request["lat"], request["lng"]), 1),
                        "status": "lead"})
    cid = db.insert("collaborations", {"manufacturer_id": int(request_id[1:]), "created_by_account_id": account["id"],
                                       "message": message.strip()})
    for r in rows:
        db.insert("collaboration_members", {"collaboration_id": cid, **r})
    return collaboration_json(db, db.execute("select * from collaborations where id = ?", (cid,)).fetchone())


def respond(db: DB, account: dict, cid: str, accept: bool) -> dict:
    collab, mine = _load(db, cid, account)
    _require_forming(collab)
    if mine["status"] != "invited":
        raise HTTPException(status_code=409, detail="You have already replied to this invite.")
    db.execute("update collaboration_members set status = ?, responded_at = ? where id = ?",
               ("accepted" if accept else "declined", _iso(_now()), mine["id"]))
    db.execute("update collaborations set message = message where id = ?", (collab["id"],))  # bumps updated_at
    return collaboration_json(db, collab)


def _require_lead(mine: dict):
    if mine["status"] != "lead":
        raise HTTPException(status_code=403, detail="Only the team's lead can do this.")


def withdraw(db: DB, account: dict, cid: str) -> dict:
    collab, mine = _load(db, cid, account)
    _require_lead(mine)
    _require_forming(collab)
    db.execute("update collaborations set status = 'withdrawn' where id = ?", (collab["id"],))
    return collaboration_json(db, {**collab, "status": "withdrawn"})


def send_offer(db: DB, account: dict, cid: str) -> dict:
    collab, mine = _load(db, cid, account)
    _require_lead(mine)
    _require_forming(collab)
    members = db.execute("select * from collaboration_members where collaboration_id = ?", (collab["id"],)).fetchall()
    if any(m["status"] == "invited" for m in members):
        raise HTTPException(status_code=409, detail="Wait for every partner to reply before sending the offer.")
    active = [m for m in members if m["status"] in ("lead", "accepted") and m["tonnes"] > 0]
    tonnes = sum(m["tonnes"] for m in active)
    if not tonnes:
        raise HTTPException(status_code=409, detail="Nobody in the team has committed any tonnes yet.")
    request = get_listing(db, f"m{collab['manufacturer_id']}")
    price = sum(m["tonnes"] * m["price_aud_per_t"] for m in active) / tonnes
    km = sum(m["tonnes"] * m["distance_km"] for m in active) / tonnes
    insert_order(db, buyer=listing_party(request), seller=party(mine["name"], mine["abn"], mine["locality"], mine["state"]),
                 material=request["material"], grade=request["grade"], tonnes=tonnes, price=price, km=km,
                 manufacturer_id=collab["manufacturer_id"], producer_id=mine.get("producer_id"),
                 collaboration_id=collab["id"], partners=[m["name"] for m in active if m["abn"] != mine["abn"]])
    db.execute("update collaborations set status = 'offer_sent' where id = ?", (collab["id"],))
    return collaboration_json(db, {**collab, "status": "offer_sent"})


# ---------------------------------------------------------------------------
# Demo activity for the one-click demo accounts (db.py seeds it once)
# ---------------------------------------------------------------------------

DEMO_BUYER_ABN, DEMO_SELLER_ABN = "99000000001", "99000000002"


def seed_demo_activity(db: DB) -> None:
    """About 18 months of orders for each demo account and two collaboration invites for the demo seller.

    Counterparts are dataset businesses, so no listings are added (the dataset counts stay 63 / 61). Runs once:
    it does nothing when demo orders already exist. Everything it writes has is_synthetic set.
    """
    if db.postgres:
        db.execute("select pg_advisory_xact_lock(4243)")
    if db.execute("select 1 as x from orders where buyer_abn = ? or seller_abn = ? limit 1",
                  (DEMO_BUYER_ABN, DEMO_SELLER_ABN)).fetchone():
        return
    accounts = {a["abn"]: a for a in db.execute("select * from accounts where is_demo = ?", (True if db.postgres else 1,))}
    buyer, seller = accounts.get(DEMO_BUYER_ABN), accounts.get(DEMO_SELLER_ABN)
    if not buyer or not seller:
        return
    producers = db.execute("select * from producers where output_material in ('copper', 'aluminium') and lat is not null "
                           "order by id").fetchall()
    copper_requests = db.execute("select * from manufacturers where required_material = 'copper' and lat is not null "
                                 "order by id").fetchall()
    copper_producers, abns = [], {DEMO_SELLER_ABN}
    for p in producers:  # distinct businesses, so each team has one row per ABN
        if p["output_material"] == "copper" and p["abn"] not in abns:
            copper_producers.append(p)
            abns.add(p["abn"])
    if not producers or not copper_requests or len(copper_producers) < 3:
        return

    rng = random.Random(2026)
    now = _now()
    me_buyer, me_seller = account_party(buyer), account_party(seller)

    def status_for(placed: dt.datetime) -> str:
        age = (now - placed).days
        if age > 24:
            return "cancelled" if rng.random() < 0.06 else "delivered"
        return "in_transit" if age > 12 else "confirmed" if age > 4 else "pending"

    def when(months_ago: int) -> dt.datetime:
        placed = now - dt.timedelta(days=months_ago * 30.4 + rng.randint(0, 27), hours=rng.randint(0, 8))
        return min(placed, now - dt.timedelta(hours=6))

    # The demo buyer (Westlink Cable Co.) buys copper and aluminium from dataset producers.
    for months_ago in range(17, -1, -1):
        for _ in range(2 + rng.randint(0, 1) + (1 if months_ago < 9 and rng.random() < 0.5 else 0)):
            p = rng.choice(producers)
            placed = when(months_ago)
            km = road_km(buyer["lat"], buyer["lng"], p["lat"], p["lng"])
            tonnes = max(2, round(min(p["output_quantity_t"], 45) * (0.35 + rng.random() * 0.6)))
            insert_order(db, buyer=me_buyer, seller=party(p["name"], p["abn"], p["locality"], p["state"]),
                         material=p["output_material"], grade=GRADE_LABELS[p["output_grade"]], tonnes=tonnes,
                         price=p["price_aud_per_t"] * (0.96 + rng.random() * 0.07), km=km, producer_id=p["id"],
                         status=status_for(placed), placed=placed, synthetic=True)

    # Always one fresh quote request waiting for a reply.
    p = copper_producers[0]
    insert_order(db, buyer=me_buyer, seller=party(p["name"], p["abn"], p["locality"], p["state"]), material="copper",
                 grade=GRADE_LABELS[p["output_grade"]], tonnes=20, price=p["price_aud_per_t"],
                 km=road_km(buyer["lat"], buyer["lng"], p["lat"], p["lng"]), producer_id=p["id"], status="pending",
                 placed=now - dt.timedelta(days=1), synthetic=True)

    # The demo seller (Hunter Copper Reclaim) sells copper to dataset buyers and to the demo buyer.
    buyers = [(party(m["name"], m["abn"], m["locality"], m["state"]), m["id"], m["lat"], m["lng"], m["max_price_aud_per_t"])
              for m in copper_requests] + [(me_buyer, None, buyer["lat"], buyer["lng"], 13200)]
    for months_ago in range(17, -1, -1):
        for _ in range(2 + rng.randint(0, 1)):
            b, mid, lat, lng, max_price = rng.choice(buyers)
            placed = when(months_ago)
            km = road_km(seller["lat"], seller["lng"], lat, lng)
            insert_order(db, buyer=b, seller=me_seller, material="copper", grade="High quality",
                         tonnes=max(2, round(25 * (0.35 + rng.random() * 0.6))),
                         price=min(max_price, 13050) * (0.96 + rng.random() * 0.05), km=km, manufacturer_id=mid,
                         status=status_for(placed), placed=placed, synthetic=True)

    m = copper_requests[0]
    insert_order(db, buyer=party(m["name"], m["abn"], m["locality"], m["state"]), seller=me_seller, material="copper",
                 grade="High quality", tonnes=12, price=min(m["max_price_aud_per_t"], 13050),
                 km=road_km(seller["lat"], seller["lng"], m["lat"], m["lng"]), manufacturer_id=m["id"], status="pending",
                 placed=now - dt.timedelta(days=2), synthetic=True)

    # Two invites to the demo seller from dataset copper producers, on dataset copper requests.
    for i, (lead, partner) in enumerate(((copper_producers[0], None), (copper_producers[1], copper_producers[2]))):
        request = copper_requests[i % len(copper_requests)]
        need = request["required_quantity_t"]
        cid = db.insert("collaborations", {
            "manufacturer_id": request["id"], "is_synthetic": True if db.postgres else 1,
            "message": (f"{request['name']} need {need:g} tonnes and we can't cover it alone. Can you take a share from Kooragang?"
                        if i == 0 else f"Splitting the {request['name']} tender three ways keeps each of us under capacity."),
            "created_at": _iso(now - dt.timedelta(days=1 + 2 * i)),
        })
        share = max(1, round(need / (2 if partner is None else 3)))
        team = [(lead, "lead", max(1, round(min(lead["output_quantity_t"], need - share))))]
        if partner is not None:
            team.append((partner, "accepted", max(1, round(min(partner["output_quantity_t"], share)))))
        for p, status, tonnes in team:
            db.insert("collaboration_members", {
                "collaboration_id": cid, "producer_id": p["id"], "name": p["name"], "abn": p["abn"], "locality": p["locality"],
                "state": p["state"], "tonnes": tonnes, "price_aud_per_t": p["price_aud_per_t"],
                "distance_km": round(road_km(p["lat"], p["lng"], request["lat"], request["lng"]), 1), "status": status})
        db.insert("collaboration_members", {
            "collaboration_id": cid, "producer_id": None, "name": seller["company"], "abn": seller["abn"],
            "locality": seller["locality"], "state": seller["state"], "tonnes": share, "price_aud_per_t": 13050,
            "distance_km": round(road_km(seller["lat"], seller["lng"], request["lat"], request["lng"]), 1), "status": "invited"})
