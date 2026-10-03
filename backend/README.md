# CircuLink backend

Database (SQLite) for the marketplace. The API and AI matching will live here too.

## Quick start

```bash
pip install -r backend/requirements.txt
python backend/scripts/load_db.py
```

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

Both tables also have `id` (integer), `is_synthetic` (0/1), `created_at` and `updated_at` (kept current by a trigger).
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

## Open items

- **Coordinates:** only the NPI facilities have lat/lng (17 of 63 producers, 19 of 61 manufacturers). The map and
  distance score need them for every row, so geocode the rest from address, locality and postcode.
- **Frontend materials:** the UI's `MaterialKey` has no `brass` or `alloys`; they need adding to
  `frontend/src/api/types.ts` and `frontend/src/lib/materials.ts`.
- **API:** map these tables to the shapes in `frontend/API_CONTRACT.md` (producers → `kind: "supply"`,
  manufacturers → `kind: "demand"`, `max_price_aud_per_t` → `priceAud`).
- **Hosting:** SQLite is a local file. If the API is deployed somewhere with an ephemeral disk, app-entered rows are
  lost on restart; move to a hosted database then.
