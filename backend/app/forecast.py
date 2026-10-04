"""2035 outlook: the recycled share of the metal that small and medium manufacturers on ResourceX buy, with and
without the marketplace.

Each buyer has a profile in backend/data/buyer_profiles.csv (from backend/scripts/market_dataset.py): its total metal
use, the recycled share its process runs at today, and the most that process can take. A buyer that signed up
through the website has no profile yet, so it gets its metal's world average (RECYCLED_SHARE) and a total metal use
of tender / share.

Business as usual keeps each process where it is (only the world-average fallback for aluminium follows the IAI
outlook). With ResourceX, the scrap the marketplace matches for each buyer is added on top: the information-gap
assumption is that without the marketplace they would have bought new metal for that part of the job. Matched supply
grows each year as more producers list, but never past the buyer's process limit.

The headline group is SME manufacturers (foundries and fabricators). The two steel mills already run at their
process limits (an electric arc furnace on 100% scrap, a basic oxygen furnace near its ~30% maximum), so no
marketplace can move their recycled share; they are reported separately, in tonnes.

The 15% COP31 goal is for the whole economy (all materials); metals are already above it.
"""

import csv
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from .impact import EMISSION_FACTORS, Trade

BASE_YEAR, END_YEAR = 2026, 2035
PROFILES_CSV = Path(__file__).resolve().parents[1] / "data" / "buyer_profiles.csv"
HEADLINE_SEGMENT = "SME manufacturer"


@dataclass(frozen=True)
class RecycledShare:
    now: float  # share of metal input that is recycled today
    in_2050: float | None  # where the industry itself expects to be in 2050 (None: no growth expected)
    ceiling: float  # highest share with credible evidence; the marketplace can't push past it
    source_name: str  # short label shown on the dashboard
    source: str
    url: str


# World averages per metal: used for buyers without a profile (new sign-ups).
RECYCLED_SHARE: dict[str, RecycledShare] = {
    "steel": RecycledShare(
        0.33, None, 0.48, "IEA, BIR",
        "IEA: scrap is 33% of metallic inputs to steelmaking (2022) and 48% by 2050 in its net-zero pathway. "
        "BIR agrees (461 Mt of scrap for the 76% of world steel it covers, about 32%) and shows scrap use flat "
        "since 2020, so business as usual stays at 33%",
        "https://www.iea.org/reports/iron-and-steel-technology-roadmap",
    ),
    "aluminium": RecycledShare(
        0.29, 0.50, 0.50, "IAI",
        "IAI: recycled aluminium is about 29% of consumption today and could meet half of demand by 2050",
        "https://waste-management-world.com/a/recycled-aluminium-could-meet-50-percent-of-demand-by",
    ),
    "copper": RecycledShare(
        0.32, None, 0.50, "ICA, UCL",
        "International Copper Association: 32% of copper demand is met by recycled copper; UCL finds the secondary "
        "share reaches about 50% by 2050 only in the most optimistic scenario",
        "https://internationalcopper.org/sustainable-copper/circular-economy/",
    ),
    "brass": RecycledShare(
        0.91, None, 0.96, "USGS",
        "USGS Minerals Yearbook: 91-96% of brass and bronze ingot is made from scrap",
        "https://search.library.wisc.edu/digital/ALAGORVJYOGFX28A/text/ACOYWOTGXIR4WR8H",
    ),
    "alloys": RecycledShare(
        0.48, None, 0.85, "worldstainless",
        "worldstainless (KIT study): global stainless steel recycled content was 48% in 2019; Europe already reaches 85%",
        "https://worldstainless.org/news/global-life-cycle-of-stainless-steel",
    ),
}

# Where each buyer profile's recycled share today and process limit come from.
PROCESS_SOURCES: dict[str, tuple[str, str, str]] = {
    "Electric arc furnace steel mill": (
        "InfraBuild",
        "InfraBuild: the Sydney Steel Mill melts 100% recycled Australian scrap; capacity 680,000 t a year",
        "https://www.infrabuild.com/media-releases/new-steel-facility-to-service-western-sydneys-50-billion-infrastructure-boom/",
    ),
    "Blast furnace / basic oxygen steelworks": (
        "BlueScope; BOF studies",
        "BlueScope: scrap rose from 21.5% to 27.8% of the charge (FY19-FY25); a basic oxygen furnace typically "
        "takes about 25% scrap, up to about 29-30% with process changes",
        "https://steel.com.au/resources/articles/recycled-content",
    ),
    "Iron foundry": (
        "Archives of Foundry Engineering",
        "Synthetic cast iron charges are 40-60% pig iron, 20-45% steel scrap and 15-30% returns: 40-60% recycled",
        "https://journals.pan.pl//Content/127177/PDF/AFE%202_2023_10_final%20version.pdf",
    ),
    "Stainless and alloy foundry": (
        "worldstainless",
        "worldstainless (KIT study): global stainless steel recycled content 48% (2019); Europe already reaches 85%",
        "https://worldstainless.org/news/global-life-cycle-of-stainless-steel",
    ),
    "Aluminium foundry": (
        "Chalmers; estimate",
        "Secondary aluminium casting alloys can run on up to 90% recycled content (Chalmers); 80% today is our "
        "estimate for a jobbing foundry",
        "https://odr.chalmers.se/items/6d25397e-a96e-4330-9a08-af108cab42df",
    ),
    "Brass and bronze foundry": (
        "USGS",
        "USGS Minerals Yearbook: 91-96% of brass and bronze ingot is made from scrap",
        "https://search.library.wisc.edu/digital/ALAGORVJYOGFX28A/text/ACOYWOTGXIR4WR8H",
    ),
    "Steel fabricator (reusing offcuts)": (
        "IEA, BIR",
        "Steel bought new carries the world-average 33% recycled content (IEA, BIR); reusing offcuts adds to it, "
        "up to the 48% the IEA's net-zero pathway reaches",
        "https://www.iea.org/reports/iron-and-steel-technology-roadmap",
    ),
    "Stainless fabricator (reusing offcuts)": (
        "worldstainless",
        "New stainless carries the world-average 48% recycled content; Europe already reaches 85% (worldstainless)",
        "https://worldstainless.org/news/global-life-cycle-of-stainless-steel",
    ),
}

# How fast the scrap matched on ResourceX grows each year as more producers list. These are scenarios, not data.
SCENARIOS = [
    ("conservative", "Conservative", 0.10),
    ("expected", "Expected", 0.25),
    ("ambitious", "Ambitious", 0.40),
]


@dataclass(frozen=True)
class Profile:
    segment: str
    process: str
    use: float  # tonnes of metal a month
    now: float
    limit: float
    material: str | None = None  # set for world-average fallbacks, whose business as usual can follow a trend


@lru_cache(maxsize=1)
def load_profiles() -> dict[str, dict]:
    if not PROFILES_CSV.exists():
        return {}
    with PROFILES_CSV.open(encoding="utf-8") as f:
        return {row["abn"]: row for row in csv.DictReader(f)}


def profile_for(manufacturer: dict) -> Profile:
    row = load_profiles().get(manufacturer["abn"])
    if row:
        return Profile(row["segment"], row["process"], float(row["metal_use_t_per_month"]),
                       float(row["recycled_share_now"]), float(row["recycled_share_limit"]))
    k = manufacturer["required_material"]
    s = RECYCLED_SHARE[k]
    return Profile(HEADLINE_SEGMENT, f"New sign-up ({k}, world average)", manufacturer["required_quantity_t"] / s.now,
                   s.now, s.ceiling, k)


def bau_share(material: str, year: int) -> float:
    """World-average business as usual: linear from today to the industry's own 2050 outlook, or flat."""
    s = RECYCLED_SHARE[material]
    if s.in_2050 is None:
        return s.now
    return s.now + (s.in_2050 - s.now) * (year - BASE_YEAR) / (2050 - BASE_YEAR)


def _bau(p: Profile, year: int) -> float:
    return bau_share(p.material, year) if p.material else p.now


def _source(p: Profile) -> tuple[str, str, str]:
    if p.material:
        s = RECYCLED_SHARE[p.material]
        return s.source_name, s.source, s.url
    return PROCESS_SOURCES[p.process]


def outlook(trades: list[Trade], manufacturers: list[dict], transport_t_per_t: float) -> dict:
    """Year-by-year recycled share for the headline group, business as usual vs each ResourceX scenario."""
    profiles = {id(m): profile_for(m) for m in manufacturers}
    matched: dict[int, float] = {}
    for t in trades:
        matched[id(t.manufacturer)] = matched.get(id(t.manufacturer), 0.0) + t.tonnes
    co2_per_t = {id(m): EMISSION_FACTORS[m["required_material"]].tco2e_per_t - transport_t_per_t for m in manufacturers}

    group = [m for m in manufacturers if profiles[id(m)].segment == HEADLINE_SEGMENT]
    mills = [m for m in manufacturers if profiles[id(m)].segment != HEADLINE_SEGMENT]
    use = sum(profiles[id(m)].use for m in group) or 1.0
    years = list(range(BASE_YEAR, END_YEAR + 1))

    def recycled(year: int, growth: float | None) -> tuple[float, float]:
        """(recycled tonnes a month for the group, extra tonnes from ResourceX)."""
        base = extra = 0.0
        for m in group:
            p = profiles[id(m)]
            b = _bau(p, year)
            base += b * p.use
            if growth is not None:
                headroom = max(0.0, p.limit - b) * p.use
                extra += min(matched.get(id(m), 0.0) * (1 + growth) ** (year - BASE_YEAR), headroom)
        return base, extra

    scenarios = []
    for key, label, growth in SCENARIOS:
        series, co2 = [], 0.0
        for y in years:
            base, extra = recycled(y, growth)
            series.append(round(100 * (base + extra) / use, 1))
            # CO2e from the extra recycled metal, per buyer's material.
            for m in group:
                p = profiles[id(m)]
                headroom = max(0.0, p.limit - _bau(p, y)) * p.use
                co2 += 12 * min(matched.get(id(m), 0.0) * (1 + growth) ** (y - BASE_YEAR), headroom) * co2_per_t[id(m)]
        _, extra_end = recycled(END_YEAR, growth)
        scenarios.append({"key": key, "label": label, "growthPct": round(growth * 100), "sharePct": series,
                          "extraTonnesPerYear2035": round(12 * extra_end), "co2eAvoidedT": round(co2)})

    # One row per kind of buyer in the headline group, for the "where these numbers come from" table.
    groups: dict[str, dict] = {}
    for m in group:
        p = profiles[id(m)]
        g = groups.setdefault(p.process, {"use": 0.0, "now": 0.0, "bau": 0.0, "limit": 0.0, "buyers": 0, "p": p})
        g["use"] += p.use
        g["now"] += p.use * p.now
        g["bau"] += p.use * _bau(p, END_YEAR)
        g["limit"] += p.use * p.limit
        g["buyers"] += 1
    baselines = []
    for process, g in sorted(groups.items(), key=lambda kv: -kv[1]["use"]):
        name, text, url = _source(g["p"])
        baselines.append({
            "group": process, "buyers": g["buyers"], "mixPct": round(100 * g["use"] / use, 1),
            "inputTonnesPerMonth": round(g["use"]), "nowPct": round(100 * g["now"] / g["use"], 1),
            "bau2035Pct": round(100 * g["bau"] / g["use"], 1), "ceilingPct": round(100 * g["limit"] / g["use"], 1),
            "sourceName": name, "source": text, "url": url,
        })

    mill_use = sum(profiles[id(m)].use for m in mills)
    mill_rows = [{"name": m["name"], "process": profiles[id(m)].process,
                  "metalUseTonnesPerMonth": round(profiles[id(m)].use),
                  "recycledNowPct": round(100 * profiles[id(m)].now, 1),
                  "limitPct": round(100 * profiles[id(m)].limit, 1),
                  "matchedTonnesPerMonth": round(matched.get(id(m), 0.0)),
                  "sourceName": PROCESS_SOURCES[profiles[id(m)].process][0],
                  "source": PROCESS_SOURCES[profiles[id(m)].process][1],
                  "url": PROCESS_SOURCES[profiles[id(m)].process][2]} for m in mills]
    bau = [round(100 * recycled(y, None)[0] / use, 1) for y in years]
    ceiling = round(100 * sum(profiles[id(m)].use * profiles[id(m)].limit for m in group) / use, 1)
    return {
        "metric": "Recycled share of the metal that SME manufacturers on ResourceX buy",
        "segment": "SME manufacturers (foundries and fabricators)",
        "buyers": len(group),
        "years": years,
        "businessAsUsualPct": bau,
        "scenarios": scenarios,
        "ceilingPct": ceiling,
        "metalInputTonnesPerMonth": round(use),
        "baselines": baselines,
        "mills": {"buyers": mill_rows, "metalUseTonnesPerMonth": round(mill_use),
                  "matchedTonnesPerMonth": round(sum(r["matchedTonnesPerMonth"] for r in mill_rows))},
        "assumptions": [
            f"Each buyer's total metal use, recycled share today and process limit come from its profile "
            f"(backend/data/buyer_profiles.csv), modelled from plant sizes and published process data; the "
            f"{len(group)} SME manufacturers use about {round(use):,} t of metal a month.",
            "Business as usual keeps each process where it is today.",
            "With ResourceX, matched scrap is extra recycled input: without the marketplace, those buyers would have "
            "bought new metal for that part of the job. This information-gap assumption is the main uncertainty.",
            "Matched scrap grows 10%, 25% or 40% a year as more producers list (scenarios, not data), and never "
            f"past each buyer's process limit (about {ceiling}% for this group).",
            f"The two steel mills ({round(mill_use):,} t of metal a month) already run at their process limits, so "
            "they are counted in tonnes, not in the share.",
            "The 15% COP31 goal covers all materials across the whole economy. Metals are already above it.",
        ],
    }
