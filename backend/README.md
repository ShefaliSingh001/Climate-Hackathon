# CircuLink backend

SQLite database plus a FastAPI server that serves `frontend/API_CONTRACT.md`. Matching uses the tender matching model
in `API/scrap_model_api.py`.

## Run it

From the repo root:

```bash
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload --port 8000     # API docs at http://localhost:8000/docs
```

Then point the frontend at it: in `frontend/.env.local` set `VITE_API_URL=http://localhost:8000` and run
`npm run dev` in `frontend/`. Tests: `pytest backend/tests` (they run against a temporary copy of the database).

| Path | What it does |
| --- | --- |
| `app/main.py` | endpoints, request validation, `{ "error": ... }` responses, CORS (`CORS_ORIGINS`, default `http://localhost:5173`) |
| `app/listings.py` | database rows → `Listing` (producers → `p<id>` supply, manufacturers → `m<id>` demand) |
| `app/matching.py` | adapter to the matching model: builds its tender and producers, maps its plans back |
| `app/db.py` | SQLite connection (`CIRCULINK_DB` overrides the path; foreign keys on) |

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
- **Card scores** (`matchScore` on `GET /listings`): the same score with no specific requirement.

## Registration

Signing up on the website saves the business through `POST /listings`. A seller becomes a `producers` row and a buyer a
`manufacturers` row, with `is_synthetic = 0` and `geo_source = 'user'`, so re-running the loader keeps them. New
producers are matched straight away. Logins themselves are still browser-only (`frontend/AUTH.md`), so the API trusts
whatever it is sent. Running the app locally therefore changes `backend/db/circulink.db`; don't commit test sign-ups.

Not modelled: transport cost (the UI estimates freight separately), tax, and reserving stock across several
tenders. "Any grade" passes every producer to the model with the same grade, so the grade check is skipped.

## Database

The database is committed as `backend/db/circulink.db`, already loaded, so you can open it straight away. The
commands above rebuild it from `backend/db/schema.sql` and the two spreadsheets in the repo root; run them after the
spreadsheets or schema change, then commit the updated `.db`. No account, server or keys needed.

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
