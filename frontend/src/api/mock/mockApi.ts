import type { Collaboration, Enquiry, ImpactReport, ImpactStats, Listing, ListingKind, MatchRequest, MatchResult, NewCollaboration, NewListing, OrderPlanRequest, OrderPlanResult, Site } from '../types';
import type { Api } from '../client';
import seed from './listings.json';
import { baselineScore, scoreListing } from './scoring';
import { planOrder } from '../../lib/sourcing';
import { hasAbn } from '../../lib/verify';
import { mockAuth } from '../../auth/mockAuth';
import { addPendingOrder, ordersFor } from './orders';
import * as collab from './collaborations';

const me = () => {
  const a = mockAuth.current();
  if (!a) throw new Error('Sign in to see this.');
  return a;
};

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
    // Verified as soon as the business has an ABN on file.
    const listing: Listing = { ...input, id: `new-${Date.now()}`, verified: hasAbn(input.abn), monthsOnPlatform: 0 };
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

  async sendEnquiry(listingId: string, enquiry: Enquiry) {
    // A quote request (buyer) or an offer (seller) shows up in Orders as pending.
    const listing = listings.find(l => l.id === listingId);
    const a = mockAuth.current();
    if (listing && a) addPendingOrder(a, listing, Math.max(1, enquiry.tonnesPerMonth));
    return wait({ id: `enq-${listingId}-${Date.now()}`, status: 'sent' as const }, 300);
  },

  async listOrders() {
    return wait(ordersFor(mockAuth.current(), listings), 250);
  },

  async listCollaborations() {
    return wait(collab.collaborationsFor(mockAuth.current(), listings), 200);
  },

  async createCollaboration(input: NewCollaboration) {
    return wait(collab.createCollaboration(me(), input, listings), 300);
  },

  async respondToCollaboration(id: string, accept: boolean): Promise<Collaboration> {
    const a = me();
    return wait(collab.respond(a, collab.collaborationsFor(a, listings), id, accept), 200);
  },

  async withdrawCollaboration(id: string) {
    return wait(collab.withdraw(collab.collaborationsFor(me(), listings), id), 200);
  },

  async sendJointOffer(id: string) {
    const a = me();
    return wait(collab.sendOffer(a, collab.collaborationsFor(a, listings), id, listings), 300);
  },

  async getImpact(): Promise<ImpactStats> {
    return wait(impactSample);
  },

  async getImpactReport(): Promise<ImpactReport> {
    return wait({
      headline: 'Demo mode: start the backend to see the projection from the NSW dataset.',
      summary: [
        'These are sample numbers. With VITE_API_URL pointing at the backend, this page shows the November 2026 projection from the NSW producers and manufacturers dataset, and Claude writes this report from those numbers.',
      ],
      highlights: [],
      source: 'template',
      model: null,
      note: 'Demo mode: nothing left this browser.',
      generatedAt: new Date().toISOString(),
    }, 300);
  },
};

// Shape-correct sample for demo mode. Mirrors the backend's response for the NSW dataset, rounded.
const impactSample: ImpactStats = {
  period: 'November 2026',
  isSample: true,
  tonnesRecirculated: 3800,
  co2eAvoidedT: 15900,
  transportCo2eT: 57,
  landfillAvoidedT: 500,
  moneySavedAud: 810000,
  valueRecoveredAud: 3550000,
  tonnesOffered: 3930,
  tonnesRequested: 20800,
  trades: 68,
  producers: { total: 63, matched: 60 },
  tenders: { total: 61, filled: 11, partial: 9 },
  byMaterial: [
    { material: 'aluminium', tonnes: 710, co2eAvoidedT: 10360, offeredT: 710, requestedT: 1590 },
    { material: 'steel', tonnes: 2700, co2eAvoidedT: 4010, offeredT: 2700, requestedT: 18420 },
    { material: 'alloys', tonnes: 205, co2eAvoidedT: 880, offeredT: 244, requestedT: 548 },
    { material: 'copper', tonnes: 134, co2eAvoidedT: 430, offeredT: 196, requestedT: 150 },
    { material: 'brass', tonnes: 70, co2eAvoidedT: 220, offeredT: 80, requestedT: 77 },
  ],
  circularity: {
    globalRatePct: 6.9,
    globalSource: 'Circularity Gap Report 2025 (Circle Economy)',
    australiaRatePct: 4.3,
    australiaSource: 'ABS Measuring What Matters, circular economy indicator (2024)',
    australiaGoal: "Double the circularity rate by 2035 (Australia's Circular Economy Framework, 2024)",
    goalPct: 15,
    goal: 'COP31 Green Industrialisation: 15% global circular material use by 2035',
  },
  factors: [],
  assumptions: ['Demo mode: sample numbers. Start the backend for the full method and sources.'],
  outlook: {
    metric: 'Recycled share of metal input for manufacturers on ResourceX',
    years: [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035],
    businessAsUsualPct: [32.9, 33.0, 33.1, 33.1, 33.2, 33.3, 33.4, 33.4, 33.5, 33.6],
    scenarios: [
      { key: 'conservative', label: 'Conservative', growthPct: 10, sharePct: [38.8, 39.5, 40.2, 41.0, 41.7, 42.3, 43.1, 43.9, 44.8, 45.7], extraTonnesPerYear2035: 91600, co2eAvoidedT: 2438000 },
      { key: 'expected', label: 'Expected', growthPct: 25, sharePct: [38.8, 40.3, 42.1, 43.9, 46.0, 48.7, 48.9, 48.9, 48.9, 48.9], extraTonnesPerYear2035: 115700, co2eAvoidedT: 2901000 },
      { key: 'ambitious', label: 'Ambitious', growthPct: 40, sharePct: [38.8, 41.2, 44.0, 47.3, 48.9, 48.9, 48.9, 48.9, 48.9, 48.9], extraTonnesPerYear2035: 115700, co2eAvoidedT: 3025000 },
    ],
    ceilingPct: 48.9,
    metalInputTonnesPerMonth: 63155,
    baselines: [],
    assumptions: ['Demo mode: sample numbers. Start the backend for the full method and sources.'],
  },
};
