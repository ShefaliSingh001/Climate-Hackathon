# CircuLink

Recycled-materials marketplace for Australia (NSW first). COP31 hackathon, Green Industrialisation priority.

## Frontend (`frontend/`)

Before working on the UI, read `frontend/CLAUDE.md` and the latest entries in `frontend/FRONTEND_LOG.md`. Add a log entry after every frontend change. The frontend talks to the backend only through the shapes in `frontend/API_CONTRACT.md`.

## Backend (`backend/`)

Owned by the backend teammate. Add notes for it here (run instructions, dataset, matching model) without changing the frontend section.

- Database is SQLite: `backend/db/circulink.db` (not committed). Build it with `python backend/scripts/load_db.py`. Read `backend/README.md` first.
- Tables: `producers` (supply), `manufacturers` (demand), `materials` and `grades` (lookups). Grades are ranked `short_use (1) < medium (2) < high (3)`; compare `grades.rank`.
- Schema: `backend/db/schema.sql`. The loader fills it from the root `NSW_Steel_Scrap_*.xlsx` files and only replaces `is_synthetic = 1` rows.
- Open every connection with `pragma foreign_keys = on`, or material and grade keys aren't enforced.
