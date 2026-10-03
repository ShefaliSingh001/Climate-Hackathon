# Frontend guide for Claude (and humans)

This folder is the ResourceX UI. The backend, dataset and AI matching are built separately by another teammate in `backend/`.

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

## Brand

ResourceX ("Materials in motion"). Use `components/brand/Logo.tsx` for the logo, never a re-typed name in a different font. Assets are in `public/brand/`. Brand green `--brand`, lime `--accent` (dark text on lime buttons), `--accent-ink` for lime-family text on light backgrounds.

## Accounts and roles

Read `AUTH.md`. Buyers see supply, `/sourcing` and Impact; sellers see buyer requests, `/my-listings`, `/sell/new` and Impact. Use `useAuth()` for the account and `useSite()` for the signed-in site (never `HOME_SITE` directly). Guard new pages with `RequireAuth` (optionally `role`).

## Stack

React 19, Vite, TypeScript (strict), react-router, Leaflet via react-leaflet, zustand for UI state, lucide-react icons. Plain CSS with design tokens; no UI kit and no Tailwind.

## Folder map

```
src/
  api/          types.ts (shared shapes), client.ts (mock vs real switch on VITE_API_URL)
    mock/       listings.json (sample AU listings), mockApi.ts, scoring.ts (stand-in for the AI model)
  auth/         types.ts (Role, Account, AuthClient), mockAuth.ts (demo accounts, browser storage), AuthProvider.tsx (useAuth, useSite, RequireAuth)
  components/
    brand/      Logo (mark + live wordmark), DotField (animated dot-wave canvas)
    home/       nswMap.ts (pre-projected NSW outline + sample pins for the homepage)
    layout/     TopBar (role-based nav, search, account menu)
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
  pages/        Home (/), Auth (Login, Signup), Marketplace (/marketplace), ListingDetail (/listing/:id),
                Matches (/sourcing, ranked + combine), MyListings, SellNew, Impact
  state/        store.ts (zustand: mode, region, filters, hovered pin, map layer)
  styles/       tokens.css (all colours, light + dark), app.css (app component styles, sectioned), home.css (homepage)
```

## Design conventions

- Colours only from `styles/tokens.css` variables. Dark mode is redefined there, so don't hard-code hex in components (material colours in `lib/materials.ts` are the exception).
- Fonts: IBM Plex Sans for UI, IBM Plex Mono with tabular numbers (`.num`) for prices, tonnes and scores, Instrument Sans for homepage and auth headings, Montserrat for the wordmark only.
- Material colours were checked for colour-blind separation; pins also show a short code (Cu, Al, Fe…) so colour is never the only signal. Supply listings are round pins, buyer requests are square.
- Money is A$ per tonne, distances in km (`lib/format.ts`). Australian spelling.
- Anything not real data is labelled: "Sample" badges on the impact page, "Demo mode" notes when the mock API is active.

## Known gaps / ideas

- Auth is browser-only (demo). See `AUTH.md` for moving it to the backend.
- Road distance is straight line × 1.25 (`lib/geo.ts`).
- Freight rates and the order planner run in the browser (`lib/logistics.ts`, `lib/sourcing.ts`); the backend can take them over later.
- No marker clustering yet; fine for ~50 listings.
- Bundle is ~780 kB, mostly Leaflet + state boundaries; code-split if it matters.
