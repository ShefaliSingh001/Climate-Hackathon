"""Rewrite the modelled fields of the NSW dataset from October 2026 market research.

Company names, ABNs and NSW locations are untouched (they are real, from ABN Lookup, company websites and the
NPI). Everything else in the two spreadsheets was synthetic; this script replaces it with values modelled from
published market data, so prices, tonnages and buyers are realistic for each kind of business:

- Producers: monthly scrap or offcuts by business type (fabrication offcut rates, plant sizes) at market prices.
- Manufacturers: only businesses that actually use scrap or reusable offcuts stay buyers (steel mills, foundries,
  fabricators reusing offcuts). Makers that only buy new coil, rod or billet are removed from the demand side;
  they remain producers.
- backend/data/buyer_profiles.csv: each buyer's total metal use and recycled share today and at its process limit,
  used by the 2035 outlook.

Sources and reasoning: backend/data/MARKET_RESEARCH.md. Run from the repo root, then rebuild the database:
    python backend/scripts/market_dataset.py
    python backend/scripts/load_db.py
"""

import csv
import hashlib
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[2]
PRODUCERS_XLSX = next(ROOT.glob("NSW_Steel_Scrap_Producers*.xlsx"))
MANUFACTURERS_XLSX = next(ROOT.glob("NSW_Steel_Scrap_Manufacturers*.xlsx"))
PROFILES_CSV = ROOT / "backend" / "data" / "buyer_profiles.csv"

NOTE = ("Company, ABN and NSW location are authentic. Materials, quantities, grades, prices, budgets and timeframes "
        "are MODELLED from October 2026 market research (backend/data/MARKET_RESEARCH.md), not company data. "
        "Cert A-E are fictional demo tags.")

# Delivered business-to-business prices, A$ per tonne, October 2026 (MARKET_RESEARCH.md: LME at 0.6957 AUD/USD,
# Sydney yard buying prices, scrap discounts to LME). Each listing gets a price inside its band.
PRICE_BANDS = {
    "steel":     {"high": (470, 520), "medium": (400, 450), "short_use": (300, 360)},
    "alloys":    {"high": (2300, 2700), "medium": (1800, 2100), "short_use": (1200, 1500)},
    "aluminium": {"high": (3450, 3750), "medium": (2750, 3050), "short_use": (1900, 2300)},
    "copper":    {"high": (19600, 19900), "medium": (18600, 19000), "short_use": (12500, 14000)},
    "brass":     {"high": (10800, 11400), "medium": (9500, 10200), "short_use": (7500, 8500)},
}
LABELS = {"steel": "Steel", "alloys": "Alloys", "aluminium": "Aluminium", "copper": "Copper", "brass": "Brass"}
GRADE_LABELS = {"high": "High quality", "medium": "Medium quality", "short_use": "Short use"}

# Producers: (output material, what it is, tonnes a month, grade). Fabricators lose roughly 3-8% of the steel they
# cut as offcuts (more for laser skeletons); plant tonnages scale with plant size.
PRODUCERS = {
    # structural and general steel fabricators
    "Absolute Steel Fabrication & Welding": ("steel", "Plate and section offcuts", 8, "high"),
    "Agriweld Engineering": ("steel", "Plate and section offcuts", 9, "high"),
    "BJL Welding & Fabrication": ("steel", "Plate and section offcuts", 10, "high"),
    "BM Steel Fabrication": ("steel", "Plate and section offcuts", 9, "medium"),
    "CALGO Welding & Fabrication": ("steel", "Plate and section offcuts", 7, "high"),
    "Engineering Fabricators Newcastle": ("steel", "Structural section and plate offcuts", 18, "high"),
    "FBM Fabrication": ("steel", "Structural section and plate offcuts", 15, "high"),
    "Gordon Fabrication": ("steel", "Plate and section offcuts", 7, "high"),
    "Hard Bakka": ("steel", "Beam and section offcuts from beam processing", 20, "high"),
    "JMG Maintenance & Fabrication": ("steel", "Mixed fabrication and machining offcuts", 5, "medium"),
    "Kymar Steel Fabrications": ("steel", "Mixed fabrication and machining offcuts", 8, "medium"),
    "NewyFab": ("steel", "Plate and section offcuts", 6, "high"),
    "PLATINUM Fabrication & Engineering": ("steel", "Plate and section offcuts", 7, "high"),
    "Primmer Steel": ("steel", "Structural section and plate offcuts", 9, "high"),
    "Pro Steel Engineering & Fabrication": ("steel", "Mixed fabrication offcuts", 8, "medium"),
    "SCF Industries": ("steel", "Mixed fabrication offcuts", 9, "medium"),
    "DND Welding": ("steel", "Sheet, tube and section offcuts", 6, "medium"),
    "Wagga Engineering & Fabrication": ("steel", "Mixed fabrication and machining offcuts", 7, "medium"),
    "Alasco Engineering": ("steel", "Machining swarf and bar offcuts", 6, "short_use"),
    "Lotus Steel": ("steel", "Laser skeletons and machining offcuts", 9, "medium"),
    "Bright Balustrading": ("steel", "Tube and flat-bar offcuts", 4, "medium"),
    "ENCAT Australia": ("steel", "Mesh, tube and bar offcuts", 10, "short_use"),
    "Picton Bros Panelspan": ("steel", "Coated sheet trim", 8, "short_use"),
    # laser and sheetmetal cutters (skeleton scrap)
    "Academy Sheetmetal": ("steel", "Laser-cut sheet skeletons and offcuts", 12, "medium"),
    "Apex Laser": ("steel", "Thin sheet skeletons from switchboard work", 12, "short_use"),
    "Alumac Industries": ("steel", "Laser-cut plate skeletons", 14, "medium"),
    "Laser Wizard": ("steel", "Laser-cut plate skeletons", 16, "medium"),
    "Letchford Engineering": ("steel", "Laser-cut plate and spring steel skeletons", 14, "medium"),
    "OMP Laser and Sheetmetal": ("steel", "Laser-cut sheet skeletons", 13, "medium"),
    "Tusken Engineering": ("steel", "Plate skeletons and burn-outs", 22, "high"),
    # stainless fabricators
    "Enfrex Metalworks": ("alloys", "Stainless sheet and tube offcuts", 2, "medium"),
    "Fabcon Project Group": ("alloys", "Stainless sheet skeletons and offcuts", 3, "high"),
    "ISG Sheetmetal and Laser": ("alloys", "Stainless sheet skeletons and offcuts", 4, "high"),
    "Sidney & Hacking": ("alloys", "Stainless sheet offcuts (304)", 3, "high"),
    "Silver Raven": ("alloys", "Stainless offcuts", 2, "medium"),
    # foundries: surplus returns they don't remelt themselves
    "Austral Alloys": ("alloys", "Stainless casting returns and risers", 6, "medium"),
    "Hycast Metals": ("alloys", "Investment casting returns", 4, "medium"),
    "WEIR MINERALS AUSTRALIA LTD": ("alloys", "High-chrome iron and alloy casting returns", 12, "medium"),
    "Camcast": ("brass", "Brass and bronze casting returns", 3, "high"),
    "Clingcast Metals": ("brass", "Brass and copper-alloy returns", 6, "medium"),
    # manufacturers' process scrap
    "Austube Mills": ("steel", "Tube offcuts and coil ends", 450, "high"),
    "BEKAERT WIRE ROPES PTY LTD": ("steel", "Wire and rope offcuts", 25, "medium"),
    "BISALLOY STEELS PTY LTD": ("steel", "Quenched and tempered plate burn-outs and offcuts", 220, "high"),
    "BLUESCOPE STEEL LIMITED": ("steel", "Pickled coil trim and head/tail ends", 300, "high"),
    "DEMATIC PTY LTD": ("steel", "Racking section offcuts and punchings", 35, "medium"),
    "Dux Hot Water": ("steel", "Cylinder sheet trim and rejects", 45, "medium"),
    "INFRABUILD (NEWCASTLE) PTY LTD": ("steel", "Rod mill crop ends and cobbles", 350, "medium"),
    "INFRABUILD WIRE PTY LTD": ("steel", "Wire and spring offcuts", 40, "medium"),
    "InfraBuild Reinforcing": ("steel", "Reinforcing bar offcuts", 120, "medium"),
    "KINGSPAN INSULATED PANELS PTY LIMITED": ("steel", "Coated coil trim and panel rejects", 40, "short_use"),
    "NCI HOLDINGS PTY LTD": ("steel", "Tinplate skeletons and trim", 80, "short_use"),
    "OVERALL FORGE PTY LTD": ("steel", "Forging flash, crop ends and turnings", 70, "short_use"),
    "RHEEM AUSTRALIA PTY LTD": ("steel", "Cylinder sheet trim and rejects", 90, "medium"),
    "VIP STEEL PACKAGING PTY LTD": ("steel", "Drum and pail sheet trim", 50, "short_use"),
    "Capral": ("aluminium", "6063 extrusion butts, crop ends and profile rejects", 180, "high"),
    "Prysmian Australia": ("copper", "Copper conductor drawing scrap and cable trim", 45, "high"),
    "Tyree Transformers": ("copper", "Winding wire and strip offcuts", 4, "high"),
    # scrap recyclers (sorted, aggregated loads)
    "ADL Metal": ("aluminium", "Sorted aluminium extrusion and sheet scrap", 90, "medium"),
    "North Shore Scrap Metals": ("aluminium", "Mixed aluminium (sheet, frames, cans)", 40, "short_use"),
    "Sell & Parker": ("brass", "Sorted yellow brass fittings and valves", 40, "high"),
    "NSW Copper Recycling": ("copper", "Bright and #2 copper wire and pipe", 35, "high"),
    "Total Scrap Metals Recycling": ("copper", "Copper pipe and stripped cable", 25, "medium"),
    "Urban Copper Recycling": ("copper", "Insulated copper cable", 18, "short_use"),
}

# Buyers kept on the demand side: (material, what they make, tender t/month, grade accepted, max A$/t,
# profile). Profile = (process, total metal use t/month, recycled share now, process limit).
STEEL_REUSE_MAX = 1000  # about half of new plate (A$1,800-2,400/t), for reusable plate and section offcuts
STAINLESS_REUSE_MAX = 3200  # below new 304 sheet (about A$4,000/t)
EAF = ("Electric arc furnace steel mill", 1.00, 1.00)
BOF = ("Blast furnace / basic oxygen steelworks", 0.278, 0.30)
IRON_FOUNDRY = ("Iron foundry", 0.50, 0.60)
ALLOY_FOUNDRY = ("Stainless and alloy foundry", 0.48, 0.85)
ALUMINIUM_FOUNDRY = ("Aluminium foundry", 0.80, 0.90)
BRASS_FOUNDRY = ("Brass and bronze foundry", 0.91, 0.96)
FABRICATOR = ("Steel fabricator (reusing offcuts)", 0.33, 0.48)
STAINLESS_FABRICATOR = ("Stainless fabricator (reusing offcuts)", 0.48, 0.85)


def fab(use, tender, product="Brackets, plates and small parts cut from reusable offcuts"):
    return ("steel", product, tender, "high", STEEL_REUSE_MAX, (FABRICATOR, use))


def ss_fab(use, tender):
    return ("alloys", "Stainless brackets and small parts cut from reusable offcuts", tender, "high",
            STAINLESS_REUSE_MAX, (STAINLESS_FABRICATOR, use))


BUYERS = {
    "InfraBuild Sydney Steel Mill": ("steel", "Billets for reinforcing and merchant bar (electric arc furnace)",
                                     4000, "short_use", 520, (EAF, 62000)),
    "BlueScope Port Kembla Steelworks": ("steel", "Slab and flat steel (blast furnace / basic oxygen)",
                                         3000, "medium", 500, (BOF, 250000)),
    "Ajax Foundry": ("steel", "Grey and ductile iron castings", 180, "medium", 470, (IRON_FOUNDRY, 450)),
    "The Wagga Iron Foundry": ("steel", "Cast iron components", 60, "medium", 460, (IRON_FOUNDRY, 150)),
    "WEIR MINERALS AUSTRALIA LTD": ("alloys", "High-chrome iron and alloy pump castings", 60, "medium", 2150,
                                    (ALLOY_FOUNDRY, 400)),
    "Austral Alloys": ("alloys", "Stainless steel pump and valve castings", 40, "medium", 2150, (ALLOY_FOUNDRY, 120)),
    "Hycast Metals": ("alloys", "Carbon, alloy and stainless investment castings", 25, "medium", 2100,
                      (ALLOY_FOUNDRY, 70)),
    "Camcast": ("aluminium", "Aluminium sand and gravity castings", 25, "medium", 3100, (ALUMINIUM_FOUNDRY, 40)),
    "Clingcast Metals": ("brass", "Brass and bronze ingots and castings", 30, "medium", 11200, (BRASS_FOUNDRY, 40)),
    "Absolute Steel Fabrication & Welding": fab(120, 6),
    "Academy Sheetmetal": fab(80, 4),
    "Agriweld Engineering": fab(90, 5),
    "Alasco Engineering": fab(60, 3),
    "Alumac Industries": fab(120, 6),
    "Apex Laser": fab(60, 3),
    "BJL Welding & Fabrication": fab(150, 8),
    "BM Steel Fabrication": fab(110, 5),
    "Bright Balustrading": fab(40, 2),
    "CALGO Welding & Fabrication": fab(90, 4),
    "DND Welding": fab(70, 4),
    "ENCAT Australia": fab(130, 6),
    "Engineering Fabricators Newcastle": fab(250, 12),
    "Enfrex Metalworks": fab(70, 3),
    "Fabcon Project Group": fab(150, 7),
    "FBM Fabrication": fab(220, 10),
    "Gordon Fabrication": fab(80, 4),
    "Hard Bakka": fab(300, 15),
    "JMG Maintenance & Fabrication": fab(50, 3),
    "Kymar Steel Fabrications": fab(90, 4),
    "Laser Wizard": fab(160, 8),
    "Letchford Engineering": fab(140, 7),
    "Lotus Steel": fab(90, 4),
    "NewyFab": fab(70, 4),
    "OMP Laser and Sheetmetal": fab(130, 6),
    "OVERALL FORGE PTY LTD": fab(400, 20, "Forgings from reusable bar and billet offcuts"),
    "PLATINUM Fabrication & Engineering": fab(90, 5),
    "Picton Bros Panelspan": fab(120, 5),
    "Primmer Steel": fab(100, 5),
    "Pro Steel Engineering & Fabrication": fab(80, 4),
    "SCF Industries": fab(100, 5),
    "Tusken Engineering": fab(200, 10),
    "Wagga Engineering & Fabrication": fab(70, 3),
    "ISG Sheetmetal and Laser": ss_fab(30, 2),
    "Sidney & Hacking": ss_fab(40, 2),
    "Silver Raven": ss_fab(25, 1),
}

# Makers that buy new coil, rod or billet rather than scrap: removed from the demand side (they stay producers).
NOT_SCRAP_BUYERS = {
    "Austube Mills", "BEKAERT WIRE ROPES PTY LTD", "BISALLOY STEELS PTY LTD", "BLUESCOPE STEEL LIMITED",
    "DEMATIC PTY LTD", "Dux Hot Water", "INFRABUILD (NEWCASTLE) PTY LTD", "INFRABUILD WIRE PTY LTD",
    "InfraBuild Reinforcing", "KINGSPAN INSULATED PANELS PTY LIMITED", "NCI HOLDINGS PTY LTD",
    "RHEEM AUSTRALIA PTY LTD", "VIP STEEL PACKAGING PTY LTD", "Capral", "Prysmian Australia", "Tyree Transformers",
}


def price(abn: str, material: str, grade: str) -> int:
    """A deterministic price inside the band, so re-running gives the same dataset."""
    low, high = PRICE_BANDS[material][grade]
    frac = int(hashlib.sha256(abn.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
    return int(round((low + frac * (high - low)) / 10) * 10)


def header(ws):
    for r in range(1, 12):
        if ws.cell(r, 2).value == "ABN":
            return r, {ws.cell(r, c).value: c for c in range(1, ws.max_column + 1) if ws.cell(r, c).value}
    raise ValueError(f"No header row in {ws.title}")


def update_producers() -> int:
    wb = openpyxl.load_workbook(PRODUCERS_XLSX)
    ws = wb["Producers"]
    hr, col = header(ws)
    seen = set()
    for r in range(hr + 1, ws.max_row + 1):
        name = ws.cell(r, col["Company / business"]).value
        if not name:
            continue
        material, what, tonnes, grade = PRODUCERS[name]
        abn = str(ws.cell(r, col["ABN"]).value)
        ws.cell(r, col["Input materials"]).value = what
        ws.cell(r, col["Output material"]).value = LABELS[material]
        ws.cell(r, col["Output quantity (tonnes)"]).value = tonnes
        ws.cell(r, col["Output grade"]).value = GRADE_LABELS[grade]
        ws.cell(r, col["Pricing (AUD/tonne)"]).value = price(abn, material, grade)
        seen.add(name)
    missing = set(PRODUCERS) - seen
    assert not missing, f"Producers in the table but not the sheet: {missing}"
    ws.cell(2, 1).value = NOTE
    wb.save(PRODUCERS_XLSX)
    return len(seen)


def update_manufacturers() -> list[dict]:
    wb = openpyxl.load_workbook(MANUFACTURERS_XLSX)
    ws, src = wb["Manufacturers"], wb["Sources"]
    hr, col = header(ws)
    shr, scol = header(src)
    profiles, drop_rows, seen = [], [], set()
    for r in range(hr + 1, ws.max_row + 1):
        name = ws.cell(r, col["Company / business"]).value
        if not name:
            continue
        if name in NOT_SCRAP_BUYERS:
            drop_rows.append(r)
            continue
        material, product, tender, grade, max_price, ((process, now, limit), use) = BUYERS[name]
        abn = str(ws.cell(r, col["ABN"]).value)
        ws.cell(r, col["Required material"]).value = LABELS[material]
        ws.cell(r, col["Making with material"]).value = product
        ws.cell(r, col["Required quantity (tonnes)"]).value = tender
        ws.cell(r, col["Manufacturer budget (AUD)"]).value = tender * max_price  # a value, not the old formula
        ws.cell(r, col["Output grade"]).value = GRADE_LABELS[grade]
        segment = "Steel mill" if (process, now, limit) in (EAF, BOF) else "SME manufacturer"
        profiles.append({"abn": abn, "name": name, "segment": segment, "process": process,
                         "metal_use_t_per_month": use, "recycled_share_now": now, "recycled_share_limit": limit})
        seen.add(name)
    missing = set(BUYERS) - seen
    assert not missing, f"Buyers in the table but not the sheet: {missing}"

    # Remove the dropped buyers from both sheets (bottom up so row numbers stay valid).
    dropped_abns = {str(ws.cell(r, col["ABN"]).value) for r in drop_rows}
    for r in sorted(drop_rows, reverse=True):
        ws.delete_rows(r)
    for r in range(src.max_row, shr, -1):
        if str(src.cell(r, scol["ABN"]).value) in dropped_abns:
            src.delete_rows(r)
    rate_col = scol.get("Synthetic budget rate (AUD/tonne)")
    if rate_col:
        src.cell(shr, rate_col).value = "Modelled budget rate (AUD/tonne)"
        by_abn = {p["abn"]: BUYERS[p["name"]][4] for p in profiles}
        for r in range(shr + 1, src.max_row + 1):
            abn = str(src.cell(r, scol["ABN"]).value)
            if abn in by_abn:
                src.cell(r, rate_col).value = by_abn[abn]
    ws.cell(2, 1).value = NOTE
    wb.save(MANUFACTURERS_XLSX)
    return profiles


def main() -> None:
    n = update_producers()
    profiles = update_manufacturers()
    PROFILES_CSV.parent.mkdir(parents=True, exist_ok=True)
    with PROFILES_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(profiles[0]))
        w.writeheader()
        w.writerows(profiles)
    print(f"Updated {n} producers and {len(profiles)} buyers; wrote {PROFILES_CSV.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
