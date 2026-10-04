# ResourceX

Recycled-materials marketplace for Australia (NSW first). COP31 hackathon, Green Industrialisation priority.

## Frontend (`frontend/`)

Before working on the UI, read `frontend/CLAUDE.md` and the latest entries in `frontend/FRONTEND_LOG.md`. Add a log entry after every frontend change. The frontend talks to the backend only through the shapes in `frontend/API_CONTRACT.md`.

## Backend (`backend/`)

Owned by the backend teammate. Add notes for it here (run instructions, dataset, matching model) without changing the frontend section.

- Database: **Neon Postgres in production** (when `DATABASE_URL` is set), **SQLite locally** (`backend/db/circulink.db`, committed, already loaded; rebuild with `python backend/scripts/load_db.py`). `backend/app/db.py` hides the difference; write queries once with `?` placeholders. Read `backend/README.md` first; deployment steps in `backend/DEPLOY.md`.
- Tables: `producers` (supply), `manufacturers` (demand), `accounts` + `sessions` (logins), `enquiries`, `materials` and `grades` (lookups). Grades are ranked `short_use (1) < medium (2) < high (3)`; compare `grades.rank`.
- Schema: `backend/db/schema.sql` (SQLite) and `backend/db/schema.postgres.sql` (Postgres). Change both together. The loader fills SQLite from the root `NSW_Steel_Scrap_*.xlsx` files; an empty Postgres seeds itself from that file; `backend/scripts/sync_postgres.py` pushes later changes. Only `is_synthetic` rows are replaced.
- Open every connection with `pragma foreign_keys = on`, or material and grade keys aren't enforced.
- API: `uvicorn backend.app.main:app --reload --port 8000` from the repo root; tests `pytest backend/tests` (each test runs on SQLite and on embedded Postgres). It implements `frontend/API_CONTRACT.md` plus `POST /orders/plan` and `/auth/*` (`backend/FRONTEND_HANDOFF.md` explains how the website adopts real logins). On Vercel the entrypoint is the root `app.py` with the root `requirements.txt`.
- Impact dashboard: `backend/app/impact.py` (this month, sourced CO2 factors), `forecast.py` (2035 recycled vs virgin outlook, sourced baselines and ceilings), `report.py` (Claude writes the monthly report; template without `ANTHROPIC_API_KEY`). Method and sources in `backend/README.md` → Impact dashboard. Don't tune assumptions to hit a target number.
- Dataset values (tonnages, prices, buyers) are modelled from market research: change `backend/scripts/market_dataset.py` (sources in `backend/data/MARKET_RESEARCH.md`), run it, then `load_db.py`. Running the app locally writes sessions into `backend/db/circulink.db`; rebuild or restore it before committing.
- Matching model: `API/scrap_model_api.py` (team-owned; import it, don't rewrite it). `backend/app/matching.py` adapts listings to its tender/producer shapes. Exact material + grade, certifications, availability window, exact tonnes within budget.
- Orders and seller collaborations: `backend/app/trade.py` (`GET /orders`, `/collaborations…`, tables `orders`, `collaborations`, `collaboration_members`; demo accounts get seeded history). Added from the frontend side at the team's request; see `backend/HANDOFF_ORDERS_COLLAB.md`.
