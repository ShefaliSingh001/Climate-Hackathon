"""Impact of the marketplace's trades: CO2e avoided, landfill avoided and money saved.

Producers and manufacturers come from the marketplace database (`load_marketplace()`), so new sign-ups count as
soon as they list. There are no recorded trades yet, so `allocate()` projects them: it fills each manufacturer
tender from eligible producer offers. Once real trades (or accepted matches) exist, pass those to `summarise()`
instead; nothing else changes.
"""

import math
from dataclasses import dataclass

from .db import connect

# Same order as the grades table's rank: a higher number is a better grade.
GRADE_RANK = {"short_use": 0, "medium": 1, "high": 2}

# ---------------------------------------------------------------------------
# Factors. Every number the dashboard shows traces back to one of these.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Factor:
    tco2e_per_t: float  # tonnes CO2e avoided per tonne of scrap that replaces virgin material
    source: str
    url: str | None


EMISSION_FACTORS: dict[str, Factor] = {
    "steel": Factor(
        1.5,
        "worldsteel: each tonne of scrap used avoids 1.5 t CO2 (and 1.4 t iron ore, 740 kg coal)",
        "https://www.saisi.org/wp-content/uploads/2024/02/Scrap-Fact-Sheet.pdf",
    ),
    "aluminium": Factor(
        14.6,
        "International Aluminium Institute (2022): primary 15.1 t CO2e/t vs recycled 0.52 t CO2e/t",
        "https://international-aluminium.org/landing/as-well-as-aluminium-recycling-saving-95-of-the-energy-needed-for-primary-aluminium-production-the-recycling-process-saves-a-similar-percentage-in-greenhouse-gas-emissions/",
    ),
    "copper": Factor(
        3.2,
        "International Copper Association (2019): primary cathode 3.97 t CO2e/t vs 0.74 t for Aurubis 100%-scrap cathode",
        "https://aurubis.com/en/stolberg/responsibility/environmental-profile-of-aurubis-copper",
    ),
    "alloys": Factor(
        4.3,
        "Fraunhofer Institute via worldstainless: each tonne of stainless scrap saves 4.3 t CO2",
        "https://www.worldstainless.org/news/stainless-steel-co2-emissions-report/",
    ),
    "brass": Factor(
        3.2,
        "Proxy: copper factor (brass is mostly copper). No brass-specific source yet",
        None,
    ),
}

# Road freight: articulated HGV, average laden (UK DESNZ 2024 conversion factors).
TRUCK_KG_CO2E_PER_TKM = 0.0755
TRUCK_SOURCE = "UK DESNZ 2024 GHG conversion factors: articulated HGV, average laden, 0.0755 kg CO2e per tonne-km"
ROAD_FACTOR = 1.25  # straight line to road distance, same as the frontend (lib/geo.ts)
DEFAULT_ROAD_KM = 200.0  # used when either site has no coordinates yet

# National Waste Report 2022 (2020-21 data): 87% of metal waste is recovered, so 13% still goes to landfill.
METAL_LANDFILL_SHARE = 0.13
LANDFILL_SOURCE = "National Waste Report 2022: 87% of Australia's metal waste is recovered, 13% is landfilled"

CIRCULARITY = {
    "globalRatePct": 6.9,
    "globalSource": "Circularity Gap Report 2025 (Circle Economy)",
    "australiaRatePct": 4.3,
    "australiaSource": "ABS Measuring What Matters, circular economy indicator (2024)",
    "australiaGoal": "Double the circularity rate by 2035 (Australia's Circular Economy Framework, 2024)",
    "goalPct": 15.0,
    "goal": "COP31 Green Industrialisation: 15% global circular material use by 2035",
}

# ---------------------------------------------------------------------------
# Marketplace data
# ---------------------------------------------------------------------------


def load_marketplace() -> tuple[list[dict], list[dict]]:
    """Every producer offer and manufacturer tender on the marketplace, as plain dicts."""
    with connect() as db:
        producers = db.execute(
            "select name, abn, lat, lng, output_material, output_quantity_t, output_grade, price_aud_per_t, "
            "is_synthetic from producers order by id").fetchall()
        manufacturers = db.execute(
            "select name, abn, lat, lng, required_material, required_quantity_t, max_price_aud_per_t, "
            "output_grade_request, order_by, is_synthetic from manufacturers order by id").fetchall()
    for row in producers + manufacturers:
        row["is_synthetic"] = bool(row["is_synthetic"])
    return producers, manufacturers


# ---------------------------------------------------------------------------
# Projected trades
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Trade:
    producer: dict
    manufacturer: dict
    tonnes: float
    road_km: float
    distance_estimated: bool  # True when DEFAULT_ROAD_KM was used

    @property
    def material(self) -> str:
        return self.producer["output_material"]

    @property
    def price(self) -> float:
        return self.producer["price_aud_per_t"]


def road_km(a: dict, b: dict) -> float | None:
    """Rough road distance between two sites, or None if either has no coordinates."""
    if None in (a.get("lat"), a.get("lng"), b.get("lat"), b.get("lng")):
        return None
    rad = math.pi / 180
    d_lat, d_lng = (b["lat"] - a["lat"]) * rad, (b["lng"] - a["lng"]) * rad
    h = math.sin(d_lat / 2) ** 2 + math.cos(a["lat"] * rad) * math.cos(b["lat"] * rad) * math.sin(d_lng / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h)) * ROAD_FACTOR


def eligible(producer: dict, manufacturer: dict) -> bool:
    """Same material, at least the requested grade, within budget per tonne, and not the buyer itself."""
    return (
        producer["output_material"] == manufacturer["required_material"]
        and GRADE_RANK[producer["output_grade"]] >= GRADE_RANK[manufacturer["output_grade_request"]]
        and producer["price_aud_per_t"] <= manufacturer["max_price_aud_per_t"]
        and producer["abn"] != manufacturer["abn"]
    )


def allocate(producers: list[dict], manufacturers: list[dict]) -> list[Trade]:
    """Fill tenders in order-by date order, cheapest eligible offer first, until supply runs out.

    The dataset's tenders are alternatives that compete for the same supply, so each producer's
    tonnes can only be sold once.
    """
    remaining = [p["output_quantity_t"] for p in producers]
    trades: list[Trade] = []
    for m in sorted(manufacturers, key=lambda m: (m["order_by"], m["name"])):
        need = m["required_quantity_t"]
        candidates = [i for i, p in enumerate(producers) if remaining[i] > 0 and eligible(p, m)]
        candidates.sort(key=lambda i: (producers[i]["price_aud_per_t"],
                                       road_km(producers[i], m) or DEFAULT_ROAD_KM, producers[i]["name"]))
        for i in candidates:
            if need <= 0:
                break
            tonnes = min(need, remaining[i])
            km = road_km(producers[i], m)
            trades.append(Trade(producers[i], m, tonnes, km if km is not None else DEFAULT_ROAD_KM, km is None))
            remaining[i] -= tonnes
            need -= tonnes
    return trades


# ---------------------------------------------------------------------------
# Impact summary (the GET /impact response)
# ---------------------------------------------------------------------------


def trade_co2e_t(t: Trade) -> tuple[float, float]:
    """(CO2e avoided by replacing virgin material, CO2e emitted trucking it), both in tonnes."""
    avoided = t.tonnes * EMISSION_FACTORS[t.material].tco2e_per_t
    transport = t.tonnes * t.road_km * TRUCK_KG_CO2E_PER_TKM / 1000
    return avoided, transport


def summarise(trades: list[Trade], producers: list[dict], manufacturers: list[dict], period: str) -> dict:
    tonnes = sum(t.tonnes for t in trades)
    avoided = transport = 0.0
    by_material: dict[str, dict] = {}
    for t in trades:
        a, tr = trade_co2e_t(t)
        avoided += a
        transport += tr
        row = by_material.setdefault(t.material, {"material": t.material, "tonnes": 0.0, "co2eAvoidedT": 0.0})
        row["tonnes"] += t.tonnes
        row["co2eAvoidedT"] += a - tr

    for p in producers:
        by_material.setdefault(p["output_material"], {"material": p["output_material"], "tonnes": 0.0, "co2eAvoidedT": 0.0})
    offered = {k: sum(p["output_quantity_t"] for p in producers if p["output_material"] == k) for k in by_material}
    requested = {k: sum(m["required_quantity_t"] for m in manufacturers if m["required_material"] == k) for k in by_material}
    materials = sorted(by_material.values(), key=lambda r: -r["co2eAvoidedT"])
    for r in materials:
        r["offeredT"] = offered[r["material"]]
        r["requestedT"] = requested[r["material"]]
        r["tonnes"] = round(r["tonnes"], 1)
        r["co2eAvoidedT"] = round(r["co2eAvoidedT"], 1)

    filled_t: dict[int, float] = {}
    for t in trades:
        filled_t[id(t.manufacturer)] = filled_t.get(id(t.manufacturer), 0) + t.tonnes
    tenders_filled = sum(1 for m in manufacturers if filled_t.get(id(m), 0) >= m["required_quantity_t"])
    tenders_partial = sum(1 for m in manufacturers if 0 < filled_t.get(id(m), 0) < m["required_quantity_t"])

    estimated = [t for t in trades if t.distance_estimated]
    return {
        "period": period,
        "isSample": any(p["is_synthetic"] for p in producers),
        "tonnesRecirculated": round(tonnes, 1),
        "co2eAvoidedT": round(avoided - transport, 1),
        "transportCo2eT": round(transport, 1),
        "landfillAvoidedT": round(tonnes * METAL_LANDFILL_SHARE, 1),
        "moneySavedAud": round(sum(t.tonnes * (t.manufacturer["max_price_aud_per_t"] - t.price) for t in trades)),
        "valueRecoveredAud": round(sum(t.tonnes * t.price for t in trades)),
        "tonnesOffered": round(sum(p["output_quantity_t"] for p in producers), 1),
        "tonnesRequested": round(sum(m["required_quantity_t"] for m in manufacturers), 1),
        "trades": len(trades),
        "producers": {"total": len(producers), "matched": len({id(t.producer) for t in trades})},
        "tenders": {"total": len(manufacturers), "filled": tenders_filled, "partial": tenders_partial},
        "byMaterial": materials,
        "circularity": CIRCULARITY,
        "factors": [
            {"material": k, "tco2ePerT": f.tco2e_per_t, "source": f.source, "url": f.url}
            for k, f in EMISSION_FACTORS.items()
        ],
        "assumptions": [
            "Projected from the NSW demo dataset: each tender is filled from the cheapest eligible offers "
            "(same material, at least the requested grade, within budget) until supply runs out.",
            f"CO2e avoided is net of trucking: {TRUCK_SOURCE}; road distance = straight line x {ROAD_FACTOR}.",
            *([f"{len(estimated)} of {len(trades)} trades assume a {DEFAULT_ROAD_KM:.0f} km haul because a site "
               "has no coordinates yet."] if estimated else []),
            f"Landfill avoided = tonnes x {METAL_LANDFILL_SHARE:.0%}. {LANDFILL_SOURCE}.",
            "Money saved = what buyers budgeted per tonne minus the producer's price, times tonnes traded.",
        ],
    }


def impact_for(producers: list[dict], manufacturers: list[dict], period: str = "November 2026") -> dict:
    from .forecast import outlook  # forecast imports this module

    # Only metals have sourced factors so far; other materials (e.g. plastics from a new sign-up) are left out.
    skipped = sum(p["output_material"] not in EMISSION_FACTORS for p in producers) + \
        sum(m["required_material"] not in EMISSION_FACTORS for m in manufacturers)
    producers = [p for p in producers if p["output_material"] in EMISSION_FACTORS]
    manufacturers = [m for m in manufacturers if m["required_material"] in EMISSION_FACTORS]

    trades = allocate(producers, manufacturers)
    result = summarise(trades, producers, manufacturers, period)
    if skipped:
        result["assumptions"].append(f"{skipped} listings for materials without sourced factors yet (not metals) "
                                     "are not counted.")
    transport_t_per_t = result["transportCo2eT"] / result["tonnesRecirculated"] if result["tonnesRecirculated"] else 0
    result["outlook"] = outlook(trades, manufacturers, transport_t_per_t)
    return result
