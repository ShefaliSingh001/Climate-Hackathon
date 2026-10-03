"""Matching, powered by the tender matching model in API/scrap_model_api.py.

The model decides who is eligible (exact material and grade, required certifications, availability overlapping
the delivery window) and finds the cheapest (or fewest-supplier) combination of producers that delivers exactly
the requested tonnes within budget. This module only translates between the marketplace's listings and the
model's tender/producer shapes, and adds the per-supplier scores the "Ranked suppliers" view shows.
"""

import datetime as dt
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "API"))
from scrap_model_api import match as solve_tender  # noqa: E402

from .listings import GRADE_LABELS, road_km  # noqa: E402

ANY_GRADE = "any"
STRATEGY_TO_RANK_BY = {"cost": "lowest_cost", "fewest": "fewest_suppliers"}
MAX_PRODUCERS = 100  # the model's per-request limit


def default_window(today: dt.date | None = None) -> tuple[dt.date, dt.date]:
    """Next calendar month: buyers source for the coming month."""
    today = today or dt.date.today()
    start = (today.replace(day=1) + dt.timedelta(days=32)).replace(day=1)
    end = (start + dt.timedelta(days=32)).replace(day=1) - dt.timedelta(days=1)
    return start, end


def _clamp(v: float) -> int:
    return max(0, min(100, round(v)))


def to_model_producer(listing: dict, grade_filter: str) -> dict:
    """A supply listing as the model's Producer. With no grade filter every grade is passed as 'any'."""
    far_past, far_future = "2000-01-01", "2100-12-31"
    return {
        "id": listing["id"],
        "name": listing["company"],
        "material": listing["material"],
        "grade": ANY_GRADE if grade_filter == ANY_GRADE else listing["gradeKey"],
        "quantity_tonnes": round(listing["tonnes"], 3),
        "price_aud_per_tonne": round(listing["priceAud"], 2),
        "available_from": listing["availableFrom"] or far_past,
        "available_to": listing["availableTo"] or far_future,
        "certifications": listing["certifications"],
    }


def to_model_tender(req: dict, budget_aud: float) -> dict:
    start, end = default_window()
    return {
        "id": "marketplace-request",
        "material": req["material"],
        "grade": req.get("grade") or ANY_GRADE,
        "quantity_tonnes": round(req["tonnesPerMonth"], 3),
        "budget_aud": round(budget_aud, 2),
        "window_start": req.get("windowStart") or start.isoformat(),
        "window_end": req.get("windowEnd") or end.isoformat(),
        "required_certifications": req.get("certifications") or [],
    }


def candidates(supply: list[dict], req: dict) -> list[dict]:
    """Same-material supply listings, cheapest first, capped at the model's request limit."""
    same = [l for l in supply if l["material"] == req["material"]]
    if req.get("verifiedOnly"):
        same = [l for l in same if l["verified"]]
    return sorted(same, key=lambda l: l["priceAud"])[:MAX_PRODUCERS]


def run_model(supply: list[dict], req: dict, budget_aud: float, **options) -> dict:
    grade = req.get("grade") or ANY_GRADE
    producers = [to_model_producer(l, grade) for l in candidates(supply, req)]
    if not producers:
        return {"status": "infeasible", "reason": "No supply listed for this material yet.", "eligible_producer_count": 0,
                "excluded": [], "recommendations": [], "notice": ""}
    return solve_tender({"tender": to_model_tender(req, budget_aud), "producers": producers, **options})


# ---------------------------------------------------------------------------------------------
# Ranked suppliers (POST /matches)
# ---------------------------------------------------------------------------------------------

def breakdown(listing: dict, tonnes_per_month: float, ceiling: float, site: dict, eligible: bool, reference_price: float):
    km = road_km(site["lat"], site["lng"], listing["lat"], listing["lng"])
    benchmark = ceiling or reference_price
    price = _clamp(50 + (benchmark - listing["priceAud"]) / benchmark * 250) if benchmark else 60
    if ceiling and listing["priceAud"] > ceiling:
        price = min(price, 20)
    parts = {
        "material": 100 if eligible else 0,
        "distance": _clamp(100 - km / 10),
        "price": price,
        "reliability": _clamp((50 if listing["verified"] else 20) + 10 * len(listing["certifications"])),
        "volume": _clamp(listing["tonnes"] / max(tonnes_per_month, 1) * 100),
    }
    score = 0 if not eligible else round(parts["material"] * 0.3 + parts["distance"] * 0.25 + parts["price"] * 0.2
                                         + parts["reliability"] * 0.15 + parts["volume"] * 0.1)
    return score, parts, round(km)


def ranked_matches(supply: list[dict], req: dict) -> list[dict]:
    """Every same-material supplier, eligible ones first. Eligibility and the 'best combined order' come from the model."""
    tonnes = req["tonnesPerMonth"]
    ceiling = req.get("maxPriceAud") or 0
    budget = ceiling * tonnes if ceiling else 10 ** 11  # no ceiling: let any price through
    result = run_model(supply, req, budget, top_k=1)

    excluded = {e["producer_id"]: e["reasons"] for e in result["excluded"]}
    best = result["recommendations"][0]["allocations"] if result["recommendations"] else []
    in_best = {a["producer_id"]: a for a in best}
    pool = candidates(supply, req)
    reference = statistics.median(l["priceAud"] for l in pool) if pool else 0

    out = []
    for l in pool:
        eligible = l["id"] not in excluded
        score, parts, km = breakdown(l, tonnes, ceiling, req["site"], eligible, reference)
        if eligible:
            reasons = [f"{km} km by road"]
            if ceiling:
                diff = ceiling - l["priceAud"]
                reasons.append(f"A${abs(diff):,.0f}/t {'under' if diff >= 0 else 'over'} your ceiling")
            if l["id"] in in_best:
                reasons.append(f"in the best combined order: {in_best[l['id']]['quantity_tonnes']:,.0f} t")
            elif l["tonnes"] < tonnes:
                reasons.append(f"covers {parts['volume']}% of monthly volume")
        else:
            reasons = [r.rstrip(".").lower() for r in excluded[l["id"]]]
        out.append({"listing": l, "score": score, "breakdown": parts, "distanceKm": km, "reasons": reasons,
                    "eligible": eligible, "inBestPlan": l["id"] in in_best})
    out.sort(key=lambda r: (not r["eligible"], -r["score"]))
    return out


def baseline_score(listing: dict, site: dict, reference_price: float) -> int:
    """Card badge on the marketplace: how good this listing is for the site, with no specific requirement."""
    score, _, _ = breakdown(listing, listing["tonnes"], 0, site, True, reference_price)
    return score


# ---------------------------------------------------------------------------------------------
# Combined orders (POST /orders/plan)
# ---------------------------------------------------------------------------------------------

def plan_order(supply: list[dict], req: dict) -> dict:
    """Split one demand across up to maxPartners producers within a material budget. Up to 3 alternatives."""
    strategy = req.get("strategy", "cost")
    result = run_model(
        supply, req, req["budgetAud"],
        top_k=req.get("alternatives", 3),
        max_suppliers=req.get("maxPartners", 4),
        rank_by=STRATEGY_TO_RANK_BY.get(strategy, "lowest_cost"),
    )
    plans = [{
        "rank": r["rank"],
        "lines": [{
            "listingId": a["producer_id"],
            "tonnes": a["quantity_tonnes"],
            "priceAud": a["price_aud_per_tonne"],
            "costAud": a["cost_aud"],
            "proposedDelivery": a["proposed_delivery_date"],
        } for a in r["allocations"]],
        "supplierCount": r["supplier_count"],
        "totalTonnes": r["total_quantity_tonnes"],
        "totalCostAud": r["total_cost_aud"],
        "budgetRemainingAud": r["budget_remaining_aud"],
    } for r in result["recommendations"]]
    notice = result.get("notice", "")
    if strategy not in STRATEGY_TO_RANK_BY:
        notice = f"The matching model has no '{strategy}' objective yet, so these plans are lowest cost. " + notice
    return {
        "status": result["status"],
        "reason": result.get("reason"),
        "shortfallTonnes": result.get("shortfall_tonnes"),
        "plans": plans,
        "eligibleCount": result["eligible_producer_count"],
        "excluded": [{"listingId": e["producer_id"], "reasons": e["reasons"]} for e in result["excluded"]],
        "notice": notice,
        "grade": GRADE_LABELS.get(req.get("grade") or "", "Any grade"),
    }


# ---------------------------------------------------------------------------------------------
# Personal scores for signed-in accounts (matchScore on GET /listings)
# ---------------------------------------------------------------------------------------------
#
# Every producer and manufacturer in the database takes part, including ones that registered through the app.
# Listings of a material the account doesn't trade keep half their baseline score, so the cards that matter to
# this account sort first.

OFF_MATERIAL = 0.5
INELIGIBLE = 0.4


def _medians(listings: list[dict]) -> dict[str, float]:
    return {m: statistics.median(l["priceAud"] for l in listings if l["material"] == m)
            for m in {l["material"] for l in listings}}


def baseline_scores(listings: list[dict], site: dict) -> dict[str, int]:
    medians = _medians(listings)
    return {l["id"]: baseline_score(l, site, medians[l["material"]]) for l in listings}


def buyer_scores(supply: list[dict], requirement: dict, site: dict) -> dict[str, int]:
    """Supply cards for a buyer, scored by the model against the buyer's own registered requirement (tender)."""
    base = baseline_scores(supply, site)
    req = {
        "material": requirement["material"], "grade": requirement.get("gradeKey"),
        "tonnesPerMonth": requirement["tonnes"], "maxPriceAud": requirement["priceAud"], "site": site,
        "windowStart": requirement.get("availableFrom"), "windowEnd": requirement.get("availableTo"),
    }
    ranked = {r["listing"]["id"]: r for r in ranked_matches(supply, req)}
    scores = {}
    for l in supply:
        r = ranked.get(l["id"])
        if r is None:
            scores[l["id"]] = round(base[l["id"]] * OFF_MATERIAL)
        else:
            scores[l["id"]] = r["score"] if r["eligible"] else round(base[l["id"]] * INELIGIBLE)
    return scores


def _overlaps(a_from, a_to, b_from, b_to) -> bool:
    far_past, far_future = "2000-01-01", "2100-12-31"
    return max(a_from or far_past, b_from or far_past) <= min(a_to or far_future, b_to or far_future)


def tender_fit(supply: list[dict], tender: dict, anchor: dict) -> dict:
    """Can this seller (anchor producer) take part in this buyer's tender? Uses the model's producer mode.

    The model fixes the anchor's contribution (as much as it has, up to the tender's quantity) and looks for
    partners among all other producers to fill the rest within the buyer's budget.
    """
    reasons = []
    if anchor["material"] != tender["material"]:
        reasons.append("different material")
    if anchor.get("gradeKey") != tender.get("gradeKey"):
        reasons.append("grade mismatch")
    if not _overlaps(anchor.get("availableFrom"), anchor.get("availableTo"), tender.get("availableFrom"), tender.get("availableTo")):
        reasons.append("not available in the purchase window")
    if reasons:
        return {"eligible": False, "feasible": False, "reasons": reasons}
    producers = [to_model_producer(l, "exact") for l in supply if l["material"] == tender["material"]]
    producers = sorted(producers, key=lambda p: (p["id"] != anchor["id"], p["price_aud_per_tonne"]))[:MAX_PRODUCERS]
    result = solve_tender({
        "tender": {
            "id": tender["id"], "material": tender["material"], "grade": tender["gradeKey"],
            "quantity_tonnes": round(tender["tonnes"], 3), "budget_aud": round(tender["budgetAud"], 2),
            "window_start": tender.get("availableFrom") or tender.get("orderBy"),
            "window_end": tender.get("availableTo") or tender.get("deliverBy"),
            "required_certifications": [],
        },
        "producers": producers, "anchor_producer_id": anchor["id"], "top_k": 1,
    })
    if result["status"] == "feasible":
        plan = result["recommendations"][0]
        share = next(a["quantity_tonnes"] for a in plan["allocations"] if a["is_anchor"])
        return {"eligible": True, "feasible": True, "share": share / tender["tonnes"], "partners": len(plan["partner_ids"])}
    return {"eligible": True, "feasible": False, "reasons": [result.get("reason", "no feasible order")]}


def seller_scores(supply: list[dict], demand: list[dict], own: list[dict], site: dict) -> dict[str, int]:
    """Buyer-request cards for a seller, scored by whether the seller's own listings can help fill each tender."""
    base = baseline_scores(demand, site)
    scores = {}
    for tender in demand:
        mine = [l for l in own if l["material"] == tender["material"]]
        if not mine:
            scores[tender["id"]] = round(base[tender["id"]] * OFF_MATERIAL)
            continue
        best = None
        for anchor in mine:
            fit = tender_fit(supply, tender, anchor)
            if not fit["eligible"]:
                continue
            km = road_km(site["lat"], site["lng"], tender["lat"], tender["lng"])
            headroom = _clamp(50 + (tender["priceAud"] - anchor["priceAud"]) / max(tender["priceAud"], 1) * 250)
            fit_score = 70 + 30 * fit["share"] if fit["feasible"] else 45
            score = round(fit_score * 0.5 + _clamp(100 - km / 10) * 0.25 + headroom * 0.25)
            best = score if best is None else max(best, score)
        scores[tender["id"]] = best if best is not None else round(base[tender["id"]] * INELIGIBLE)
    return scores
