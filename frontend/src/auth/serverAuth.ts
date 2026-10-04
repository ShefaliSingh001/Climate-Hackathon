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

  // The backend saves the business and the login in one transaction and answers 409 for a taken email.
  isEmailAvailable: async () => true,

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
