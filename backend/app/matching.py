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
