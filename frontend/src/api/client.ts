// Single entry point for all backend calls. Set VITE_API_URL to use the real API;
// leave it empty to run on the built-in mock data. See API_CONTRACT.md.
import type { Enquiry, ImpactStats, Listing, ListingKind, MatchRequest, MatchResult, NewListing, OrderPlanRequest, OrderPlanResult, Site } from './types';
import { mockApi } from './mock/mockApi';

export interface Api {
  listListings(kind: ListingKind, site: Site): Promise<Listing[]>;
  getListing(id: string): Promise<Listing>;
  createListing(input: NewListing): Promise<Listing>;
  findMatches(req: MatchRequest): Promise<MatchResult[]>;
  planOrder(req: OrderPlanRequest): Promise<OrderPlanResult>;
  sendEnquiry(listingId: string, enquiry: Enquiry): Promise<{ id: string; status: 'sent' }>;
  getImpact(): Promise<ImpactStats>;
}

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    // The backend sends { "error": "..." }; fall back to the status when it doesn't.
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `${init?.method ?? 'GET'} ${path} failed with ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const httpApi: Api = {
  listListings: (kind, site) =>
    http(`/listings?kind=${kind}&lat=${site.lat}&lng=${site.lng}`),
  getListing: id => http(`/listings/${encodeURIComponent(id)}`),
  createListing: input => http('/listings', { method: 'POST', body: JSON.stringify(input) }),
  findMatches: req => http('/matches', { method: 'POST', body: JSON.stringify(req) }),
  planOrder: req => http('/orders/plan', { method: 'POST', body: JSON.stringify(req) }),
  sendEnquiry: (id, enquiry) =>
    http(`/listings/${encodeURIComponent(id)}/enquiries`, { method: 'POST', body: JSON.stringify(enquiry) }),
  getImpact: () => http('/impact'),
};

export const isMock = !BASE;
export const api: Api = isMock ? mockApi : httpApi;
