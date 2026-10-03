import type { Enquiry, ImpactStats, Listing, ListingKind, MatchRequest, MatchResult, NewListing, Site } from '../types';
import type { Api } from '../client';
import seed from './listings.json';
import { baselineScore, scoreListing } from './scoring';

const listings: Listing[] = (seed as Listing[]).map(l => ({ ...l }));
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
    const created: Listing = { ...input, id: `new-${Date.now()}`, verified: false, monthsOnPlatform: 0 };
    listings.push(created);
    return wait(created, 300);
  },

  async findMatches(req: MatchRequest): Promise<MatchResult[]> {
    const results = listings
      .filter(l => l.kind === 'supply' && l.material === req.material)
      .map(l => scoreListing(l, req))
      .sort((a, b) => b.score - a.score);
    return wait(results, 350);
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
