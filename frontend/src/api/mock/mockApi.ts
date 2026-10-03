import type { Enquiry, ImpactStats, Listing, ListingKind, MatchRequest, MatchResult, NewListing, OrderPlanRequest, OrderPlanResult, Site } from '../types';
import type { Api } from '../client';
import seed from './listings.json';
import { baselineScore, scoreListing } from './scoring';
import { planOrder } from '../../lib/sourcing';

// Listings created in demo mode are kept in this browser so they survive a reload.
const CREATED_KEY = 'resourcex.createdListings';
function loadCreated(): Listing[] {
  try { return JSON.parse(localStorage.getItem(CREATED_KEY) ?? '[]') as Listing[]; } catch { return []; }
}
function saveCreated(items: Listing[]) {
  try { localStorage.setItem(CREATED_KEY, JSON.stringify(items)); } catch { /* storage blocked: keep in memory */ }
}
const created: Listing[] = loadCreated();
const listings: Listing[] = [...(seed as Listing[]).map(l => ({ ...l })), ...created];
const wait = <T,>(value: T, ms = 150) => new Promise<T>(res => setTimeout(() => res(value), ms));

export const mockApi: Api = {
  async listListings(kind: ListingKind, site: Site) {
    return wait(listings.filter(l => l.kind === kind).map(l => ({ ...l, matchScore: baselineScore(l, site) })));
  },

  async getListing(id: string) {
    const found = listings.find(l => l.id === id);
    if (!found) throw new Error(`Listing ${id} not found`);
    return wait({ ...found });
  },

  async createListing(input: NewListing) {
    const listing: Listing = { ...input, id: `new-${Date.now()}`, verified: false, monthsOnPlatform: 0 };
    listings.push(listing);
    created.push(listing);
    saveCreated(created);
    return wait(listing, 300);
  },

  async findMatches(req: MatchRequest): Promise<MatchResult[]> {
    const results = listings
      .filter(l => l.kind === 'supply' && l.material === req.material)
      .map(l => scoreListing(l, req))
      .sort((a, b) => b.score - a.score);
    return wait(results, 350);
  },

  async planOrder(req: OrderPlanRequest): Promise<OrderPlanResult> {
    // Greedy stand-in for the backend matching model; it may return a partial plan.
    const plan = planOrder(listings, req);
    const lines = plan.lines.filter(l => l.tonnes > 0).map(l => ({ listingId: l.listing.id, tonnes: l.tonnes }));
    return wait({
      status: plan.shortfallT < 0.5 && plan.budgetLeft >= 0 ? 'feasible' : 'infeasible',
      plans: lines.length ? [{ rank: 1, lines, supplierCount: lines.length, totalCostAud: plan.materialTotal, budgetRemainingAud: plan.budgetLeft }] : [],
      reason: lines.length ? null : 'No supply listed for this material and grade.',
    }, 250);
  },

  async sendEnquiry(listingId: string, _enquiry: Enquiry) {
    return wait({ id: `enq-${listingId}-${Date.now()}`, status: 'sent' as const }, 300);
  },

  async getImpact(): Promise<ImpactStats> {
    return wait({
      tonnesRecirculated: 14820,
      co2eAvoidedT: 21460,
      activeVerifiedSites: 212,
      matchesConverted: 146,
      byMaterial: [
        { material: 'steel', tonnes: 7400 },
        { material: 'paper', tonnes: 4100 },
        { material: 'glass', tonnes: 1900 },
        { material: 'aluminium', tonnes: 820 },
        { material: 'plastics', tonnes: 410 },
        { material: 'copper', tonnes: 160 },
        { material: 'ewaste', tonnes: 30 },
      ],
      isSample: true,
    });
  },
};
