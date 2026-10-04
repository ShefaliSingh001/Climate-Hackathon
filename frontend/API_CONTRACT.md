# API contract (frontend ⇄ backend)

The UI calls the backend only through `src/api/client.ts`. Types live in `src/api/types.ts`; this file describes the same shapes in plain JSON.

- Base URL comes from `VITE_API_URL` (e.g. `http://localhost:8000`). Empty means the UI uses the mock in `src/api/mock/`.
- All bodies are JSON. Money is **AUD per tonne**, distances are **km**, coordinates are WGS84 decimal degrees.
- Errors: any non-2xx status. The UI shows a generic "couldn't load" message, so a JSON `{ "error": "..." }` body is welcome but optional.
- CORS: allow the Vite dev origin `http://localhost:5173`.

If the backend needs a different shape, change `types.ts` + this file in the same PR and add a line to `FRONTEND_LOG.md`.

## Listing

```json
{
  "id": "s01",
  "kind": "supply",
  "company": "Hunter Copper Reclaim",
  "suburb": "Kooragang",
  "state": "NSW",
  "lat": -32.87,
  "lng": 151.76,
  "material": "copper",
  "grade": "#1 bare bright (Millberry)",
  "form": "Chopped granules",
  "tonnes": 25,
  "frequency": "Monthly",
  "priceAud": 13050,
  "virginPriceAud": 15200,
  "purity": 99.9,
  "certifications": ["EPA NSW licence", "ISO 14001"],
  "verified": true,
  "monthsOnPlatform": 14,
  "matchScore": 89
}
```

| Field | Notes |
| --- | --- |
| `kind` | `"supply"` (seller offering) or `"demand"` (buyer request) |
| `state` | `NSW` `VIC` `QLD` `SA` `WA` `TAS` `ACT` `NT` |
| `material` | `copper` `aluminium` `steel` `brass` `alloys` `plastics` `paper` `glass` `ewaste` |
| `tonnes` + `frequency` | tonnes per `Weekly` / `Fortnightly` / `Monthly` period |
| `priceAud` | asking price (supply) or the most the buyer pays (demand) |
| `virginPriceAud` | indicative price of the virgin equivalent; `null` if not comparable |
| `purity` | percent; `null` = assay on request |
| `matchScore` | optional 0–100 fit for the requesting site. The UI only uses it to **order** listings ("#3 of 22"); the number itself is never shown. Without it the UI ranks by its own factor weighting |
| `gradeKey` | optional, backend only: `high` `medium` `short_use` (the `grade` field carries the label) |
| `abn`, `website` | optional, backend only |
| `locationApprox` | optional, backend only: `true` when `lat`/`lng` is the suburb centre, not the yard |

The backend ids are `p<n>` for producers (supply) and `m<n>` for manufacturers (demand).

The UI finds a seller's own listings by comparing `abn` with the signed-in account's ABN (see `AUTH.md`), so `abn` should be present on every listing.

## Endpoints

| Method & path | Body / query | Returns |
| --- | --- | --- |
| `GET /listings?kind=supply&lat=-33.847&lng=150.9` | `lat`/`lng` = requesting site, used for `matchScore` | `Listing[]` |
| `GET /listings/{id}` | | `Listing` |
| `POST /listings` | `Listing` without `id`, `verified`, `monthsOnPlatform`, `matchScore`, plus `abn` (11 digits) and optional `website`. Backend `grade` must be `High quality`, `Medium quality` or `Short use`. Supply may add `availableFrom`/`availableTo` (default today + 90 days); demand may add `budgetAud` (total A$, default `priceAud × tonnes`), `orderBy` and `deliverBy` (ISO dates, default today and +30 days) | created `Listing` (supply → a `producers` row, demand → a `manufacturers` row) |
| `POST /listings/{id}/enquiries` | `{ "tonnesPerMonth": 30, "firstDelivery": "November 2026", "message": "..." }` | `{ "id": "...", "status": "sent" }` |
| `POST /matches` | `MatchRequest` (below) | `MatchResult[]`, best first |
| `POST /orders/plan` | `OrderPlanRequest` (below) | `OrderPlanResult` (below) |
| `GET /orders` *(login)* | none; uses the signed-in account | `Order[]`, newest first: every order where the account is the buyer or the seller (below) |
| `GET /collaborations` *(login, sellers)* | none; uses the signed-in account | `Collaboration[]` the account leads or was invited to (below) |
| `POST /collaborations` *(login, sellers)* | `{ "requestId": "m51", "members": [{ "listingId": "p44", "tonnes": 25 }, { "listingId": "p57", "tonnes": 35 }], "message": "..." }` | `201` created `Collaboration`. The caller is the lead (with 0 tonnes when none of the listings is theirs); other members start as `invited`. Members must be supply listings of the request's material, never the buyer itself |
| `POST /collaborations/{id}/respond` *(login, invited member)* | `{ "accept": true }` | updated `Collaboration` (the caller's member row becomes `accepted` or `declined`) |
| `POST /collaborations/{id}/offer` *(login, lead)* | none | updated `Collaboration` with `status: "offer_sent"`; also creates a pending joint `Order`. `409` while anyone is still `invited` or nobody has committed tonnes |
| `POST /collaborations/{id}/withdraw` *(login, lead)* | none (lead only) | updated `Collaboration` with `status: "withdrawn"` |
| `GET /impact` | | `ImpactStats` (below) |
| `POST /impact/report?refresh=true` | `refresh` optional: write a new one instead of the cached one | `ImpactReport` (below) |

The UI currently filters by state, material, distance and search text **on the client**, so `GET /listings` can return every listing of that kind. Server-side filtering can be added later without breaking the UI.

### MatchRequest

```json
{
  "material": "copper",
  "minPurity": 99,
  "tonnesPerMonth": 20,
  "maxPriceAud": 13300,
  "site": { "name": "Westlink Cable Co.", "suburb": "Wetherill Park", "state": "NSW", "lat": -33.847, "lng": 150.9 }
}
```

### MatchResult

```json
{
  "listing": { "...": "Listing" },
  "score": 93,
  "breakdown": { "material": 100, "distance": 100, "price": 76, "reliability": 86, "volume": 100 },
  "distanceKm": 5,
  "reasons": ["meets 99% purity", "5 km by road", "A$600/t under your ceiling"]
}
```

All breakdown values are 0–100. The UI shows `material`, `distance`, `price` and `reliability` as bars, and `reasons` as one line of text.

`grade` (`high` | `medium` | `short_use`, optional = any grade) and `certifications` (string array, optional) are also accepted. The backend ignores `minPurity` because the dataset grades material instead of assaying it.

`score` and `breakdown` are used for ordering and for per-factor positions ("1st nearest"); the UI shows positions, never the raw numbers. Reasons may use "/t" or "N t"; the UI spells them out as "per tonne" / "tonnes".

`MatchResult` from the backend also carries `eligible` (false when the matching model rules the supplier out; `reasons` says why and `score` is 0) and `inBestPlan` (part of the model's cheapest combined order).

### OrderPlanRequest / OrderPlanResult

Splits one monthly demand across several suppliers. The backend uses the tender matching model in `API/scrap_model_api.py`.

```json
{
  "material": "steel", "grade": "high", "minPurity": 0,
  "tonnesPerMonth": 300, "budgetAud": 95000,
  "site": { "name": "Westlink Cable Co.", "suburb": "Wetherill Park", "state": "NSW", "lat": -33.847, "lng": 150.9 },
  "maxPartners": 4, "verifiedOnly": true, "strategy": "cost"
}
```

`budgetAud` is A$ per month for the **material only**; the UI adds its freight estimate on top. `strategy` is `cost` | `fewest` | `emissions` (the model has no emissions objective yet, so the backend plans `emissions` as lowest cost and says so in `notice`).

```json
{
  "status": "feasible",
  "reason": null,
  "shortfallTonnes": null,
  "plans": [
    { "rank": 1, "supplierCount": 4, "totalCostAud": 87900, "budgetRemainingAud": 7100,
      "lines": [{ "listingId": "p10", "tonnes": 80, "priceAud": 280, "costAud": 22400, "proposedDelivery": "2026-11-01" }] }
  ],
  "eligibleCount": 18,
  "excluded": [{ "listingId": "p2", "reasons": ["Grade mismatch."] }],
  "notice": "Feasibility uses supplied values, not predicted prices. ..."
}
```

`plans` holds up to 3 alternatives, best first, each with a different set of suppliers. Every plan delivers exactly `tonnesPerMonth` within `budgetAud`. With no plan, `status` is `infeasible` and `reason` (plus `shortfallTonnes` when there isn't enough compatible stock) says why. The UI only needs `listingId` and `tonnes` from each line.

### ImpactStats

Served by the backend now (`backend/app/impact.py`, `forecast.py`) from the marketplace's producers and manufacturers. Abridged:

```json
{
  "period": "November 2026",
  "isSample": true,
  "tonnesRecirculated": 3819,
  "co2eAvoidedT": 15893.5,
  "transportCo2eT": 56.8,
  "landfillAvoidedT": 496.5,
  "moneySavedAud": 810150,
  "valueRecoveredAud": 3547320,
  "tonnesOffered": 3930,
  "tonnesRequested": 20786,
  "trades": 68,
  "producers": { "total": 63, "matched": 60 },
  "tenders": { "total": 61, "filled": 11, "partial": 9 },
  "byMaterial": [{ "material": "aluminium", "tonnes": 710, "co2eAvoidedT": 10355.5, "offeredT": 710, "requestedT": 1590 }],
  "circularity": { "globalRatePct": 6.9, "australiaRatePct": 4.3, "goalPct": 15, "globalSource": "...", "australiaSource": "...", "australiaGoal": "...", "goal": "..." },
  "factors": [{ "material": "steel", "tco2ePerT": 1.5, "source": "worldsteel: ...", "url": "https://..." }],
  "assumptions": ["Projected from the NSW demo dataset: ..."]
}
```

| Field | Notes |
| --- | --- |
| `co2eAvoidedT` | tonnes CO2e avoided by replacing virgin metal, **net** of trucking (`transportCo2eT`) |
| `landfillAvoidedT` | tonnes × 13%, the share of metal waste Australia still landfills |
| `moneySavedAud` | buyers' budget per tonne minus the price paid, × tonnes |
| `valueRecoveredAud` | paid to producers for the scrap |
| `byMaterial` | sorted by `co2eAvoidedT`, largest first; includes materials with 0 tonnes traded |
| `isSample` | `true` while figures come from the synthetic dataset; the UI shows "Sample" badges and a projection notice |
| `outlook` | 2035 outlook, below |

#### outlook

Recycled share of metal input for the manufacturers on ResourceX, per year 2026–2035: `businessAsUsualPct` (industry trends only) and one `sharePct` series per scenario (`conservative` / `expected` / `ambitious`: matched scrap grows 10 / 25 / 40% a year), capped at `ceilingPct`. Each scenario also has `extraTonnesPerYear2035` and `co2eAvoidedT` (cumulative 2026–2035). `baselines` gives each metal's sourced share today, in 2035 without CircuLink, its ceiling, and the source. `assumptions` are shown on the page as written.

### ImpactReport

```json
{
  "headline": "3,819 tonnes of NSW scrap metal matched to manufacturers in November 2026.",
  "summary": ["Paragraph one.", "Paragraph two."],
  "highlights": ["Aluminium is 19% of the tonnes but 65% of the CO2e avoided."],
  "source": "claude",
  "model": "claude-opus-5-5",
  "note": null,
  "generatedAt": "2026-10-03T05:40:00+00:00"
}
```

`source` is `"claude"` when Claude wrote it, or `"template"` when there is no API key or the call failed; `note` then says why. Claude can take ~30 s; the backend caches one report per set of numbers.

### Verification, addresses

- **Verified** means the business has an ABN on file. The backend sets `verified: true` for every listing with an 11-digit ABN; the UI also treats any 11-digit `abn` as verified (`lib/verify.ts`).
- **Addresses:** listings and sign-up sites carry an optional street `address` and 4-digit `postcode` alongside `suburb`, `state`, `lat` and `lng`. The UI geocodes the address in the browser (Photon / OpenStreetMap) and sends the pin's `lat`/`lng`; the backend stores both and returns them on listings.
- **Logins:** with `VITE_API_URL` set, the UI signs in through `/auth/*` and sends `Authorization: Bearer <token>` on every call (`src/auth/serverAuth.ts`).

### Order

```json
{
  "id": "o-10590", "ref": "RX-10590", "listingId": "s01",
  "material": "copper", "grade": "#1 bare bright (Millberry)",
  "buyer":  { "company": "Westlink Cable Co.", "suburb": "Wetherill Park", "state": "NSW" },
  "seller": { "company": "Hunter Copper Reclaim", "suburb": "Kooragang", "state": "NSW" },
  "tonnes": 14, "priceAud": 12874, "freightAud": 100, "distanceKm": 169,
  "status": "in_transit",
  "placedAt": "2026-09-21T10:00:00Z", "deliveryDate": "2026-10-01T00:00:00Z",
  "co2eAvoidedT": 44.6,
  "collaborationId": null, "partners": []
}
```

`status` is `pending` (quote or offer sent, no reply yet), `confirmed`, `in_transit`, `delivered` or `cancelled`. `priceAud` and `freightAud` are per tonne. `co2eAvoidedT` is net of trucking, using the same factors as `/impact`. A signed-in quote request or offer (`POST /listings/{id}/enquiries` with a token) also creates a `pending` order for both parties. Ids are `o<n>` and `c<n>`; `ref` is `RX-<10000 + n>`. The Orders page computes totals, monthly tonnes, material split and top partners from this list.

### Collaboration

Several sellers fill one buyer request together.

```json
{
  "id": "c-1", "requestId": "d09",
  "buyer": { "company": "Westlink Cable Co.", "suburb": "Wetherill Park", "state": "NSW" },
  "material": "copper", "tonnesNeeded": 60, "maxPriceAud": 13200,
  "members": [
    { "company": "Hunter Copper Reclaim", "suburb": "Kooragang", "state": "NSW", "abn": "99000000002", "listingId": "s01", "tonnes": 25, "priceAud": 13050, "distanceKm": 169, "status": "lead" },
    { "company": "Smithfield Cable Recovery", "suburb": "Smithfield", "state": "NSW", "abn": null, "listingId": "s02", "tonnes": 35, "priceAud": 12700, "distanceKm": 5, "status": "invited" }
  ],
  "status": "forming", "message": "Can you cover 35 tonnes a month?", "createdAt": "2026-10-04T09:00:00Z"
}
```

- `tonnesNeeded` is per month.
- Member `status` is `lead`, `invited`, `accepted` or `declined`.
- Collaboration `status` is `forming`, `offer_sent` or `withdrawn`.
- The UI matches the signed-in seller to a member by ABN, or by company name when `abn` is null.

## Computed in the browser (no endpoint yet)

These run on top of the endpoints above, so the backend does not need to provide them. If it wants to take them over later, these are the shapes:

- **Freight estimate** (`src/lib/logistics.ts`): from tonnes per month, road km, truck type and whether the truck returns empty, it produces trips, A$ per month, A$ per tonne and t CO2e. Rates are indicative.
- **Combined order totals** (`src/lib/sourcing.ts`): the split itself now comes from `POST /orders/plan` (the mock uses a greedy stand-in). The browser adds freight per line and the totals, shortfall and budget left.
