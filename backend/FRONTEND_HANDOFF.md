# Frontend hand-off: real accounts in the backend database

> **Done (2026-10-04):** the frontend now uses these endpoints whenever `VITE_API_URL` is set (`src/auth/serverAuth.ts`, `src/auth/token.ts`, `authApi` in `src/api/client.ts`). Demo mode still uses browser-only accounts. Kept below for reference.

**For the frontend team.** The backend now stores logins in the `accounts` table (Neon Postgres in production), and
scores listings for the signed-in account. Nothing under `frontend/` was changed. The website keeps working exactly
as it does today: sign-up still sends `POST /listings` without a login, and quote requests too. These steps switch it
to real accounts, so people can log in from any device and get personal matching.

## Endpoints

| Method & path | Body | Returns |
| --- | --- | --- |
| `POST /auth/signup` | `{ email, password, name, company, abn, role, site: { name, suburb, state, lat, lng }, listing }` | `201 { token, account }`; `409` if the email exists; `422` on invalid input |
| `POST /auth/login` | `{ email, password }` | `{ token, account }`; `401` if wrong |
| `POST /auth/demo` | `{ role: "buyer" \| "seller" }` | `{ token, account }` for the seeded demo accounts (same companies and ABNs as `DEMO_ACCOUNTS` in `mockAuth.ts`) |
| `GET /auth/me` | header `Authorization: Bearer <token>` | `account`; `401` when the session expired or was logged out |
| `POST /auth/logout` | header `Authorization: Bearer <token>` | `204` |

`password` is 8–200 characters. `listing` takes the same fields the sign-up page already builds for `POST /listings`
(material, grade, form, tonnes, frequency, priceAud, certifications, website, plus `budgetAud`, `orderBy` and
`deliverBy` for buyers). The backend saves the business (a `producers` row for a seller, a `manufacturers` row for a
buyer) and the login in **one transaction**, so a taken email or bad input saves nothing.

`account` matches `Account` in `src/auth/types.ts`, plus `listingId`:

```json
{ "id": "3", "email": "sam@smithfieldsteel.com.au", "name": "Sam", "company": "Smithfield Steel Recovery",
  "abn": "22222222222", "role": "seller",
  "site": { "name": "Smithfield Steel Recovery", "suburb": "Smithfield", "state": "NSW", "lat": -33.85, "lng": 150.94 },
  "listingId": "p64", "demo": false }
```

`listingId` is the `p…` (producer) or `m…` (manufacturer) listing created at sign-up.

**With `Authorization: Bearer <token>` on other calls:**
- `GET /listings` returns personal `matchScore`s:
  - **Buyer:** supply is ranked by the matching model against the requirement they registered.
  - **Seller:** buyer requests are ranked by whether the seller's own listing can help fill each order.
- `POST /listings` takes the business name, ABN and side from the account.
- Quote requests record who sent them.

## Suggested changes (about 150 lines)

1. **`src/auth/token.ts` (new):** keeps the session token.
2. **`src/auth/serverAuth.ts` (new):** an `AuthClient` that calls the endpoints above (code below).
3. **`src/api/client.ts`:**
   - In `http()`, send `Authorization: Bearer ${getToken()}` when there is a token.
   - Attach `res.status` to thrown errors, so a 401 can be told apart from a network error.
   - Return `undefined` for `204` responses.
   - Export `authApi = { signUp, login, demo, me, logout }`, which call the endpoints above.
4. **`src/auth/types.ts`:**
   - Add `listingId?: string | null` to `Account`.
   - Add `listing?: NewListing` to `SignUpInput`.
   - Add an optional `refresh?(): Promise<Account | null>` to `AuthClient`.
5. **`src/auth/AuthProvider.tsx`:**
   - Use `const client = isMock ? mockAuth : serverAuth`.
   - On mount, call `client.refresh?.()` and store the result. This re-checks the session with `/auth/me`.
6. **`src/pages/Auth.tsx` (sign-up):** replace the two steps (`api.createListing(listing)`, then `signUp(...)`) with
   one call, `signUp({ ...form, abn, role, site, listing })`. In `mockAuth.signUp`, call
   `mockApi.createListing(input.listing)` so demo mode behaves the same.
7. **`src/hooks/useListings.ts`:** add the account id to the `useAsync` dependencies, because scores now depend on
   who is signed in.

**Optional:**
- **Sourcing:** start from the buyer's registered requirement. `api.getListing(account.listingId)` returns
  `material`, `gradeKey`, `tonnes` and `budgetAud`.
- **Combine suppliers:** default "Verified only" to off. Businesses that just registered aren't verified (nothing
  checks them against ABN Lookup yet), so with it on they never appear in combined orders.

### `src/auth/token.ts`

```ts
// The backend session token (server login only). Kept apart from AuthProvider so the API client can read it.
const TOKEN_KEY = 'resourcex.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked (private mode): the session lasts until reload.
  }
}
```

### `src/auth/serverAuth.ts`

```ts
// Accounts stored in the backend database (POST /auth/*), used whenever VITE_API_URL is set.
// The session token lives in localStorage; the account is cached next to it so the app can render before /auth/me answers.
import { authApi } from '../api/client';
import type { Account, AuthClient, Role, SignUpInput } from './types';
import { getToken, setToken } from './token';

const ACCOUNT_KEY = 'resourcex.serverAccount';

function readAccount(): Account | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    return raw && getToken() ? (JSON.parse(raw) as Account) : null;
  } catch {
    return null;
  }
}

function save(token: string | null, account: Account | null) {
  setToken(token);
  try {
    if (account) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    else localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    // Storage blocked: the session lasts until reload.
  }
  return account;
}

let cached = readAccount();

const signedIn = ({ token, account }: { token: string; account: Account }) => {
  cached = save(token, account);
  return account;
};

export const serverAuth: AuthClient = {
  current: () => cached,

  signIn: async (email, password) => signedIn(await authApi.login(email, password)),

  signInDemo: async (role: Role) => signedIn(await authApi.demo(role)),

  signUp: async (input: SignUpInput) => signedIn(await authApi.signUp(input)),

  async signOut() {
    try {
      await authApi.logout();
    } finally {
      cached = save(null, null);
    }
  },

  async refresh() {
    if (!getToken()) return (cached = save(null, null));
    try {
      return (cached = save(getToken(), await authApi.me()));
    } catch (err) {
      // Only a rejected token logs the user out; a network blip keeps the cached account.
      if ((err as Error & { status?: number }).status === 401) cached = save(null, null);
      return cached;
    }
  },
};
```

## After the switch

Once every write sends a token, the backend can require a login: in `backend/app/main.py`, change
`optional_account` to `require_account` in `create_listing` and `send_enquiry`.

## Try it locally

```bash
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload --port 8000   # http://localhost:8000/docs lists every endpoint
```

Then set `VITE_API_URL=http://localhost:8000` in `frontend/.env.local`.
