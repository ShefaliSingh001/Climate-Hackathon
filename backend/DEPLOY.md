# Deploy the backend and database on Vercel (Neon Postgres)

The website (`frontend/`) is already a Vercel project. The backend becomes a **second Vercel project from the same
repo**, with a Neon Postgres database attached. Afterwards, everything people do on the live site (sign-ups, logins,
listings, quote requests) is saved in Neon and shared by every visitor.

```
Browser ──> climate-hackathon-zeta.vercel.app  (website, Vercel project 1, root: frontend/)
              │  VITE_API_URL
              ▼
            <backend>.vercel.app              (API, Vercel project 2, root: repo root, entry: app.py)
              │  DATABASE_URL
              ▼
            Neon Postgres                     (producers, manufacturers, accounts, sessions, enquiries)
```

It takes about 15 minutes. You need to be an owner of the Vercel team the website lives in.

## 1. Create the backend project

1. In Vercel, **Add New… → Project**, and import the same GitHub repo (`ShefaliSingh001/Climate-Hackathon`).
2. **Root Directory:** leave it as the repo root (`./`). Don't pick `frontend`.
3. **Framework Preset:** FastAPI. Vercel should detect it from `requirements.txt` and `app.py`; pick it by hand if not.
4. Deploy. The first deploy fails or shows errors on database pages until step 2 is done. That's expected.

## 2. Add the database

1. Open the backend project → **Storage → Create Database → Neon (Serverless Postgres)**. Pick the Sydney region
   (`aws-ap-southeast-2`) if offered, and the free plan.
2. Connect it to the backend project for **Production and Preview**. This adds `DATABASE_URL` (and `POSTGRES_URL`) to
   the project's environment variables. Leave them as they are.

You don't create any tables yourself. On the first request the API creates them and copies in the 63 producers and 61
manufacturers from `backend/db/circulink.db`, plus the two demo logins.

## 3. Let the website call the backend

In the backend project → **Settings → Environment Variables**, add:

| Name | Value |
| --- | --- |
| `CORS_ORIGINS` | `https://climate-hackathon-zeta.vercel.app` |
| `CORS_ORIGIN_REGEX` | `https://climate-hackathon-.*\.vercel\.app` (optional: also allows preview deployments) |

Then **Deployments → ⋯ → Redeploy** the latest deployment.

Check it: open `https://<backend>.vercel.app/health`. You should see
`{"status":"ok","database":"postgres","producers":63,"manufacturers":61,"accounts":2}`.
`https://<backend>.vercel.app/docs` lists every endpoint.

## 4. Point the website at the backend

In the **website** project → **Settings → Environment Variables**, add `VITE_API_URL` = `https://<backend>.vercel.app`
(no trailing slash) for Production and Preview, then redeploy the website. Vite bakes the value in at build time, so
the redeploy is required.

Check it: on the live site, sign up as a new seller. The supply map should show real NSW businesses, not
"Demo mode", and `/health` should now show 64 producers. The new business is in the shared database, so every
visitor sees it and the matching uses it.

Logins from any device need one more step on the website side: switching its sign-up and login to `/auth/*`,
described in [`FRONTEND_HANDOFF.md`](FRONTEND_HANDOFF.md). Until then, the website keeps logins in each browser.
Once it's done, `/health` also counts the new accounts.

## Updating the dataset later

When the spreadsheets change:

```bash
python backend/scripts/load_db.py                               # rebuild backend/db/circulink.db
DATABASE_URL='postgresql://…' python backend/scripts/sync_postgres.py
```

Copy `DATABASE_URL` from the backend project's environment variables, or from the Neon console. Only dataset rows
are updated; users' accounts, listings and quote requests are kept.

## If something goes wrong

- **`/health` shows `"database":"sqlite"`:** `DATABASE_URL` isn't set for that environment. Re-check step 2, then redeploy.
- **The website still says "Demo mode":** `VITE_API_URL` was added after the last website build. Redeploy the website.
- **The browser console shows CORS errors:** `CORS_ORIGINS` must match the website's address exactly (https, no
  trailing slash). Redeploy the backend after changing it.
- **The deploy fails on function size:** the matching model needs `numpy` and `scipy` (about 250 MB installed). That
  is within Vercel's limit for Python, but if your plan's limit is lower, host the same code on Render or Railway
  instead: start command `uvicorn app:app --host 0.0.0.0 --port $PORT`, with the same environment variables.
- **`/health` shows 0 producers:** the seeding couldn't read `backend/db/circulink.db`. Run the sync script above once
  from your computer.

## Security notes

- Passwords are stored only as salted PBKDF2-SHA256 hashes. Session tokens are random, and only their SHA-256 hash
  is stored. Sessions last 30 days, and logging out deletes the session.
- Signed-in requests to create listings use the account's business name and ABN. Requests without a login still
  work, as the current website needs them to; once the website uses `/auth/*`, they can be switched to require a
  login (change `optional_account` to `require_account` in `create_listing` and `send_enquiry`).
- Reading listings and matching are public, as on the marketplace.
- There's no email verification, password reset or rate limiting on logins yet. That's fine for the hackathon demo,
  not for real customers.
