# Frontend log

Newest entry first. Add an entry for every change: date, what, why, files, open items.
Anyone (or any Claude session) picking up the frontend should read this before starting.

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
