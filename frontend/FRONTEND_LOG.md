# Frontend log

Newest entry first. Add an entry for every change: date, what, why, files, open items.
Anyone (or any Claude session) picking up the frontend should read this before starting.

---

## 2026-10-03: Compact list, full supplier page, freight estimate, combined orders

**What**
- **Compact list:** results rail cards now show only name, verified badge, volume, price, distance and match score. Clicking a card or a map pin opens the full listing page; the old slide-over drawer is gone.
- **Listing page** (`/listing/:id`, `pages/ListingDetail.tsx`):
  - Key figures, material spec and price against virgin.
  - Estimated CO2e avoided.
  - Route map from your site, business details and licences.
  - Quote form, plus a "Combine with other suppliers" link.
- **Logistics cost estimate** (`components/listings/LogisticsEstimate.tsx`, `lib/logistics.ts`):
  - Inputs: tonnes per month, truck type (rigid, semi-trailer, B-double, or the cheapest), and whether the return leg is empty.
  - Outputs: trips, freight per month and per tonne, landed cost per tonne compared with virgin, and freight emissions.
  - All assumptions are listed on screen.
- **Combine suppliers** (Sourcing page, "Combine suppliers" tab; `components/sourcing/CombinePlanner.tsx`, `lib/sourcing.ts`):
  - The buyer enters demand (t/month) and budget (A$/month including freight). The planner splits the order across up to N partners, optimising for lowest landed cost, fewest partners or lowest freight emissions, with an optional verified-only filter.
  - Shows volume and budget meters, average landed cost, budget left, CO2e avoided and freight emissions.
  - The editable split table lets you change tonnes per partner, remove partners or add one, with totals updating live.
  - A route map shows every partner, and "Request quotes from all partners" sends an enquiry to each.
- Nav item "AI matches" is renamed "Sourcing". The page reads `?tab=combine&material=...`.
- Emissions under 1 t display in kg (`co2e()` in `lib/format.ts`).

**Why**
- The team asked for a cleaner sidebar, a full page per supplier, freight costs, and a way to meet a demand and budget using several partners. That last point matches the backend's `manufacturers` table (`required_quantity_t` and `budget_aud`).

**Backend hand-off**
- The freight estimate and the order planner run in the browser for now. `API_CONTRACT.md` has a new section describing their inputs and outputs in case the backend takes them over.

**Open items**
- Freight rates (A$/km per truck, A$180 per trip) and 0.075 kg CO2e/t-km are indicative. Replace them with carrier quotes or published rates.
- Greedy allocation is fine for tens of suppliers. Use a solver if the counts grow or minimum order sizes appear.

---

## 2026-10-03: Fix blank map ("API KEY REQUIRED" tiles)

**What**
- Replaced every CARTO tile layer with keyless Esri tiles in `src/components/map/layers.ts`:
  - Map: Esri World Street Map.
  - Satellite labels: Esri Boundaries & Places.
  - Dark: Esri Dark Gray Canvas, base plus labels.
- Satellite (Esri World Imagery) and Terrain (OpenTopoMap) are unchanged.
- The location picker on `/sell/new` uses the new Map layer automatically.

**Why**
- CARTO (`basemaps.cartocdn.com`) began requiring an API key around 28 Aug 2026. Without one it returns tiles watermarked "API KEY REQUIRED" with HTTP 200, so the map looked broken with no error.

**Open items**
- Esri's public tiles are for non-commercial use. Before going to production, move to a keyed provider (Esri location platform, MapTiler, Mapbox or CARTO with a key) via an env var such as `VITE_MAP_TILES_KEY`.
- The new tiles could not be loaded from the cloud dev sandbox (network blocked), so check all four map views in a local browser.

---

## 2026-10-03: First build of the marketplace UI

**What**
- Scaffolded `frontend/` (React 19 + Vite + TypeScript, react-leaflet, zustand, react-router).
- Marketplace (`/`, `/listing/:id`): state picker defaulting to **NSW** (any state/territory or all of Australia), material chips with counts, sort (best match, nearest, price vs virgin, volume), distance radius from the user's site, verified-only toggle, search in the top bar.
- Map: Map (CARTO Voyager), Satellite (Esri World Imagery + CARTO labels), Terrain (OpenTopoMap), Dark (CARTO Dark Matter) via a Google-Maps-style switcher. Colour-coded pins with material codes, selected state outlined, radius circle, "centre on my site", zoom.
- List ↔ map hover sync. Clicking a card or pin opens a detail drawer (specs, price vs virgin, estimated CO2e avoided, licences, quote form) and updates the URL.
- Buy/Sell toggle: Buy shows supply listings (round pins), Sell shows buyer requests (square pins).
- AI matches (`/matches`): requirement form, ranked results with material/distance/price/reliability bars and reasons.
- List material (`/sell/new`): validated form, click-to-place yard location on a map.
- Impact (`/impact`): sample KPIs, recirculated tonnes by material, and the real global circularity rate (Circularity Gap Report: 9.1% → 6.9%) against the COP31 15% by 2035 goal.
- Light and dark themes, phone layout (map on top, list below, drawer as bottom sheet).

**Why**
- COP31 priority: Green Industrialisation (15% circular material use by 2035). The barrier: Australian manufacturers can't easily find nearby, verified recycled feedstock of the right grade and volume, so they buy virgin.

**Data**
- `src/api/mock/listings.json`: 35 fictional supply listings (22 in NSW) and 8 buyer requests. Prices are indicative A$/t, not quotes. Company names are made up.
- `src/data/au-states.json`: state boundaries (Natural Earth admin-1 via the `datamaps` package), simplified to 3 decimals.
- CO2e factors per tonne in `src/lib/materials.ts` are rough preview values; replace with sourced factors.

**Backend hand-off**
- `API_CONTRACT.md` lists every endpoint and shape the UI expects. Set `VITE_API_URL` to switch from the mock to the real API; nothing else in the UI changes.
- `src/api/mock/scoring.ts` is a placeholder weighted formula. The real AI matching should return the same `MatchResult` shape.

**Decisions**
- Plain CSS + tokens instead of Tailwind/CSS Modules, and zustand + a small `useAsync` instead of react-query/react-hook-form, to keep dependencies few for the hackathon.
- Fonts: IBM Plex Sans/Mono (the preview used these and the team liked the look).

**Open items**
- Confirm API base URL and CORS with backend.
- Replace sample impact numbers when real trades exist (`isSample: false`).
- Auth / real user site (currently `HOME_SITE` in `lib/regions.ts`).
- Marker clustering if listing counts grow.
