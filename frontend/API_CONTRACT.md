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
| `GET /impact` | | `ImpactStats` (below) |

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

```json
{
  "tonnesRecirculated": 14820,
  "co2eAvoidedT": 21460,
  "activeVerifiedSites": 212,
  "matchesConverted": 146,
  "byMaterial": [{ "material": "steel", "tonnes": 7400 }],
  "isSample": true
}
```

Set `isSample: false` once the numbers come from real trades; the UI then drops the "Sample" badges.

## Computed in the browser (no endpoint yet)

These run on top of the endpoints above, so the backend does not need to provide them. If it wants to take them over later, these are the shapes:

- **Freight estimate** (`src/lib/logistics.ts`): from tonnes per month, road km, truck type and whether the truck returns empty, it produces trips, A$ per month, A$ per tonne and t CO2e. Rates are indicative.
- **Combined order totals** (`src/lib/sourcing.ts`): the split itself now comes from `POST /orders/plan` (the mock uses a greedy stand-in). The browser adds freight per line and the totals, shortfall and budget left.
