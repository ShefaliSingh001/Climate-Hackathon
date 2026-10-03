# Accounts and login

## How it works today (demo)

Login runs entirely in the browser (`src/auth/mockAuth.ts`). Nothing is sent to the backend.

- **Demo accounts:** two one-click accounts on `/login`:

  | Role | Company | Site | ABN |
  | --- | --- | --- | --- |
  | Buyer | Westlink Cable Co. | Wetherill Park NSW | `99000000001` |
  | Seller | Hunter Copper Reclaim | Kooragang NSW | `99000000002` |

  ABNs starting `99000` are placeholders, not real businesses.
- **Sign-up:** creates an account in `localStorage` (key `resourcex.accounts`). The password is SHA-256 hashed first. This is for demos only and is not secure storage.
- **Session:** stored under `resourcex.session`.
- **Listings created in demo mode:** kept under `resourcex.createdListings`.

## Roles

| | Buyer (manufacturer) | Seller (recycler / producer) |
| --- | --- | --- |
| Map (`/marketplace`) | supply listings | buyer requests (tenders) |
| Listing page | supply listings | buyer requests, plus their own supply listings |
| Extra pages | `/sourcing` (ranked + combined orders) | `/my-listings`, `/sell/new` |

- **Guards:** `RequireAuth` in `src/auth/AuthProvider.tsx` enforces these. Visitors who aren't signed in go to `/login?next=…`, and the wrong role goes to `/marketplace`.
- **Ownership:** a seller's own listings are found by **ABN**: `listing.abn === account.abn`. The backend already returns `abn` on every listing, so "My listings" works against the real API with no new endpoint.

## Moving login to the backend

The UI only talks to auth through the `AuthClient` interface in `src/auth/types.ts`. To use real accounts, add a client that calls the FastAPI backend and swap it in at the top of `AuthProvider.tsx` (`const client = …`). Suggested endpoints:

| Method & path | Body | Returns |
| --- | --- | --- |
| `POST /auth/signup` | `{ email, password, name, company, abn, role, site: { suburb, state, lat, lng } }` | `{ token, account }` |
| `POST /auth/login` | `{ email, password }` | `{ token, account }` |
| `GET /auth/me` | header `Authorization: Bearer <token>` | `account` |
| `POST /auth/logout` | | `204` |

`account` has the same shape as `Account` in `src/auth/types.ts`: `id, email, name, company, abn, role, site`.

**Suggested table** (SQLite, alongside `producers` and `manufacturers`):

```sql
create table accounts (
  id            integer primary key,
  email         text not null unique,
  password_hash text not null,          -- bcrypt or argon2, never plain SHA-256
  name          text not null,
  company       text not null,
  abn           text not null check (abn glob '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
  role          text not null check (role in ('buyer', 'seller')),
  locality      text not null,
  state         text not null,
  lat           real not null,
  lng           real not null,
  created_at    text not null default (datetime('now'))
);
```

Once that exists, `POST /listings` should take the seller's ABN from the session instead of the form.
