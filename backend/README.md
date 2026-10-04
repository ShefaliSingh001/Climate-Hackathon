# ResourceX backend

FastAPI server that serves `frontend/API_CONTRACT.md` plus accounts (`/auth/*`, see [`FRONTEND_HANDOFF.md`](FRONTEND_HANDOFF.md)). Matching uses the tender
matching model in `API/scrap_model_api.py`.

**Database:** on Vercel it uses **Neon Postgres** (whenever `DATABASE_URL` is set); locally it uses the committed
**SQLite** file `backend/db/circulink.db`. Both engines have the same tables. To put it online, see
[`DEPLOY.md`](DEPLOY.md).

## Run it

From the repo root:

```bash
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload --port 8000     # API docs at http://localhost:8000/docs
```

Then point the frontend at it: in `frontend/.env.local` set `VITE_API_URL=http://localhost:8000` and run
`npm run dev` in `frontend/`. To work against Neon locally instead of SQLite, also set `DATABASE_URL`.

Tests: `pytest backend/tests`. Every test runs twice: on a temporary copy of the SQLite file, and on an empty
embedded Postgres (`pgserver`) that seeds itself the way Neon does on first deploy.

| Path | What it does |
| --- | --- |
| `app/main.py` | endpoints, request validation, `{ "error": ... }` responses, CORS (`CORS_ORIGINS`, default `http://localhost:5173`) |
| `app/listings.py` | database rows → `Listing` (producers → `p<id>` supply, manufacturers → `m<id>` demand) |
| `app/matching.py` | adapter to the matching model: builds its tender and producers, maps its plans back |
| `app/db.py` | database adapter: Postgres when `DATABASE_URL` is set, else SQLite (`CIRCULINK_DB` overrides the path). Applies the schema on first connect and seeds an empty Postgres from the SQLite file |
| `app/auth.py` | passwords (PBKDF2-SHA256), sessions (bearer tokens, only their hash stored) |
| `db/schema.sql`, `db/schema.postgres.sql` | the same tables for each engine; keep them in step |
| `scripts/sync_postgres.py` | push updated spreadsheet data to Neon (users' rows are kept) |
| `../app.py`, `../requirements.txt` | Vercel entrypoint and runtime dependencies |

## Matching

`API/scrap_model_api.py` (the team's model, unchanged) does the matching:

- **Eligibility:** a producer qualifies for a request only if the material and grade match exactly, it holds every
  required certification, and its supply period overlaps the delivery window. The window defaults to next calendar
  month; the dataset covers November 2026.
- **Combined orders** (`POST /orders/plan`): an exact optimiser (mixed-integer linear program). It finds the cheapest
  split, or the one with the fewest suppliers, that delivers exactly the requested tonnes within the material budget
  and up to `maxPartners`. It returns up to 3 alternatives with different supplier sets. With no possible split, it
  says why (e.g. not enough compatible stock, and the shortfall).
- **Ranked suppliers** (`POST /matches`): every same-material producer, model-eligible ones first. Each gets a
  0–100 score:
  - Weights: material 30%, distance 25%, price against the buyer's ceiling 20%, reliability (ABN verified plus
    certifications) 15%, volume 10%.
  - Ineligible producers score 0 and show the model's reason.
  - `inBestPlan` marks producers in the model's cheapest combination.
- **Card scores** (`matchScore` on `GET /listings`), personal when signed in:
  - **Buyer with a registered requirement:** supply is scored by the model against that requirement (material,
    grade, tonnes, budget, timeframe). Ineligible suppliers drop to 40% of their baseline; other materials to 50%.
  - **Seller:** each buyer request (tender) is checked with the model's producer mode, with the seller's own
    listing fixed as the anchor. "Can you plus partners fill it within budget?" scores higher than "you qualify, but
    no complete order is possible". Requests the seller doesn't qualify for (grade, dates) drop to 40%, and other
    materials to 50%.
  - **Anyone else:** distance, price, reliability and volume, with no specific requirement.

Every producer and manufacturer in the database takes part, including ones that registered a minute ago.

Not modelled: transport cost (the UI estimates freight separately), tax, and reserving stock across several
tenders. "Any grade" passes every producer to the model with the same grade, so the grade check is skipped.

## Impact dashboard

`GET /impact` and `POST /impact/report` power the website's Impact page. Code: `app/impact.py` (this month),
`app/forecast.py` (2035 outlook), `app/report.py` (AI report). Both read the producers and manufacturers tables, so
new sign-ups count straight away. Only metals have sourced factors so far; other materials are left out and the
response says how many.

**This month.** There are no recorded trades yet, so `allocate()` projects them: tenders are filled in order-by date
order from the cheapest eligible offers (same material, at least the requested grade, price within budget per tonne,
not the buyer's own scrap) until supply runs out. Replace it with real trades or accepted matches later.

| Measure | How | Source |
| --- | --- | --- |
| CO2e avoided | tonnes × material factor − trucking | steel 1.5 t/t (worldsteel), aluminium 14.6 (IAI 2022), copper 3.2 (ICA 2019 vs Aurubis recycled cathode), stainless/alloys 4.3 (Fraunhofer via worldstainless), brass 3.2 (copper as a proxy) |
| Trucking | tonnes × road km × 0.0755 kg CO2e/t-km; road km = straight line × 1.25 | UK DESNZ 2024, articulated HGV, average laden |
| Landfill avoided | tonnes × 13% | National Waste Report 2022: 87% of metal waste is recovered |
| Money saved | (buyer's budget per tonne − price) × tonnes | marketplace data |

**2035 outlook: recycled vs virgin metal.**

- Each tender only covers the recycled part of a project. Assuming each manufacturer uses its industry's world
  average recycled share today, its total metal use is tender ÷ share (about 63,000 tonnes a month for the 61).
- Today and business as usual: steel 33% flat (IEA; BIR agrees once its 76% coverage is allowed for, and shows scrap
  use flat since 2020), aluminium 29% rising to 50% by 2050 (IAI), copper 32% flat (ICA), brass as copper,
  stainless 48% flat (worldstainless). Weighted by our mix: **32.9% today, 33.6% in 2035**.
- With ResourceX: this month's matched scrap counts as extra recycled input (the information-gap assumption: without
  the marketplace those buyers would have bought new metal). It grows 10%, 25% or 40% a year as more producers list,
  never past each metal's evidence ceiling: steel 48% (IEA net-zero 2050), aluminium 50% (IAI), copper and brass 50%
  (UCL's most optimistic 2050 case), stainless 85% (Europe today). **48.9% in 2035** in the expected case
  (45.7–48.9% across scenarios), so virgin metal falls from 66% to 51%.
- COP31's 15% goal covers all materials across the whole economy (6.9% today). Metals are already above it, so the
  dashboard shows it only as context.

**AI report.** Claude (`claude-opus-5-5`) writes the report from the `/impact` numbers only, with structured JSON
output and the server-side refusal fallback. It needs `ANTHROPIC_API_KEY` (Vercel environment variable, or
`backend/.env` locally); without it, or if the call fails, a template report built from the same numbers is returned.
One report is cached per set of numbers; `?refresh=true` writes a new one.

## Accounts

`POST /auth/signup` creates, in one transaction:
- the business: a `producers` row for a seller, or a `manufacturers` row for a buyer, with `is_synthetic = 0` and
  `geo_source = 'user'`;
- its login: an `accounts` row, with the password hashed.

It returns a session token. Logins work from any device: `POST /auth/login`. With the token, `POST /listings`
takes the business name, ABN and side from the account, and quote requests record who sent them. Without a token
both still work as before (the body must name the business). That's what the current website does until it adopts
`/auth/*`; see [`FRONTEND_HANDOFF.md`](FRONTEND_HANDOFF.md) for the endpoints and the frontend changes.

| Table | One row is |
| --- | --- |
| `accounts` | a login: email (unique, lower-case), password hash, name, company, ABN, role (`buyer`/`seller`), site, and the `producer_id` or `manufacturer_id` it registered with |
| `sessions` | a logged-in device: SHA-256 of the token, account, expiry (30 days) |

Running the app locally writes to `backend/db/circulink.db`; don't commit test sign-ups.

## Orders and collaborations

`app/trade.py`, tables `orders`, `collaborations`, `collaboration_members`. Endpoints need a login (`Authorization: Bearer`):

| Endpoint | What it does |
| --- | --- |
| `GET /orders` | The account's orders (as buyer or seller), newest first. Matched on ABN, because both parties are copied onto the order |
| `POST /listings/{id}/enquiries` | Unchanged response. When signed in it also records a `pending` order: buyer → supply listing, or seller → buyer request |
| `GET /collaborations` | Sellers: teams they lead or were invited to |
| `POST /collaborations` | Start a team on a buyer request (`m…`) with supply listings (`p…`) of the same material. The caller leads; the others are `invited` |
| `POST /collaborations/{id}/respond` | An invited member accepts or declines |
| `POST /collaborations/{id}/offer` | The lead sends the joint offer once nobody is still `invited`; it becomes a `pending` order with `partners` |
| `POST /collaborations/{id}/withdraw` | The lead cancels a team that hasn't sent its offer |

- Freight on an order uses the frontend's truck rates (`TRUCKS` in `trade.py` = `frontend/src/lib/logistics.ts`); CO2e avoided uses the `impact.py` factors minus trucking.
- Order status is `pending`, `confirmed`, `in_transit`, `delivered` or `cancelled`. Nothing moves an order past `pending` yet (no confirm or delivery endpoint); add one when real trades start.
- **Demo data:** the first connection seeds about 18 months of orders for the two demo accounts (counterparts are dataset businesses) and two collaboration invites for the demo seller, all `is_synthetic`. No listings are added, so the dataset stays at 63 producers and 61 manufacturers.
- **Verified** (`verified` on listings) means the business has an ABN on file. **Address and postcode** from the website's address search are saved on producers and manufacturers rows and returned on listings.

## Database files

The database is committed as `backend/db/circulink.db`, already loaded, so you can open it straight away. The
commands above rebuild it from `backend/db/schema.sql` and the two spreadsheets in the repo root; run them after the
spreadsheets or schema change, then commit the updated `.db`. No account, server or keys needed. Neon is seeded
from this file on first deploy; after that, push changes with `scripts/sync_postgres.py`.

Open it with any SQLite tool, e.g. `sqlite3 backend/db/circulink.db` or [DB Browser for SQLite](https://sqlitebrowser.org/).

## Database

Two tables, one per side of the market, plus two small lookup tables:

| Table | Side | One row is |
| --- | --- | --- |
| `producers` | supply | a business offering recycled material for a period |
| `manufacturers` | demand | a business's tender for recycled material |
| `materials` | reference | a material both sides can trade (`steel`, `aluminium`, `copper`, `brass`, `alloys`, plus `plastics`, `paper`, `glass`, `ewaste` for later) |
| `grades` | reference | `short_use` (rank 1) < `medium` (2) < `high` (3) |

The same business (same ABN) can appear in both tables.

### `producers`

| Form field | Column | Type / rule |
| --- | --- | --- |
| Name | `name` | text |
| ABN | `abn` | 11 digits, no spaces |
| | `legal_entity`, `activity` | registered name on ABN Lookup and the business's published activity (from the dataset's Sources sheet) |
| Location | `locality`, `address`, `postcode`, `state`, `lat`, `lng` | `state` defaults to `NSW`; `lat`/`lng` optional for now |
| Material focus | `material_focus` | free text, optional (not in the dataset) |
| Input | `input_materials` | text, e.g. "Steel plate, sheet and coil" |
| Web | `website` | text, optional |
| Output material | `output_material` | key from `materials` |
| Output quantity | `output_quantity_t` | tonnes, > 0 |
| Output grade | `output_grade` | key from `grades` |
| Compliance | `compliance` | JSON array text, e.g. `["Cert A", "Cert C"]` |
| Pricing | `price_aud_per_t` | AUD per tonne, excl. GST and transport |
| | `supply_start`, `supply_end` | dates the quantity covers |

### `manufacturers`

| Form field | Column | Type / rule |
| --- | --- | --- |
| Name, ABN, Location, Web | same as producers, including `legal_entity` and `activity` | |
| Required material | `required_material` | key from `materials` |
| | `product` | what they make with it, optional |
| Required quantity | `required_quantity_t` | tonnes, > 0 |
| Budget | `budget_aud` | total AUD for the tender |
| | `max_price_aud_per_t` | **computed**: `budget_aud / required_quantity_t` |
| Timeframe | `order_by`, `deliver_by` | dates; `deliver_by` must not be before `order_by` |
| Output grade request | `output_grade_request` | key from `grades` |
| | `purchase_start`, `purchase_end` | purchase window |

Both tables also have `id` (integer), `geo_source` (`npi` = published facility coordinates, `locality` = suburb
centre, `user` = picked on the map), `is_synthetic` (0/1), `created_at` and `updated_at` (kept current by a trigger).

`enquiries` holds quote requests: one listing (`producer_id` or `manufacturer_id`), tonnes per month, first delivery and
a message.
Dates are ISO text (`2026-11-01`), timestamps UTC text (`2026-10-03T07:09:01Z`).

**Grades are ranked**, so matching joins on `grades.rank` to find offers at least as good as requested:

```sql
select m.name as manufacturer, p.name as producer, p.price_aud_per_t, m.max_price_aud_per_t
from manufacturers m
join grades gm on gm.key = m.output_grade_request
join producers p on p.output_material = m.required_material
join grades gp on gp.key = p.output_grade and gp.rank >= gm.rank
where p.price_aud_per_t <= m.max_price_aud_per_t;
```

**Foreign keys:** SQLite only enforces them when a connection runs `pragma foreign_keys = on`. Do that on every
connection the API opens, or invalid materials and grades get through.

## Dataset

The loader reads the two spreadsheets in the repo root (`NSW_Steel_Scrap_Producers*.xlsx`,
`NSW_Steel_Scrap_Manufacturers*.xlsx`): 63 producers and 61 manufacturers. Company names, ABNs and NSW locations are
real; materials, quantities, compliance (Cert A–E), grades, prices, budgets and timeframes are **synthetic demo
data**, and every loaded row has `is_synthetic = 1`.

Each spreadsheet also has a **Sources** sheet with the ABN Lookup and website links behind every business. The loader
takes the legal entity, published activity and, where the business is an NPI-listed facility, its coordinates
(17 producers and 19 manufacturers) from there.

After the spreadsheets change, re-run `python backend/scripts/load_db.py`. It only replaces `is_synthetic` rows, so
data entered through the app is kept. Other spreadsheets: `--producers path.xlsx --manufacturers path.xlsx`.

**Coordinates:** NPI facilities (17 producers, 19 manufacturers) use their published coordinates. Everyone else gets
the suburb centre from `backend/data/locality_coords.csv`. Regenerate that file with
`python backend/scripts/geocode_localities.py` (needs internet) when the spreadsheets add new suburbs. It comes from
the community dataset at https://github.com/matthewproctor/australianpostcodes; only the localities we use are kept.

## Open items

- **Street-level coordinates:** suburb centres are close enough for distance scores but not for routing. Geocode
  street addresses when a geocoding service is available.
- **Virgin prices** (`VIRGIN_PRICE_AUD` in `app/listings.py`) and CO2e factors are indicative preview values.
- **Impact page** shows listed supply, not completed trades (`isSample: true`), until trades are recorded.
- **Hosting:** SQLite is a local file. If the API is deployed somewhere with an ephemeral disk, app-entered rows are
  lost on restart; move to a hosted database then.
