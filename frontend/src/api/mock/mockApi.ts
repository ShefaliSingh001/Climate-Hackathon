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

// Shape-correct sample for demo mode. Mirrors the backend's response for the NSW dataset (modelled from October 2026
// market data), rounded.
const impactSample: ImpactStats = {
  period: 'November 2026',
  isSample: true,
  tonnesRecirculated: 2310,
  co2eAvoidedT: 3910,
  transportCo2eT: 23,
  landfillAvoidedT: 300,
  moneySavedAud: 290000,
  valueRecoveredAud: 1450000,
  tonnesOffered: 2745,
  tonnesRequested: 7625,
  trades: 88,
  producers: { total: 63, matched: 54 },
  tenders: { total: 45, filled: 38, partial: 3 },
  byMaterial: [
    { material: 'steel', tonnes: 2223, co2eAvoidedT: 3310, offeredT: 2223, requestedT: 7440 },
    { material: 'aluminium', tonnes: 25, co2eAvoidedT: 365, offeredT: 310, requestedT: 25 },
    { material: 'alloys', tonnes: 31, co2eAvoidedT: 133, offeredT: 36, requestedT: 130 },
    { material: 'brass', tonnes: 30, co2eAvoidedT: 96, offeredT: 49, requestedT: 30 },
    { material: 'copper', tonnes: 0, co2eAvoidedT: 0, offeredT: 127, requestedT: 0 },
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
    metric: 'Recycled share of the metal that SME manufacturers on ResourceX buy',
    segment: 'SME manufacturers (foundries and fabricators)',
    buyers: 43,
    years: [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035],
    businessAsUsualPct: [37.5, 37.5, 37.5, 37.5, 37.5, 37.5, 37.5, 37.5, 37.5, 37.5],
    scenarios: [
      { key: 'conservative', label: 'Conservative', growthPct: 10, sharePct: [41.9, 42.3, 42.8, 43.3, 43.9, 44.5, 45.2, 45.9, 46.7, 47.6], extraTonnesPerYear2035: 6575, co2eAvoidedT: 90057 },
      { key: 'expected', label: 'Expected', growthPct: 25, sharePct: [41.9, 42.9, 44.3, 45.9, 47.9, 50.0, 50.5, 50.7, 50.9, 51.1], extraTonnesPerYear2035: 8885, co2eAvoidedT: 129762 },
      { key: 'ambitious', label: 'Ambitious', growthPct: 40, sharePct: [41.9, 43.6, 46.0, 49.1, 50.5, 50.8, 51.1, 51.5, 52.0, 52.6], extraTonnesPerYear2035: 9858, co2eAvoidedT: 152201 },
    ],
    ceilingPct: 54.6,
    metalInputTonnesPerMonth: 5445,
    baselines: [
      { group: "Steel fabricator (reusing offcuts)", buyers: 33, mixPct: 74.9, inputTonnesPerMonth: 4080, nowPct: 33.0, bau2035Pct: 33.0, ceilingPct: 48.0, sourceName: "IEA, BIR", source: "Steel bought new carries the world-average 33% recycled content (IEA, BIR); reusing offcuts adds to it, up to the 48% the IEA's net-zero pathway reaches", url: "https://www.iea.org/reports/iron-and-steel-technology-roadmap" },
      { group: "Iron foundry", buyers: 2, mixPct: 11.0, inputTonnesPerMonth: 600, nowPct: 50.0, bau2035Pct: 50.0, ceilingPct: 60.0, sourceName: "Archives of Foundry Engineering", source: "Synthetic cast iron charges are 40-60% pig iron, 20-45% steel scrap and 15-30% returns: 40-60% recycled", url: "https://journals.pan.pl//Content/127177/PDF/AFE%202_2023_10_final%20version.pdf" },
      { group: "Stainless and alloy foundry", buyers: 3, mixPct: 10.8, inputTonnesPerMonth: 590, nowPct: 48.0, bau2035Pct: 48.0, ceilingPct: 85.0, sourceName: "worldstainless", source: "worldstainless (KIT study): global stainless steel recycled content 48% (2019); Europe already reaches 85%", url: "https://worldstainless.org/news/global-life-cycle-of-stainless-steel" },
      { group: "Stainless fabricator (reusing offcuts)", buyers: 3, mixPct: 1.7, inputTonnesPerMonth: 95, nowPct: 48.0, bau2035Pct: 48.0, ceilingPct: 85.0, sourceName: "worldstainless", source: "New stainless carries the world-average 48% recycled content; Europe already reaches 85% (worldstainless)", url: "https://worldstainless.org/news/global-life-cycle-of-stainless-steel" },
      { group: "Aluminium foundry", buyers: 1, mixPct: 0.7, inputTonnesPerMonth: 40, nowPct: 80.0, bau2035Pct: 80.0, ceilingPct: 90.0, sourceName: "Chalmers; estimate", source: "Secondary aluminium casting alloys can run on up to 90% recycled content (Chalmers); 80% today is our estimate for a jobbing foundry", url: "https://odr.chalmers.se/items/6d25397e-a96e-4330-9a08-af108cab42df" },
      { group: "Brass and bronze foundry", buyers: 1, mixPct: 0.7, inputTonnesPerMonth: 40, nowPct: 91.0, bau2035Pct: 91.0, ceilingPct: 96.0, sourceName: "USGS", source: "USGS Minerals Yearbook: 91-96% of brass and bronze ingot is made from scrap", url: "https://search.library.wisc.edu/digital/ALAGORVJYOGFX28A/text/ACOYWOTGXIR4WR8H" },
    ],
    mills: {
      buyers: [
        { name: "BlueScope Port Kembla Steelworks", process: "Blast furnace / basic oxygen steelworks", metalUseTonnesPerMonth: 250000, recycledNowPct: 27.8, limitPct: 30.0, matchedTonnesPerMonth: 0, sourceName: "BlueScope; BOF studies", source: "BlueScope: scrap rose from 21.5% to 27.8% of the charge (FY19-FY25); a basic oxygen furnace typically takes about 25% scrap, up to about 29-30% with process changes", url: "https://steel.com.au/resources/articles/recycled-content" },
        { name: "InfraBuild Sydney Steel Mill", process: "Electric arc furnace steel mill", metalUseTonnesPerMonth: 62000, recycledNowPct: 100.0, limitPct: 100.0, matchedTonnesPerMonth: 2023, sourceName: "InfraBuild", source: "InfraBuild: the Sydney Steel Mill melts 100% recycled Australian scrap; capacity 680,000 t a year", url: "https://www.infrabuild.com/media-releases/new-steel-facility-to-service-western-sydneys-50-billion-infrastructure-boom/" },
      ],
      metalUseTonnesPerMonth: 312000,
      matchedTonnesPerMonth: 2023,
    },
    assumptions: ['Demo mode: sample numbers. Start the backend for the full method and sources.'],
  },
};
