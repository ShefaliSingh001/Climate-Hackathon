# Market research behind the dataset (October 2026)

The two `NSW_Steel_Scrap_*.xlsx` files keep the real company names, ABNs and NSW locations. Everything else
(materials, tonnages, grades, prices, budgets) is **modelled** from the figures below by
`backend/scripts/market_dataset.py`. These are estimates for each kind of business, not company data. The
certification tags (Cert A–E) stay fictional on purpose: we don't claim real companies hold real certificates.

## Prices

Exchange rate: **0.6957 USD per AUD** (2 Oct 2026; RBA 0.6933) — [Trading Economics](https://tradingeconomics.com/australia/currency), [RBA](https://www.rba.gov.au/statistics/frequency/exchange-rates.html).

| Reference | Value | Source |
| --- | --- | --- |
| LME copper (3-month) | US$14,259/t → A$20,500 | 3 Oct 2026, [LME](https://www.lme.com/metals/non-ferrous/lme-copper) |
| LME aluminium | US$3,119/t → A$4,480 | 1 Oct 2026, [LME](https://www.lme.com/metals/non-ferrous/lme-aluminium) |
| LME zinc | US$3,736/t → A$5,370 | 14 Aug 2026, [metalcharts](https://metalcharts.org/zinc-price-history) |
| Pig iron (what foundries buy instead of scrap) | US$475/t FOB → A$680 | Aug 2026, [GMK Center](https://gmk.center/en/news/prices-for-brazilian-pig-iron-stabilised-at-475-per-tonne-in-august/) |
| 304 stainless sheet | US$2,765/t → A$3,970 | Sep 2026, [Saky Steel](https://www.sakysteel.com/news/china-stainless-steel-market-price-update-september-9-2026) |
| New steel plate, Australia | A$1,800–2,400/t | 2026, [EzySteel](https://ezysteel.com.au/blogs/news/how-much-does-steel-plate-cost-in-2026) |
| Sydney scrap yard buying prices | copper $11–16/kg, brass $6–9/kg, aluminium $1.70–3/kg, stainless $0.90–3.80/kg | 2026 price guides, e.g. [North Shore Scrap Metals](https://northshorescrapmetals.com.au/blog/complete-scrap-metal-price-guide-sydney/), [ADL Metal](https://www.adlmetals.com.au/price-quote) |
| Heavy melting steel scrap, Australia | A$200–450/t | 2026, [West Coast Metals](https://www.westcoastmetals.com.au/ferrous-scrap-metal-prices-australia/) |
| Ferrous scrap export price | ~A$584/t (2024-25) | [IBISWorld](https://www.ibisworld.com/australia/bed/export-price-of-ferrous-scrap-metal/25063/) |
| Copper scrap vs LME | #1 96.5–98%; birch/cliff ~92% | 2026, [metalcharts](https://metalcharts.org/scrap-copper-prices) |
| Aluminium extrusion scrap vs LME | 70–85% (6063) | 2026, [metalcharts](https://metalcharts.org/scrap-aluminum-prices) |

**Listing prices** are delivered business-to-business prices, between yard buying prices and the new-metal price
(A$ per tonne):

| Metal | High quality | Medium quality | Short use |
| --- | --- | --- | --- |
| Steel | 470–520 | 400–450 | 300–360 |
| Stainless & alloys | 2,300–2,700 | 1,800–2,100 | 1,200–1,500 |
| Aluminium | 3,450–3,750 (77–84% LME) | 2,750–3,050 | 1,900–2,300 |
| Copper | 19,600–19,900 (96–97% LME) | 18,600–19,000 (~92%) | 12,500–14,000 (insulated cable) |
| Brass | 10,800–11,400 | 9,500–10,200 | 7,500–8,500 |

Brass metal value (63% copper, 37% zinc) is about A$14,900/t; yards pay $6–9/kg, so dealer-to-foundry prices sit
between. Fabricators reusing good offcuts pay up to about A$1,000/t (steel) and A$3,200/t (stainless): about half of
new plate, and below new 304 sheet.

## Tonnages

| Business | Monthly scrap or demand | Basis |
| --- | --- | --- |
| Steel fabricators | 4–22 t of offcuts | 3–5% of structural steel is offcuts; 8–15% when cutting from coil ([Tata Steel](https://digeca.tatasteel.com/blogs/how-to-reduce-steel-wastage-construction-manufacturing)); SME throughput 40–300 t a month |
| Plant process scrap | 25–450 t | Scaled to plant size (tube, plate, wire and coil lines) |
| InfraBuild Sydney Steel Mill | 62,000 t of metal; tender 4,000 t | 680,000 t a year from 100% recycled scrap, growing to 1 Mt by 2030 ([InfraBuild](https://www.infrabuild.com/media-releases/new-steel-facility-to-service-western-sydneys-50-billion-infrastructure-boom/)) |
| BlueScope Port Kembla | 250,000 t; tender 3,000 t | About 3 Mt a year; scrap 27.8% of charge in FY25 ([BlueScope](https://steel.com.au/resources/articles/recycled-content)) |
| Iron foundries | 150–450 t of charge | Charge is 40–60% pig iron, 20–45% steel scrap, 15–30% returns ([Archives of Foundry Engineering](https://journals.pan.pl//Content/127177/PDF/AFE%202_2023_10_final%20version.pdf)) |

Context: Australia exported **1.71 Mt** of ferrous scrap in 2022-23 while its steelmakers need **more than 500,000 t**
from interstate and overseas ([Mysteel](https://www.mysteel.net/news/5053247-australian-steel-industry-calls-for-banning-scrap-exports)).

## Who buys scrap

Only businesses that melt scrap or reuse offcuts are buyers: the two steel mills, the foundries and fabricators
reusing good offcuts. Makers that buy new coil, rod or billet (tube, wire, racking, water heaters, panels, packaging,
cable, transformers, extrusion) stay in the dataset as producers of process scrap, not as buyers. NSW has no copper
scrap buyer in the dataset and one small aluminium buyer, which matches reality: most of that scrap is exported or
sent interstate.

## Recycled share by process (2035 outlook)

| Process | Today | Limit | Source |
| --- | --- | --- | --- |
| Electric arc furnace mill | 100% | 100% | [InfraBuild](https://www.infrabuild.com/media-releases/new-steel-facility-to-service-western-sydneys-50-billion-infrastructure-boom/) |
| Blast furnace / basic oxygen | 27.8% | 30% | [BlueScope](https://steel.com.au/resources/articles/recycled-content); BOF charges ~25% scrap, up to ~29% ([Swinburne](https://figshare.swinburne.edu.au/articles/journal_contribution/Potential_for_Increased_Scrap_Melting_in_a_BOF/26255045)) |
| Iron foundry | 50% | 60% | [Archives of Foundry Engineering](https://journals.pan.pl//Content/127177/PDF/AFE%202_2023_10_final%20version.pdf) |
| Stainless and alloy foundry / fabricator | 48% | 85% | [worldstainless](https://worldstainless.org/news/global-life-cycle-of-stainless-steel) |
| Aluminium foundry | 80% (estimate) | 90% | [Chalmers](https://odr.chalmers.se/items/6d25397e-a96e-4330-9a08-af108cab42df) |
| Brass and bronze foundry | 91% | 96% | [USGS Minerals Yearbook](https://search.library.wisc.edu/digital/ALAGORVJYOGFX28A/text/ACOYWOTGXIR4WR8H) |
| Steel fabricator (new steel + reused offcuts) | 33% | 48% | [IEA](https://www.iea.org/reports/iron-and-steel-technology-roadmap), [BIR via GMK Center](https://gmk.center/en/news/global-scrap-consumption-in-2024-decreased-to-460-million-tons/) |

The steel mills already run at their process limits, so the dashboard's share covers the 43 SME manufacturers; the
mills are reported in tonnes.
