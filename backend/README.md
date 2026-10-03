# CircuLink backend

Database (Supabase / Postgres) for the marketplace. The API and AI matching will live here too.

## Database

Two tables, one per side of the market, plus a small lookup table:

| Table | Side | One row is |
| --- | --- | --- |
| `producers` | supply | a business offering recycled material for a period |
| `manufacturers` | demand | a business's tender for recycled material |
| `materials` | reference | a material both sides can trade (`steel`, `aluminium`, `copper`, `brass`, `alloys`, plus `plastics`, `paper`, `glass`, `ewaste` for later) |

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
| Output grade | `output_grade` | `high`, `medium` or `short_use` |
| Compliance | `compliance` | text array, e.g. `{Cert A, Cert C}` |
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
| Output grade request | `output_grade_request` | `high`, `medium` or `short_use` |
| | `purchase_start`, `purchase_end` | purchase window |

Both tables also have `id` (uuid), `is_synthetic`, `created_at` and `updated_at` (kept current by a trigger).

**Grades are ordered** `short_use < medium < high`, so a matching query can use
`p.output_grade >= m.output_grade_request` to find offers that are at least as good as requested.

**Security:** row level security is on. Anyone with the anon key can read; inserts and updates go through
the backend using the `service_role` key, so the backend validates input before it reaches the database.
Never put the `service_role` key in the frontend.

## Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run `supabase/migrations/20261003000000_producers_manufacturers.sql`, then `supabase/seed.sql`.
3. Copy `.env.example` to `.env` and fill in the URL and keys from **Project Settings → API**.

With the Supabase CLI instead: `supabase init` in this folder, `supabase link --project-ref <ref>`, then
`supabase db push` (runs the migration). Run the seed with `psql "$DATABASE_URL" -f supabase/seed.sql` or paste it
into the SQL Editor.

## Dataset

`seed.sql` is generated from the two spreadsheets in the repo root
(`NSW_Steel_Scrap_Producers*.xlsx`, `NSW_Steel_Scrap_Manufacturers*.xlsx`): 63 producers and 61 manufacturers.
Company names, ABNs and NSW locations are real; materials, quantities, compliance (Cert A–E), grades, prices,
budgets and timeframes are **synthetic demo data**, and every seeded row has `is_synthetic = true`.

Each spreadsheet also has a **Sources** sheet with the ABN Lookup and website links behind every business. The seed
takes the legal entity, published activity and, where the business is an NPI-listed facility, its coordinates
(17 producers and 19 manufacturers) from there.

To rebuild it after the spreadsheets change:

```bash
pip install -r backend/requirements.txt
python backend/scripts/build_seed.py
```

Re-running the seed only replaces `is_synthetic` rows, so data entered through the app is kept.

## Open items

- **Coordinates:** only the NPI facilities have lat/lng (17 of 63 producers, 19 of 61 manufacturers). The map and
  distance score need them for every row, so geocode the rest from address, locality and postcode.
- **Frontend materials:** the UI's `MaterialKey` has no `brass` or `alloys`; they need adding to
  `frontend/src/api/types.ts` and `frontend/src/lib/materials.ts`.
- **API:** map these tables to the shapes in `frontend/API_CONTRACT.md` (producers → `kind: "supply"`,
  manufacturers → `kind: "demand"`, `max_price_aud_per_t` → `priceAud`).
