# Frontend guide for Claude (and humans)

This folder is the ResourceX UI. The backend, dataset and AI matching are built separately by another teammate in `backend/`.

## Before you change anything

1. Read `FRONTEND_LOG.md` (newest entry first) to see what has been done and what is open.
2. Read `API_CONTRACT.md` if the change touches data.
3. After your change, **add a new entry at the top of `FRONTEND_LOG.md`** (date, what, why, files, open items). Keep entries short.

## Ground rules

- Only edit files inside `frontend/`. Root files (`README.md`, `.gitignore`, `CLAUDE.md`) are shared: append, don't rewrite.
- Never touch `backend/` from a frontend change.
- All backend calls go through `src/api/client.ts`. Components never call `fetch` directly. The exceptions are `lib/routing.ts` (public road routing, OSRM) and `lib/geocode.ts` (public address search, Photon), which call third-party services, not our backend.
- If the data shape must change, update `src/api/types.ts`, `API_CONTRACT.md` and the mock together, and note it in the log so the backend side sees it.
- Run `npm run typecheck` and `npm run build` before committing.

## Brand

ResourceX ("Materials in motion"). Use `components/brand/Logo.tsx` for the logo, never a re-typed name in a different font. Assets are in `public/brand/`. Brand green `--brand`, lime `--accent` (dark text on lime buttons), `--accent-ink` for lime-family text on light backgrounds.

## Accounts and roles

Read `AUTH.md`. Buyers see supply, `/sourcing`, `/orders` and Impact; sellers see buyer requests, `/my-listings`, `/sell/new`, `/collaborations`, `/orders` and Impact. Use `useAuth()` for the account and `useSite()` for the signed-in site (never `HOME_SITE` directly). Guard new pages with `RequireAuth` (optionally `role`).

## Stack

React 19, Vite, TypeScript (strict), react-router, Leaflet via react-leaflet, zustand for UI state, lucide-react icons. Plain CSS with design tokens; no UI kit and no Tailwind.

## Folder map

```
src/
  api/          types.ts (shared shapes), client.ts (mock vs real switch on VITE_API_URL)
    mock/       listings.json (sample AU listings), mockApi.ts, scoring.ts (stand-in for the AI model),
                orders.ts (sample order history per demo account), collaborations.ts (seller teams, stored in the browser)
  auth/         types.ts (Role, Account, AuthClient), mockAuth.ts (demo mode: browser-only accounts), serverAuth.ts + token.ts
                (API mode: backend /auth/* logins, bearer token), AuthProvider.tsx (useAuth, useSite, RequireAuth)
  components/
    brand/      Logo (mark + live wordmark), DotField (animated dot-wave canvas)
    home/       nswMap.ts (pre-projected NSW outline + sample pins for the homepage),
                motion.tsx (Reveal, CountUp, useScrollFx: homepage scroll effects)
    layout/     TopBar (role-based nav, search, account menu with Settings and a theme toggle)
    collab/     TeamUpPlanner (seller view of a buyer request: your listing + partners added through the SupplierPicker pop-up, then invite)
    listings/   FilterBar (state, materials, sort, distance), ListingCard (rail card: position + Material / Production rate / Price / Distance with mini icons;
                also used in the Add suppliers / Add partners pop-up),
                RankBars (Material / Distance / Price / Reliability bars labelled with positions; Sourcing only),
                LogisticsEstimate (freight + landed cost), EnquiryForm
    map/        MarketMap (pins, state outline, radius, controls), LayerSwitcher, layers.ts (tile sources),
                AddressPicker (address + suggestions; the map pin follows what you type; use it wherever a location is entered),
                RouteMap (your site + partners, animated road routes via lib/routing.ts, dashed line fallback)
    orders/     MonthlyChart (single-series columns with hover tooltip)
    sourcing/   CombinePlanner (buyer builds a combined order: starts empty, Add suppliers or Suggest a split with AI),
                SupplierPicker (card pop-up for adding supply listings: buyer "Add suppliers" and seller "Add partners")
    ui/         CircularityChart, Select (custom accessible dropdown; use it, never a native <select>),
                NumberField (text-based number input that can be cleared; use it, never type="number"),
                MultiSelect (checkbox dropdown, empty = all), Switch (on/off with label)
  data/         au-states.json (state boundaries, Natural Earth via datamaps, simplified)
  hooks/        useAsync (fetch state), useListings (load + filter + rank + sort for the marketplace), useRoute
  lib/          materials.ts (labels, colours, CO2 factors), regions.ts (states, bounds, HOME_SITE),
                format.ts (aud, tonnes, volume, PRICE_NOTE), geo.ts (straight-line distance), logistics.ts (truck rates, freight estimate),
                ranking.ts (positions per factor, no scores), routing.ts (OSRM road routes),
                geocode.ts (Photon address search, offline fallback to places.ts), verify.ts (verified = ABN on file),
                sourcing.ts (multi-supplier order planner)
  pages/        Home (/), Auth (Login, Signup), Marketplace (/marketplace), ListingDetail (/listing/:id),
                Matches (/sourcing, ranked + combine), MyListings, SellNew, Impact, Settings (/settings),
                Orders (/orders, both roles), Collaborations (/collaborations, sellers)
  state/        store.ts (zustand: mode, region, filters, hovered pin, map layer; defaults come from settings),
                settings.ts (useSettings: theme, motion, map defaults, notifications; saved in localStorage)
  styles/       tokens.css (all colours, light + dark), app.css (app component styles, sectioned), home.css (homepage)
```

## Design conventions

- Colours only from `styles/tokens.css` variables. Dark mode is redefined there, so don't hard-code hex in components (material colours in `lib/materials.ts` are the exception).
- Fonts: IBM Plex Sans for UI, IBM Plex Mono with tabular numbers (`.num`) for prices, tonnes and scores, Instrument Sans for homepage and auth headings, Montserrat for the wordmark only.
- Material colours were checked for colour-blind separation; pins also show a short code (Cu, Al, Fe…) so colour is never the only signal. Supply listings are round pins, buyer requests are square.
- Plain language for non-technical users: no unit abbreviations in the UI. Write "25 tonnes per fortnight", "$13,050 per tonne" with the helpers in `lib/format.ts` (never "t", "t/fn", "A$/t", "mo"). Show `PRICE_NOTE` (AUD, excluding GST) once per page instead of "A$". "km" is fine. Wrap CO₂e in `<abbr title="carbon dioxide equivalent">` where space allows. Australian spelling.
- Say "newly sourced" materials, never "virgin", in UI copy (API field names like `virginPriceAud` stay).
- No match scores in the UI. Show positions ("#2 of 18", "1st nearest") from `lib/ranking.ts`; scores only decide the order. Positions are always unique (1, 2, 3…); ties are broken, never shared.
- Theme: `data-theme` on `<html>` (light/dark, absent = follow the device), set by `state/settings.ts` and by the inline script in `index.html` before first paint. Only use tokens so both themes work.
- Motion: keep it subtle (transform/opacity, 0.5–0.9 s, one easing). Every animation must stop under `prefers-reduced-motion` **and** `:root[data-motion="reduced"]` (Settings → Reduce animations); in JS check `prefersReducedMotion()` from `state/settings.ts`.
- Verified means the business has an ABN on file. Use `isVerified()` from `lib/verify.ts`, never `listing.verified` directly.
- Product language: ResourceX is positioned as **AI matching** for recycled materials (homepage hero and the "matching engine" section). Keep claims to what the matching model does: hard rules (material, grade, certificates, delivery window, budget), ranking with reasons, splitting big orders, delivered cost.
- Anything not real data is labelled: "Sample" badges on the impact page, "Demo mode" notes when the mock API is active.

## Known gaps / ideas

- Auth: demo mode keeps accounts in the browser (`mockAuth`); with `VITE_API_URL` set the app uses the backend logins (`serverAuth`) and sends the bearer token on every call. Orders and Collaborations need a login in API mode.
- Road routes come from the public OSRM demo server (fair use, no SLA). For production use a hosted router (self-hosted OSRM, Valhalla, GraphHopper or Mapbox). Without a route, distance falls back to straight line × 1.25 (`lib/geo.ts`).
- Freight rates and the order planner run in the browser (`lib/logistics.ts`, `lib/sourcing.ts`); the backend can take them over later.
- No marker clustering yet; fine for ~50 listings.
- Bundle is ~780 kB, mostly Leaflet + state boundaries; code-split if it matters.
