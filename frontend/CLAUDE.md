# Frontend guide for Claude (and humans)

This folder is the CircuLink UI. The backend, dataset and AI matching are built separately by another teammate in `backend/`.

## Before you change anything

1. Read `FRONTEND_LOG.md` (newest entry first) to see what has been done and what is open.
2. Read `API_CONTRACT.md` if the change touches data.
3. After your change, **add a new entry at the top of `FRONTEND_LOG.md`** (date, what, why, files, open items). Keep entries short.

## Ground rules

- Only edit files inside `frontend/`. Root files (`README.md`, `.gitignore`, `CLAUDE.md`) are shared: append, don't rewrite.
- Never touch `backend/` from a frontend change.
- All backend calls go through `src/api/client.ts`. Components never call `fetch` directly.
- If the data shape must change, update `src/api/types.ts`, `API_CONTRACT.md` and the mock together, and note it in the log so the backend side sees it.
- Run `npm run typecheck` and `npm run build` before committing.

## Stack

React 19, Vite, TypeScript (strict), react-router, Leaflet via react-leaflet, zustand for UI state, lucide-react icons. Plain CSS with design tokens; no UI kit and no Tailwind.

## Folder map

```
src/
  api/          types.ts (shared shapes), client.ts (mock vs real switch on VITE_API_URL)
    mock/       listings.json (sample AU listings), mockApi.ts, scoring.ts (stand-in for the AI model)
  components/
    layout/     TopBar (nav, search, Buy/Sell toggle)
    listings/   FilterBar (state, materials, sort, distance), ListingCard (compact rail row),
                LogisticsEstimate (freight + landed cost), EnquiryForm
    map/        MarketMap (pins, state outline, radius, controls), LayerSwitcher, layers.ts (tile sources),
                RouteMap (your site + partners with dashed lines)
    sourcing/   CombinePlanner (split one demand across several suppliers, editable)
    ui/         CircularityChart
  data/         au-states.json (state boundaries, Natural Earth via datamaps, simplified)
  hooks/        useAsync (fetch state), useListings (load + filter + sort for the marketplace)
  lib/          materials.ts (labels, colours, CO2 factors), regions.ts (states, bounds, HOME_SITE),
                format.ts (A$, tonnes), geo.ts (distance), logistics.ts (truck rates, freight estimate),
                sourcing.ts (multi-supplier order planner)
  pages/        Marketplace, ListingDetail (/listing/:id), Matches (ranked + combine tabs), SellNew, Impact
  state/        store.ts (zustand: mode, region, filters, hovered pin, map layer)
  styles/       tokens.css (all colours, light + dark), app.css (all component styles, sectioned)
```

## Design conventions

- Colours only from `styles/tokens.css` variables. Dark mode is redefined there, so don't hard-code hex in components (material colours in `lib/materials.ts` are the exception).
- Fonts: IBM Plex Sans for UI, IBM Plex Mono with tabular numbers (`.num`) for prices, tonnes and scores.
- Material colours were checked for colour-blind separation; pins also show a short code (Cu, Al, Fe…) so colour is never the only signal. Supply listings are round pins, buyer requests are square.
- Money is A$ per tonne, distances in km (`lib/format.ts`). Australian spelling.
- Anything not real data is labelled: "Sample" badges on the impact page, "Demo mode" notes when the mock API is active.

## Known gaps / ideas

- No auth: the signed-in site is the constant `HOME_SITE` in `lib/regions.ts` (Westlink Cable Co., Wetherill Park NSW).
- Road distance is straight line × 1.25 (`lib/geo.ts`).
- Freight rates and the order planner run in the browser (`lib/logistics.ts`, `lib/sourcing.ts`); the backend can take them over later.
- No marker clustering yet; fine for ~50 listings.
- Bundle is ~780 kB, mostly Leaflet + state boundaries; code-split if it matters.
