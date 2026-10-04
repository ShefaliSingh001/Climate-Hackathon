import type { NewListing, Site } from '../api/types';

/** Buyers (manufacturers) see supply; sellers (recyclers, producers) see buyer requests and their own listings. */
export type Role = 'buyer' | 'seller';

export interface Account {
  id: string;
  email: string;
  name: string;
  company: string;
  /** 11 digits. Sellers' own listings are matched on ABN. */
  abn: string;
  role: Role;
  site: Site;
  demo?: boolean;
  /** The listing created at sign-up ('p12' supply / 'm7' request), when the backend knows it. */
  listingId?: string | null;
}

export interface SignUpInput {
  email: string;
  password: string;
  name: string;
  company: string;
  abn: string;
  role: Role;
  site: Site;
  /** The business's first listing; the backend saves it with the login in one transaction. */
  listing?: NewListing;
}

/** Swap the mock for a server implementation by providing the same interface (see AUTH.md). */
export interface AuthClient {
  current(): Account | null;
  signIn(email: string, password: string): Promise<Account>;
  signInDemo(role: Role): Promise<Account>;
  signUp(input: SignUpInput): Promise<Account>;
  /** Checked before sign-up writes the business to the database, so a taken email leaves nothing behind. */
  isEmailAvailable(email: string): Promise<boolean>;
  signOut(): Promise<void>;
  /** Re-checks the session with the server (server login only). */
  refresh?(): Promise<Account | null>;
}
