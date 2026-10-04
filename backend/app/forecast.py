"""2035 outlook: the recycled share of metal input for manufacturers on ResourceX, with and without the marketplace.

Each tender in the dataset only covers the recycled part of a project. We assume each manufacturer currently uses
its industry's average recycled share, so its total metal input is tender / share. Business as usual follows each
industry's own outlook. With ResourceX, the scrap the marketplace matches is added on top: the information-gap
assumption is that without the marketplace those buyers would have bought new metal for that part of the job.
Matched supply then grows each year as more producers list, but never past the highest recycled share there is
credible evidence for.

The 15% COP31 goal is for the whole economy (all materials); metals are already above it. The outlook shows how far
above it manufacturers can go, not a change in the global rate.
"""

from dataclasses import dataclass

from .impact import EMISSION_FACTORS, Trade

BASE_YEAR, END_YEAR = 2026, 2035


@dataclass(frozen=True)
class RecycledShare:
    now: float  # share of metal input that is recycled today
    in_2050: float | None  # where the industry itself expects to be in 2050 (None: no growth expected)
    ceiling: float  # highest share with credible evidence; the marketplace can't push past it
    source_name: str  # short label shown on the dashboard
    source: str
    url: str


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
        "https://international-aluminium.org/post-consumer-aluminium-scrap-tops-20-million-tonnes-for-the-first-time/",
    ),
    "copper": RecycledShare(
        0.32, None, 0.50, "ICA, UCL",
        "International Copper Association: 32% of copper demand is met by recycled copper; UCL finds the secondary "
        "share reaches about 50% by 2050 only in the most optimistic scenario",
        "https://internationalcopper.org/sustainable-copper/circular-economy/",
    ),
    "brass": RecycledShare(
        0.32, None, 0.50, "ICA (copper as proxy)",
        "Proxy: copper figures (brass is mostly copper). No brass-specific source yet",
        "https://internationalcopper.org/sustainable-copper/circular-economy/",
    ),
    "alloys": RecycledShare(
        0.48, None, 0.85, "worldstainless",
        "worldstainless (KIT study): global stainless steel recycled content was 48% in 2019; Europe already reaches 85%",
        "https://worldstainless.org/news/global-life-cycle-of-stainless-steel",
    ),
}

# How fast the scrap matched on ResourceX grows each year as more producers list. These are scenarios, not data.
SCENARIOS = [
    ("conservative", "Conservative", 0.10),
    ("expected", "Expected", 0.25),
    ("ambitious", "Ambitious", 0.40),
]


def bau_share(material: str, year: int) -> float:
    """Business-as-usual recycled share: linear from today to the industry's own 2050 outlook, or flat."""
    s = RECYCLED_SHARE[material]
    if s.in_2050 is None:
        return s.now
    return s.now + (s.in_2050 - s.now) * (year - BASE_YEAR) / (2050 - BASE_YEAR)


def outlook(trades: list[Trade], manufacturers: list[dict], transport_t_per_t: float) -> dict:
    """Year-by-year recycled share, business as usual vs each ResourceX scenario. Flows are per month."""
    materials = sorted({m["required_material"] for m in manufacturers})
    tender = {k: sum(m["required_quantity_t"] for m in manufacturers if m["required_material"] == k) for k in materials}
    total_input = {k: tender[k] / RECYCLED_SHARE[k].now for k in materials}
    matched = {k: sum(t.tonnes for t in trades if t.material == k) for k in materials}
    all_input = sum(total_input.values())
    years = list(range(BASE_YEAR, END_YEAR + 1))

    def headroom(k: str, year: int) -> float:
        return total_input[k] * max(0.0, RECYCLED_SHARE[k].ceiling - bau_share(k, year))

    bau_recycled = {y: sum(bau_share(k, y) * total_input[k] for k in materials) for y in years}
    scenarios = []
    for key, label, growth in SCENARIOS:
        extra = {y: {k: min(matched[k] * (1 + growth) ** (y - BASE_YEAR), headroom(k, y)) for k in materials}
                 for y in years}
        co2e = sum(
            12 * extra[y][k] * (EMISSION_FACTORS[k].tco2e_per_t - transport_t_per_t)
            for y in years for k in materials
        )
        scenarios.append({
            "key": key,
            "label": label,
            "growthPct": round(growth * 100),
            "sharePct": [round(100 * (bau_recycled[y] + sum(extra[y].values())) / all_input, 1) for y in years],
            "extraTonnesPerYear2035": round(12 * sum(extra[END_YEAR].values())),
            "co2eAvoidedT": round(co2e),
        })

    bau = [round(100 * bau_recycled[y] / all_input, 1) for y in years]
    ceiling = round(100 * sum(RECYCLED_SHARE[k].ceiling * total_input[k] for k in materials) / all_input, 1)
    return {
        "metric": "Recycled share of metal input for manufacturers on ResourceX",
        "years": years,
        "businessAsUsualPct": bau,
        "scenarios": scenarios,
        "ceilingPct": ceiling,
        "metalInputTonnesPerMonth": round(all_input),
        "baselines": [
            {
                "material": k,
                "mixPct": round(100 * total_input[k] / all_input, 1),
                "inputTonnesPerMonth": round(total_input[k]),
                "nowPct": round(RECYCLED_SHARE[k].now * 100, 1),
                "bau2035Pct": round(bau_share(k, END_YEAR) * 100, 1),
                "ceilingPct": round(RECYCLED_SHARE[k].ceiling * 100, 1),
                "sourceName": RECYCLED_SHARE[k].source_name,
                "source": RECYCLED_SHARE[k].source,
                "url": RECYCLED_SHARE[k].url,
            }
            for k in sorted(materials, key=lambda k: -total_input[k])
        ],
        "assumptions": [
            "Each tender covers only the recycled part of a project; with the industry's average recycled share, "
            f"the {len(manufacturers)} manufacturers use about {round(all_input):,} t of metal a month in total.",
            "Business as usual follows each industry's own outlook (only aluminium is expected to rise).",
            "With ResourceX, matched scrap is extra recycled input: without the marketplace, those buyers would have "
            "bought new metal for that part of the job. This information-gap assumption is the main uncertainty.",
            "Matched scrap grows 10%, 25% or 40% a year as more producers list (scenarios, not data), and never "
            f"past each metal's evidence-based ceiling (about {ceiling}% for this mix).",
            "The 15% COP31 goal covers all materials across the whole economy. Metals are already above it; this "
            "shows how much further manufacturers can go, not a change in the global rate.",
        ],
    }
