# Hand-off: orders, collaborations, verification and addresses (backend)

**For the backend owner.** These backend changes were made from the frontend side, at the team's request, so the new website pages work against the real API. They follow the existing patterns (both schemas, `db.py` adapter, `{ "error": ... }` responses, tests on SQLite and Postgres). Please review them like any other PR.

## What changed

| Area | Change |
| --- | --- |
| Schema (both files) | New tables `orders`, `collaborations`, `collaboration_members`. Only new tables, so existing SQLite files and Neon pick them up on the next cold start; no migration needed |
| `app/trade.py` (new) | Orders and collaborations logic, freight per tonne (same truck rates as the frontend), CO2e avoided (`impact.py` factors minus trucking), demo seeding |
| `app/main.py` | `GET /orders`, `GET/POST /collaborations`, `/collaborations/{id}/respond`, `/offer`, `/withdraw`. Signed-in enquiries also create a pending order (the response is unchanged). `Site` and `NewListing` accept `address` and `postcode` |
| `app/listings.py` | `verified` = an 11-digit ABN is on file (was: ABN Lookup entity found). `address` and `postcode` are returned |
| `app/db.py` | Calls `trade.seed_demo_activity()` after the demo accounts (runs once; Postgres uses advisory lock 4243) |
| `tests/test_trade.py` | 8 tests × 2 engines: login required, demo history, enquiry → order, invites, team → offer → joint order, rules, verification, address |

`pytest backend/tests`: 68 passed (SQLite and embedded Postgres).

## Things to check

- **Verified rule.** The team decided "verified = has an ABN". Every dataset row has one, so every listing is now verified, which also lifts the reliability part of match scores evenly. If you'd rather keep "found on ABN Lookup", change the one line in `listings.py`.
- **Order status** never moves past `pending` yet. A confirm / dispatch / deliver endpoint is the natural next step once real trades happen.
- **Demo seeding** writes to whichever database the app opens. Locally that is the committed `backend/db/circulink.db`, the same as the demo accounts already do, so don't commit it after running the app.
- **Model's producer mode.** `API/scrap_model_api.py` has `/collaborate` (anchor producer). The website's "Suggest partners" currently uses nearest suppliers; it could call the model instead via a small `POST /collaborations/suggest`.

## Try it

```bash
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload --port 8000
# frontend/.env.local: VITE_API_URL=http://localhost:8000, then npm run dev in frontend/
```

Log in as the demo buyer (Orders shows the seeded history; request a quote and it appears as pending) or the demo seller (Collaborations shows two invites; open a copper buyer request and use "Team up with other recyclers").
