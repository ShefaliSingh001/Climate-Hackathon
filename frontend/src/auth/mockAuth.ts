// Browser-only accounts for the demo. Nothing leaves the browser; passwords are hashed before storing.
// Replace with a server implementation of AuthClient when the backend adds auth (see AUTH.md).
import type { Account, AuthClient, Role, SignUpInput } from './types';
import { HOME_SITE } from '../lib/regions';

const ACCOUNTS_KEY = 'resourcex.accounts';
const SESSION_KEY = 'resourcex.session';

// ABNs starting 99000 are placeholders, not real businesses.
export const DEMO_ACCOUNTS: Record<Role, Account> = {
  buyer: {
    id: 'demo-buyer', email: 'buyer@demo.resourcex.au', name: 'Alex Morgan', company: 'Westlink Cable Co.',
    abn: '99000000001', role: 'buyer', site: HOME_SITE, demo: true,
  },
  seller: {
    id: 'demo-seller', email: 'seller@demo.resourcex.au', name: 'Sam Taylor', company: 'Hunter Copper Reclaim',
    abn: '99000000002', role: 'seller', demo: true,
    site: { name: 'Hunter Copper Reclaim', suburb: 'Kooragang', state: 'NSW', lat: -32.87, lng: 151.76 },
  },
};

interface Stored { account: Account; hash: string }

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked (private mode): the session lasts until reload.
  }
}

async function hash(text: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

let session: Account | null = read<Account | null>(SESSION_KEY, null);
const setSession = (a: Account | null) => { session = a; write(SESSION_KEY, a); };

export const mockAuth: AuthClient = {
  current: () => session,

  async signIn(email, password) {
    const users = read<Stored[]>(ACCOUNTS_KEY, []);
    const found = users.find(u => u.account.email.toLowerCase() === email.trim().toLowerCase());
    if (!found || found.hash !== (await hash(password))) throw new Error('Email or password is incorrect.');
    setSession(found.account);
    return found.account;
  },

  async signInDemo(role) {
    setSession(DEMO_ACCOUNTS[role]);
    return DEMO_ACCOUNTS[role];
  },

  async signUp(input: SignUpInput) {
    const users = read<Stored[]>(ACCOUNTS_KEY, []);
    const email = input.email.trim().toLowerCase();
    if (users.some(u => u.account.email === email) || Object.values(DEMO_ACCOUNTS).some(d => d.email === email)) {
      throw new Error('An account with this email already exists. Log in instead.');
    }
    const account: Account = {
      id: `acc-${Date.now()}`, email, name: input.name.trim(), company: input.company.trim(),
      abn: input.abn.replace(/\s/g, ''), role: input.role, site: { ...input.site, name: input.company.trim() },
    };
    write(ACCOUNTS_KEY, [...users, { account, hash: await hash(input.password) }]);
    setSession(account);
    return account;
  },

  async signOut() {
    setSession(null);
  },
};
