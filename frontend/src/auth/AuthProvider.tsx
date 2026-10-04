import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Site } from '../api/types';
import { HOME_SITE } from '../lib/regions';
import { useMarket } from '../state/store';
import { isMock } from '../api/client';
import { mockAuth } from './mockAuth';
import { serverAuth } from './serverAuth';
import type { Account, AuthClient, Role, SignUpInput } from './types';

interface AuthState {
  account: Account | null;
  signIn: (email: string, password: string) => Promise<Account>;
  signInDemo: (role: Role) => Promise<Account>;
  signUp: (input: SignUpInput) => Promise<Account>;
  isEmailAvailable: (email: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
// Demo mode keeps accounts in the browser; with VITE_API_URL set, logins live in the backend database.
const client: AuthClient = isMock ? mockAuth : serverAuth;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(client.current());
  const setMarket = useMarket(s => s.set);

  // Re-check a saved server session (it may have expired or been logged out elsewhere).
  useEffect(() => {
    client.refresh?.().then(setAccount);
  }, []);

  // Buyers browse supply; sellers browse buyer requests.
  useEffect(() => {
    if (account) setMarket({ mode: account.role === 'buyer' ? 'supply' : 'demand', materials: [], query: '' });
  }, [account, setMarket]);

  const value: AuthState = {
    account,
    signIn: async (e, p) => { const a = await client.signIn(e, p); setAccount(a); return a; },
    signInDemo: async r => { const a = await client.signInDemo(r); setAccount(a); return a; },
    signUp: async i => { const a = await client.signUp(i); setAccount(a); return a; },
    isEmailAvailable: e => client.isEmailAvailable(e),
    signOut: async () => { await client.signOut(); setAccount(null); },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** The signed-in account's site, used for distances, freight and matching. */
export function useSite(): Site {
  return useAuth().account?.site ?? HOME_SITE;
}

/** Sends visitors to /login, and users of the wrong role to the marketplace. */
export function RequireAuth({ role, children }: { role?: Role; children: ReactNode }) {
  const { account } = useAuth();
  const location = useLocation();
  if (!account) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (role && account.role !== role) return <Navigate to="/marketplace" replace />;
  return <>{children}</>;
}
