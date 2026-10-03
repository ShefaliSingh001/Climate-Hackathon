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
| `material` | `copper` `aluminium` `steel` `plastics` `paper` `glass` `ewaste` |
| `tonnes` + `frequency` | tonnes per `Weekly` / `Fortnightly` / `Monthly` period |
| `priceAud` | asking price (supply) or the most the buyer pays (demand) |
| `virginPriceAud` | indicative price of the virgin equivalent; `null` if not comparable |
| `purity` | percent; `null` = assay on request |
| `matchScore` | optional 0–100 fit for the requesting site; the card hides the badge when absent |

## Endpoints

| Method & path | Body / query | Returns |
| --- | --- | --- |
| `GET /listings?kind=supply&lat=-33.847&lng=150.9` | `lat`/`lng` = requesting site, used for `matchScore` | `Listing[]` |
| `GET /listings/{id}` | | `Listing` |
| `POST /listings` | `Listing` without `id`, `verified`, `monthsOnPlatform`, `matchScore` | created `Listing` |
| `POST /listings/{id}/enquiries` | `{ "tonnesPerMonth": 30, "firstDelivery": "November 2026", "message": "..." }` | `{ "id": "...", "status": "sent" }` |
| `POST /matches` | `MatchRequest` (below) | `MatchResult[]`, best first |
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
- **Combined order** (`src/lib/sourcing.ts`): from material, min purity, tonnes per month, budget (A$ per month including freight), site, max partners, verified-only and strategy (`cost` | `fewest` | `emissions`), it produces lines of `{ listing, tonnes, freight, materialCost, total, landedPerTonne }` plus totals, shortfall and budget left. A future `POST /orders/plan` could return the same.
