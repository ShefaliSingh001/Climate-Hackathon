# ResourceX frontend

React + Vite + TypeScript UI for the ResourceX recycled-materials marketplace (Australia, NSW first).

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
| `/` | Public homepage: what ResourceX does, for buyers and sellers. Log in / Get started, or Go to dashboard when signed in |
| `/login`, `/signup` | Log in (with one-click demo buyer / seller) and create an account as a buyer or seller |
| `/marketplace` | Map + compact list. Buyers see supply, sellers see buyer requests. State picker (NSW default), material chips, sort, distance, Map / Satellite / Terrain / Dark views |
| `/listing/:id` | Full supplier page: key figures, logistics cost estimate and landed cost, material spec, route map, licences, quote form |
| `/sourcing` (buyers) | Sourcing: enter demand and budget, then combine suppliers into one order that meets volume within budget: add them from a card pop-up or let the AI suggest a split (`?material=steel`) |
| `/my-listings` (sellers) | The seller's own listings (matched on ABN) |
| `/sell/new` (sellers) | List recovered material, prefilled from the account, yard location on a map |
| `/impact` | Redirects to the homepage's Impact section (`/#impact`): 2035 outlook, this month's figures, method and sources |
| `/orders` | Order history dashboard (buyers: purchases with delivered cost; sellers: sales including joint orders): totals against the previous period, tonnes each month, material split, top partners, orders in progress and a searchable order table |
| `/collaborations` (sellers) | Team up with other recyclers on buyer requests too big for one yard: invites received (accept or decline), teams you lead (send the joint offer), and requests for your materials. Teams start from the "Team up" planner on a buyer request |
| `/settings` | Theme (system, light, dark), reduce animations, map defaults, notification switches, account details. Opened from the account menu |

## Demo accounts

On `/login`, click **Demo buyer** (Westlink Cable Co., Wetherill Park) or **Demo seller** (Hunter Copper Reclaim, Kooragang). See `AUTH.md`.

## Where things live

See `CLAUDE.md` for the folder map and conventions, `API_CONTRACT.md` for the backend shapes, and `FRONTEND_LOG.md` for the history of changes.
