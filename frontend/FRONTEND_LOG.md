# Frontend log

Newest entry first. Add an entry for every change: date, what, why, files, open items.
Anyone (or any Claude session) picking up the frontend should read this before starting.

---

## 2026-10-04: Address search on the map, AI-matching homepage, ABN = verified, buyer picks suppliers

**What**
- **Address search moves the map.** New `components/map/AddressPicker.tsx` holds street address (with suggestions), suburb, state, postcode and a map.
  - Typing searches for the address (`lib/geocode.ts`, Photon / OpenStreetMap, keyless) and flies the pin to the best match. It fills suburb, state and postcode if they're empty.
  - You can pick a suggestion, drag the pin, or click the map.
  - It is used on **List material** (yard address) and **Sign-up** (yard or delivery address, replacing the fixed suburb dropdown).
  - When Photon can't be reached, known suburbs still resolve offline (`lib/places.ts`).
  - Listings and sites now carry an optional `address` and `postcode`.
- **Verified = ABN on file.** `lib/verify.ts` provides `isVerified()` (true if `verified` is true or the ABN is 11 digits). It is used everywhere badges, the "Verified only" filter, ranking and the planner read verification.
  - New listings are verified straight away when they have an ABN.
  - "Awaiting checks" / "unverified until we check your EPA licence" is gone. The label is "Verified business (ABN on file)".
- **Buyer combined orders start empty.** On Sourcing → Combine suppliers there are two ways to start:
  - **Add suppliers** opens a pop-up (`components/sourcing/SupplierPicker.tsx`) with the qualifying suppliers as the same cards as the map side list (#rank, Material, Production rate, Price, Distance). It has search and sort, and you multi-select then add.
  - **Suggest a split with AI** runs the matching model as before.
  - Re-suggest and Add suppliers stay available above the split. `ListingCard` gained optional `selected`, `trailing` and `actionLabel` props.
- **Homepage: AI matching.**
  - Hero: "Recycled materials, matched by AI", with an AI eyebrow and a new lede.
  - New dark "The matching engine" section with four points (hard rules first, ranked with reasons, splits big orders, priced to your door) and an animated sample match card (request chips, scan bar, three ranked suppliers with rule checks, combined result).
  - The nav reads AI matching · How it works · Who it's for · Impact. The Match step and the meta description mention AI.

**Files**
- New: `components/map/AddressPicker.tsx`, `lib/geocode.ts`, `lib/verify.ts`, `components/sourcing/SupplierPicker.tsx`.
- Changed:
  - Pages: `SellNew`, `Auth` (sign-up), `Home`, `ListingDetail`, `MyListings`, `Matches`
  - Components: `CombinePlanner`, `ListingCard`
  - Lib and hooks: `lib/places.ts`, `lib/ranking.ts`, `lib/sourcing.ts`, `hooks/useListings.ts`
  - API and mock: `api/types.ts`, `api/mock/mockApi.ts`, `api/mock/scoring.ts`
  - Other: `index.html`, `styles/app.css`, `styles/home.css`
  - Docs: `API_CONTRACT.md`, `CLAUDE.md`

**Open items**
- Photon is a free, fair-use service with no uptime promise. Before launch, use a paid or self-hosted geocoder (Geoscape G-NAF is the Australian standard, or Mapbox or Google Places).
- The sandbox blocks Photon, so address search was tested with a stubbed Photon response plus the offline fallback. Check it live in a local browser.
- Backend: set `verified: true` whenever a listing's business has an ABN, and optionally store `address` and `postcode`.

---

## 2026-10-04: Orders dashboard, seller collaborations, stats on map cards

**What**
- **Map side panel:** each card now shows the listing's stats in plain words in a 2 × 2 grid, instead of the ranking bars: Material, Production rate (buyer requests: Quantity needed), Price (buyer requests: Pays up to) and Distance. The #position badge stays, and the suburb sits under the name. Reliability is gone from the cards. `RankBars` is now used only on Sourcing.
- **Orders** (`/orders`, both roles, in the top nav), a dashboard:
  - KPIs against the previous period: spent (buyers, including freight) or sales (sellers), tonnes, number of orders, emissions avoided.
  - A tonnes-per-month column chart with hover and focus tooltips.
  - Tonnes by material, top suppliers or buyers, and in-progress orders with a status stepper (Requested, Confirmed, In transit, Delivered).
  - A searchable order table with tabs (All, Active, Delivered, Cancelled). Rows expand to show dates, price, freight, distance, emissions, joint-order partners, and View listing or Order again.
  - The period picker offers 3, 6 or 12 months.
- **Collaborations** (`/collaborations`, sellers): recyclers team up on buyer requests that are too big for one yard.
  - **Starting a team:** a buyer request page now has a "Team up with other recyclers" planner (`components/collab/TeamUpPlanner.tsx`):
    - your own supply plus the nearest suppliers of the same material, with editable tonnes and "Suggest partners";
    - a coverage meter, average price against the buyer's limit, and delivered price with freight;
    - an "Invite partners" button.
  - **The page:** tabs for invites for you (Accept / Decline), teams you lead (send the joint offer once partners reply, or Withdraw), and requests for your materials (shows when a request needs more than you list).
  - **Joint offers** appear in Orders as pending joint orders.
- **Demo data:**
  - Demo accounts get 24 months of sample orders (`api/mock/orders.ts`, seeded so they're stable).
  - Quote requests, offers and joint offers made in the browser are added to Orders.
  - The demo seller starts with two invites from other recyclers, and partners invited in demo mode accept after about 8 seconds.
  - New buyer request `d09`: Westlink Cable Co. needs 60 tonnes of copper a month, more than any single yard lists.
- **API:** `listOrders`, `listCollaborations`, `createCollaboration`, `respondToCollaboration`, `withdrawCollaboration` and `sendJointOffer` were added to `api/client.ts`, with the proposed endpoints in `API_CONTRACT.md` (`GET /orders`, `/collaborations…`).

**Files**
- New:
  - `pages/Orders.tsx`, `pages/Collaborations.tsx`
  - `components/orders/MonthlyChart.tsx`, `components/collab/TeamUpPlanner.tsx`
  - `api/mock/orders.ts`, `api/mock/collaborations.ts`
- Changed:
  - API: `api/types.ts`, `api/client.ts`, `api/mock/mockApi.ts`, `api/mock/listings.json`
  - Pages and components: `ListingCard`, `RankBars`, `ListingDetail`, `TopBar`, `App.tsx`
  - Other: `lib/format.ts` (`shortDate`, `monthName`, `audBig`), `styles/app.css`
  - Docs: `README.md`, `CLAUDE.md`

**Open items for the backend**
- Build `GET /orders` and the collaboration endpoints, or tell the frontend to adapt. In API mode the Orders and Collaborations pages call them directly, so they show an error until they exist.
- A quote request (`POST /listings/{id}/enquiries`) should create a pending order.

---

## 2026-10-04: Homepage merge, zoomed map, unique rankings, settings and state picker tidy-up

**What**
- **Homepage:**
  - The problem section has no photo now. The heading and intro sit on the left and the three facts on the right; the third fact is "600 km" instead of "$ per tonne".
  - "How it works" and "The platform" are merged into one "How it works" section:
    - three numbered steps (List, Match, Deliver), each with its photo and two platform features;
    - the sample map card is sticky beside them, with the combined order shown below the map instead of over it.
  - The nav reads The problem · How it works · Who it's for · Impact.
- **Homepage map:** zoomed into Greater Sydney, the Hunter and the Illawarra (`VIEW` in `pages/Home.tsx` crops and scales the `nswMap.ts` coordinates), so suppliers no longer pile up in one spot.
  - Out-of-view pins are hidden.
  - Pins stay a fixed size and the outline uses a non-scaling stroke.
  - City labels have a halo, and there is a Tasman Sea label and a 50 km scale bar.
  - The routes now come from Hunter (Kooragang), Smithfield and Illawarra (Port Kembla). The sample order is 25 + 23 + 12 = 60 tonnes, at $12,780 per tonne delivered.
- **Rankings:** positions are unique, 1, 2, 3… with no shared places (`positions()` in `lib/ranking.ts`).
  - Overall ties go to the nearer listing.
  - Ties on a single factor go to the better overall position.
  - On Sourcing, a tie goes to the higher-ranked row.
- **Settings:** "Reset demo data" is removed, along with the settings store's unused `reset()`.
- **State picker:** "All of Australia" is first in `REGIONS`, ahead of NSW. NSW is still the default.
- **Removed:** `public/images/scrap-yard.webp` and its credit, and the parallax code in `components/home/motion.tsx` (it was only used by that photo).

**Files**
- `pages/Home.tsx`, `styles/home.css`, `components/home/motion.tsx`, `lib/ranking.ts`, `lib/regions.ts`, `pages/Settings.tsx`, `state/settings.ts`, `styles/app.css`, `public/images/CREDITS.md`.

---

## 2026-10-04: New impact dashboard (2035 recycled vs virgin) + AI monthly report

**What**
- Replaced the Impact page (`/impact`). It now answers one question: **by 2035, how much more recycled metal do manufacturers buy with ResourceX than without it?** Bars for today / 2035 without / 2035 with, split into recycled (from producers) and virgin (newly mined).
- A visible "Where these numbers come from" table under the bars: each metal's share of our manufacturers' metal (from the marketplace data), recycled share today, 2035 without, max with ResourceX, and the named, linked source, with an "Our mix" total row.
- "This month on ResourceX": scrap matched, CO₂e avoided, money saved by buyers.
- "AI monthly report" panel (`POST /impact/report`): Claude writes it from the page's numbers only; without an API key the backend returns a template report and the panel says so. Headline and three takeaways show; the full text sits behind "Read full report".
- "How we calculate this" (closed by default): assumptions, full citations, emission factors, and the global all-materials chart as context only.
- Metal CO₂ factors in `lib/materials.ts` now match the sourced backend factors (aluminium 9.0 → 14.6, copper 3.0 → 3.2, steel 1.4 → 1.5, brass 2.5 → 3.2, alloys 2.0 → 4.3), so listing cards and the dashboard agree.

**Why**
- Team aim: show that using the marketplace raises manufacturers' recycled purchasing by about 15 percentage points by 2035 (34% → 49%, virgin 66% → 51%), with every number traceable to the data or a published source. COP31's 15% goal covers all materials worldwide, so it is context, not a number used in the calculation.

**Files**
- `pages/Impact.tsx`, `api/types.ts` (`ImpactStats`, `MaterialImpact`, `Outlook`, `OutlookScenario`, `ImpactReport`), `api/client.ts` (`getImpactReport`), `api/mock/mockApi.ts`, `lib/materials.ts`, `styles/app.css` (impact section), `API_CONTRACT.md`.

**Open items**
- The report needs `ANTHROPIC_API_KEY` set on the backend (Vercel env var, or `backend/.env` locally) for Claude to write it.

---

## 2026-10-03: Materials dropdown, Settings page, animated routes, homepage scroll motion

**What**
- **Map filters:** State and a new Materials **multi-select dropdown** sit side by side, replacing the chip cloud. The dropdown has checkboxes, colour dots and counts; an empty selection means "All materials". Sort and Distance sit below, "Verified only" is a switch, and "Clear filters" appears when anything differs from your defaults. The ranking note is a collapsed "How ranking works".
- **Settings** (`/settings`, account menu → Settings):
  - Theme: System, Light or Dark, with previews.
  - Reduce animations.
  - Default map style, state and search distance.
  - Email notification switches (demo only).
  - Account details, sign out, and "Reset demo data".
  - The account menu also has a quick Light/Dark toggle.
  - Saved in localStorage under `resourcex.settings`. `index.html` applies the theme before first paint, so there is no flash.
- **Routes:** the road route draws itself in. It has a soft halo, a casing, a stronger line and a small glowing pulse that travels from the supplier to your site.
  - "Your site" has a ripple; the supplier pin has a white ring.
  - A chip on the map shows "183 km · about 2 h 15 min by road", "Finding the road route…" or "Road route unavailable".
  - Route maps use your default map style.
  - Paths use `pathLength=1000`, so the animation looks the same at every zoom.
- **Homepage motion** (`components/home/motion.tsx`):
  - staggered hero entrance;
  - fade-and-slide reveals (up, left or right, with stagger for lists and impact numbers);
  - photos settle from a slight zoom, with a light parallax on the problem photo;
  - numbers count up once;
  - the product map's routes draw in, then pulse, and the order card slides up and its bar fills;
  - the nav is fixed and turns solid on scroll, with a lime reading-progress bar and the current section highlighted.

**Why**
- Team feedback: the filter area was cluttered, there was no way to switch to dark mode, the route looked primitive, and the landing page felt static.

**Files**
- New: `components/ui/MultiSelect.tsx`, `components/ui/Switch.tsx`, `state/settings.ts`, `pages/Settings.tsx`, `components/home/motion.tsx`.
- Changed: `FilterBar`, `state/store.ts` (`setMaterials`, `resetFilters`, `filterDefaults` from settings), `TopBar`, `App.tsx`, `main.tsx`, `index.html`, `RouteMap`, `Marketplace`, `pages/Home.tsx`, `styles/app.css`, `styles/home.css`.

**Rules**
- All motion stops under the device's reduced-motion setting and under Settings → Reduce animations (`:root[data-motion="reduced"]`). In JS, check `prefersReducedMotion()`.
- Reveals only hide content that starts below the fold, and there is a 4 s fallback, so nothing stays hidden.

**Open items**
- Settings are per browser. Move them to the account once the backend has auth (`AUTH.md`).
- Notification switches don't send anything yet.
- The animated route was checked with a stubbed routing response (the sandbox blocks OSRM). Check it against the real service in a local browser.

---

## 2026-10-03: Road routes, plain-language units, rankings instead of scores, new inputs

**What**
- **Road routes.** `lib/routing.ts` asks the public OSRM server for a driving route (no key, cached per pair, 8 s timeout). `RouteMap` draws it as a lime line with a dark casing and a tooltip (km and drive time); while loading or if routing fails it shows a grey dashed straight line. The listing page uses the real road distance and drive time ("about 1 h 50 min"), and the freight estimate uses that distance.
- **Rankings, no scores.** `lib/ranking.ts` ranks the listings on screen: an overall position ("#3 of 22") plus a position on Material, Distance, Price and Reliability, with relative bars. Ties share a position. The order uses the backend `matchScore` when every listing has one, otherwise a 30/25/20/15 weighting. Map cards (`ListingCard` + `RankBars`), map tooltips, the listing page ("Ranked #3 of 22 suppliers on your map") and Sourcing ranked cards all show positions. "Sort: Best match" is now "Best ranked". A short legend above the list explains the ranking.
- **Plain units.** No "t", "t/fn", "A$/t" or "mo" anywhere: helpers `tonnes`, `volume`, `aud`, `per` and `PRICE_NOTE` ("All prices are in Australian dollars (AUD), excluding GST.") in `lib/format.ts`. Backend reason strings pass through `plainReason`.
- **"Newly sourced"** replaces "virgin" in all UI copy (`belowVirgin` → `belowNew`).
- **NumberField** (`components/ui/NumberField.tsx`) replaces every `type="number"` input. You can clear it (no more forced 0), leading zeros are dropped, min/max are applied on blur, units show inside the field.
- **Select** (`components/ui/Select.tsx`) replaces every native `<select>`: button + listbox, check on the selected option, optional hint and colour dot, keyboard (arrows, Home/End, Enter, Esc, type-ahead), flips up near the bottom of the screen.

**Why**
- Team feedback: straight lines looked wrong, abbreviations confuse non-technical buyers, "virgin" reads oddly, number fields were broken after backspace, native dropdowns looked primitive, and a match score number means little; a position does.

**Files**
- New: `lib/routing.ts`, `lib/ranking.ts`, `hooks/useRoute.ts`, `components/ui/Select.tsx`, `components/ui/NumberField.tsx`, `components/listings/RankBars.tsx`.
- Changed: `lib/format.ts`, `RouteMap`, `MarketMap`, `ListingCard`, `FilterBar`, `LogisticsEstimate`, `EnquiryForm`, `CombinePlanner`, `useListings`, pages `Marketplace`, `ListingDetail`, `Matches`, `MyListings`, `SellNew`, `Auth`, `Impact`, `Home`, mock `scoring.ts`, `styles/app.css`.
- Docs: `CLAUDE.md` (new components, unit and wording rules), `API_CONTRACT.md` (`matchScore` only orders).

**Open items**
- OSRM's demo server is fair use only, with no uptime promise. Before launch, use a hosted router (self-hosted OSRM, Valhalla, GraphHopper or Mapbox) or route on the backend.
- The sandbox blocks OSRM, so the routed line was only checked as the fallback here. Check it in a local browser.
- Overall positions are relative to what is on screen (filters change them). If the backend wants absolute ranks, add them to the contract.

---

## 2026-10-03: "Data and guidance from" logo strip on the homepage

**What**
- New `components/home/PartnerStrip.tsx`, placed directly under the hero. It is a slowly scrolling logo strip (CSS marquee, 40 s loop) headed "Data and guidance from". It shows:
  - ABN Lookup: business verification.
  - ACCC: consumer law guidance.
  - DCCEEW: National Waste Policy.
- It pauses on hover and shows a static, centred row under reduced motion. Duplicate copies are hidden from screen readers.
- A note under the strip says the logos do not imply endorsement.
- The logos are in `public/partners/` (WebP from the team-supplied images). `public/partners/README.md` records why each is shown and the permission needed.

**Why**
- The team asked for a moving logo carousel. The label was softened from "In compliance with" to "Data and guidance from", because ResourceX has not been assessed or approved by these bodies.

**Open items (must do before any public use)**
- The ABN Lookup and DCCEEW logos contain the Commonwealth Coat of Arms, which needs permission from the Department of the Prime Minister and Cabinet. The ACCC logo needs ACCC permission. Without permission, replace the strip with text-only references.
- The supplied logos are small (max 1106 px wide). They are shown at 56 px high, so they look sharp, but get official vector versions if permission is granted.

---

## 2026-10-03: Real photos on the homepage

**What**
- Four team-supplied photos are in `public/images/` as WebP (max 1600 px wide); credits are in `public/images/CREDITS.md`.
- `pages/Home.tsx` `Photo` now renders a real image (lazy-loaded, explicit size, descriptive alt text) instead of a placeholder:
  - The problem: `scrap-yard.webp`.
  - Step 1 List: `sorting-line.webp`.
  - Step 2 Match: `copper-granules.webp`.
  - Step 3 Deliver: `truck.webp`.
- There are 6 photo slots and 4 photos, so the two "Who it's for" cards drop their photo band and get a brand icon tile (Recycle and Factory) instead of repeating images.
- Step photos zoom slightly on hover (off under reduced motion). Placeholder-label styles were removed from `styles/home.css`.

**Why**
- The team supplied photos to replace the placeholders.

**Open items**
- Confirm the licence and credit for each photo before a public launch (see `CREDITS.md`). The truck photo looks like an overseas highway, so swap it for an Australian one if available.
- `scrap-yard.webp` is about 340 KB because the image is very detailed. It lazy-loads below the fold.

---

## 2026-10-03: Sign-up saves the business to the database

**What**
- `/signup` has a new section, "What you sell" (sellers) or "What you need" (buyers), with the fields the backend tables need:
  - **Seller → `producers` row:** output material, output grade, input materials processed, tonnes/month, price A$/t, compliance (Cert A–E, the dataset's tags), website.
  - **Buyer → `manufacturers` row:** required material, grade required, what they make (optional), tonnes/month, total budget (A$, excl. freight), order-by and deliver-by dates, website.
- On submit:
  1. Checks the email is free (`AuthClient.isEmailAvailable`).
  2. Saves the business with `api.createListing`.
  3. Creates the login.
- A taken email or a backend error stops the sign-up before anything is written. With the API on, the materials are the five in the dataset (`DATASET_MATERIALS`).
- New sellers now land on My listings (the "already signed in" redirect was firing first).
- `client.ts` shows the backend's `{ error }` message instead of only the status code.
- `Listing` gains optional `availableFrom`, `availableTo`, `budgetAud`, `orderBy` and `deliverBy`, which the backend already returns.

**Why**
- New producers and manufacturers should exist in the database the moment they register, so the map and the matching model include them.

**Files**
- `src/pages/Auth.tsx`
- `src/auth/types.ts`, `mockAuth.ts`, `AuthProvider.tsx`
- `src/api/client.ts`, `types.ts`
- `src/lib/materials.ts`
- `src/styles/app.css`
- `API_CONTRACT.md`, `AUTH.md`

**Open items**
- Accounts are still browser-only. A buyer's own requirement isn't shown to them yet, because buyers see supply only.
- One sign-up creates one listing; sellers add more from List material.

---

## 2026-10-03: ResourceX brand, login, buyer/seller views, homepage

**What**
- **Rebrand:** CircuLink is now **ResourceX**, using the team's logo.
  - The logo is in `public/brand/`:
    - `logo-full.webp`: the original;
    - `logo-mark.png`: the infinity mark keyed to a transparent background;
    - `favicon.png`.
  - `components/brand/Logo.tsx` shows the mark with a live-text wordmark ("ReSource" plus a lime "X", in Montserrat 700).
  - The palette now follows the logo: brand green `#10251A`, lime accent `#A8CF6A` with dark text on buttons, and `#4F7A26` for accent text on light backgrounds. The tokens are in `styles/tokens.css`; material colours are unchanged.
- **Login** (`src/auth/`, `pages/Auth.tsx`):
  - `/login` takes email and password and has one-click demo buyer and demo seller accounts.
  - `/signup` has a role chooser (buyer or seller), business name, ABN, name, site (from `lib/places.ts`), email and password.
  - Accounts are browser-only for now. `AUTH.md` explains how to move them to the backend.
- **Role-based app:**
  - **Buyers** see Supply map · Sourcing · Impact.
  - **Sellers** see Buyer requests · My listings · Impact.
  - The Buy/Sell toggle and the top "List material" button are gone.
  - `RequireAuth` guards the routes, and the listing page refuses the other side's listings.
  - New `/my-listings` page shows the seller's listings, matched on ABN, with a "List material" button.
  - `/sell/new` is prefilled from the account, including its ABN.
- **Site per account:** `useSite()` replaces the `HOME_SITE` constant in the map, listings, sourcing, the listing page and the enquiry text. `HOME_SITE` remains only as the demo buyer's site and as a fallback.
- **Homepage** (`/`, `pages/Home.tsx`, `styles/home.css`):
  - Centred nav; "Log in / Get started", or "Go to dashboard" when signed in.
  - The hero has no photo: brand green with an animated dot-wave field (`components/brand/DotField.tsx`, a canvas that pauses offscreen and stays still under reduced motion).
  - Sections: the problem (with sources), how it works, the platform (an animated NSW map of sample suppliers), who it's for, impact, and a closing call to action. Section photos are labelled placeholders until stock photos can be downloaded.
- **Routes:**
  - Public: `/`, `/login`, `/signup`.
  - Signed in: `/marketplace`, `/listing/:id`, `/impact`, `/sourcing` (buyer only), `/my-listings` and `/sell/new` (seller only).
  - `/matches` redirects to `/sourcing`.
- **Demo-mode listings** created by sellers are kept in `localStorage`, so they survive a reload.

**Why**
- The team supplied the ResourceX logo and asked for a public homepage, a login, and separate buyer and seller experiences.

**Backend hand-off**
- No API changes. "My listings" uses the `abn` field that `GET /listings` already returns.
- `AUTH.md` proposes `/auth/*` endpoints and an `accounts` table for real login.

**Open items**
- Real auth on the backend (see `AUTH.md`). Demo passwords use SHA-256 in `localStorage` and are not secure.
- Swap the homepage photo placeholders for licensed stock photos once the environment allows `unsplash.com` and `images.unsplash.com`.
- Sellers can't edit or pause listings yet; that needs `PATCH /listings/{id}` on the backend.

---

## 2026-10-03: Live backend and model-based matching

**What**
- The UI now runs against the real backend (`backend/app`, SQLite) when `VITE_API_URL` is set. The NSW dataset has 63 producers (supply) and 61 manufacturers (demand).
- Matching on the Sourcing page comes from the tender matching model (`API/scrap_model_api.py`) through the backend:
  - **Combine suppliers** calls the new `POST /orders/plan`. The model returns up to 3 alternative splits. Option chips switch between them; the split stays editable by hand as before. When no split is possible, the model's reason is shown, e.g. "Insufficient compatible inventory".
  - **Ranked suppliers**: suppliers the model rules out are dimmed with its reason, e.g. "grade mismatch". Suppliers in its cheapest combined order get a "Best combined order" tag.
- New materials: `brass` (Br) and `alloys` ("Stainless & alloys", Ss). New `GradeKey` type and `GRADES` labels in `lib/materials.ts`.
- With the API on:
  - The Sourcing form asks for a grade (High quality, Medium quality, Short use, or any) instead of minimum purity.
  - Default quantities follow the real dataset.
  - The material list shows only materials that have data.
- **Budget is now material only (excl. freight)** in both modes. It matches the model and the backend's `budget_aud`. Freight is still estimated per line and shown in landed cost.
- "Lowest landed cost" strategy renamed "Lowest cost".
- List material (API mode): ABN field (required, 11 digits), and grade is a select of the three backend grades.

**Why**
- Matching was a placeholder formula in the browser; the team's model now decides eligibility and the optimal split.

**Files**
- `src/api/types.ts`, `client.ts`, `mock/mockApi.ts`
- `src/lib/materials.ts`, `sourcing.ts`
- `src/components/sourcing/CombinePlanner.tsx`
- `src/pages/Matches.tsx`, `SellNew.tsx`
- `API_CONTRACT.md`

**Open items**
- Brass shares an ochre hue with paper; the codes (Br / Pa) tell them apart, and the live data has no paper yet.
- The model has no emissions objective; "Lowest freight emissions" plans by cost when the API is on (a notice says so).
- Locations without a published facility are suburb centres (`locationApprox`); the UI doesn't flag them yet.

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
