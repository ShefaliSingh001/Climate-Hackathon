# CircuLink frontend

React + Vite + TypeScript UI for the CircuLink recycled-materials marketplace (Australia, NSW first).

## Run it

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

The app runs on built-in sample data by default. To use the backend:

```bash
cp .env.example .env.local
# set VITE_API_URL=http://localhost:8000 (or wherever the API runs)
```

Other scripts: `npm run typecheck`, `npm run build`, `npm run preview`.

## Screens

| Route | What it does |
| --- | --- |
| `/` | Marketplace: state picker (NSW default), material chips, sort, distance, list + map with Map / Satellite / Terrain / Dark views |
| `/listing/:id` | Same view with the listing's detail drawer open (shareable link) |
| `/matches` | Buyer enters a requirement and gets ranked suppliers with a score breakdown |
| `/sell/new` | Seller lists recovered material, picks the yard location on a map |
| `/impact` | KPIs and the global circularity rate against the COP31 15% goal |

## Where things live

See `CLAUDE.md` for the folder map and conventions, `API_CONTRACT.md` for the backend shapes, and `FRONTEND_LOG.md` for the history of changes.
