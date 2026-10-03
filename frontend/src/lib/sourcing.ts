// Splits one demand (tonnes per month + budget) across several suppliers.
// With the real API the split comes from the backend matching model (POST /orders/plan); `planOrder` below is the
// greedy stand-in the mock uses. `allocate` and `summarise` add freight and totals in both cases.
import type { Listing, OrderPlanRequest, Site, Strategy } from '../api/types';
import { roadKm } from './geo';
import { monthlyTonnes } from './format';
import { MATERIALS } from './materials';
import { cheapestFreight, type FreightEstimate } from './logistics';

export type { Strategy };

export const STRATEGIES: Record<Strategy, string> = {
  cost: 'Lowest cost',
  fewest: 'Fewest partners',
  emissions: 'Lowest freight emissions',
};

/** Budget is A$ per month for the material only; freight is estimated on top. */
export type OrderRequest = OrderPlanRequest;

export interface Allocation {
  listing: Listing;
  distanceKm: number;
  capacityT: number;
  tonnes: number;
  freight: FreightEstimate;
  materialCost: number;
  /** Material + freight, A$ per month. */
  total: number;
  landedPerTonne: number;
}

export interface OrderPlan {
  lines: Allocation[];
  tonnes: number;
  /** Supplier prices only; this is what the budget covers. */
  materialTotal: number;
  /** Material + freight. */
  total: number;
  shortfallT: number;
  /** Positive = under budget. */
  budgetLeft: number;
  avgLandedPerTonne: number;
  freightCo2eT: number;
  avoidedCo2eT: number;
}

/** Recomputes one line for a given tonnage (used after manual edits too). */
export function allocate(listing: Listing, tonnes: number, site: Site): Allocation {
  const distanceKm = roadKm(site, listing);
  const capacityT = monthlyTonnes(listing.tonnes, listing.frequency);
  const t = Math.max(0, Math.min(tonnes, capacityT));
  const freight = cheapestFreight(t, distanceKm);
  const materialCost = t * listing.priceAud;
  const total = materialCost + freight.cost;
  return { listing, distanceKm, capacityT, tonnes: t, freight, materialCost, total, landedPerTonne: t ? total / t : 0 };
}

export function summarise(lines: Allocation[], req: Pick<OrderRequest, 'tonnesPerMonth' | 'budgetAud' | 'material'>): OrderPlan {
  const active = lines.filter(l => l.tonnes > 0);
  const tonnes = active.reduce((s, l) => s + l.tonnes, 0);
  const total = active.reduce((s, l) => s + l.total, 0);
  const materialTotal = active.reduce((s, l) => s + l.materialCost, 0);
  return {
    lines,
    tonnes,
    materialTotal,
    total,
    shortfallT: Math.max(0, req.tonnesPerMonth - tonnes),
    budgetLeft: req.budgetAud - materialTotal,
    avgLandedPerTonne: tonnes ? total / tonnes : 0,
    freightCo2eT: active.reduce((s, l) => s + l.freight.co2eT, 0),
    avoidedCo2eT: tonnes * MATERIALS[req.material].co2PerTonne,
  };
}

const gradeOk = (l: Listing, req: OrderRequest) => !req.grade || !l.gradeKey || l.gradeKey === req.grade;

export function planOrder(listings: Listing[], req: OrderRequest): OrderPlan {
  const candidates = listings
    .filter(l => l.kind === 'supply' && l.material === req.material && gradeOk(l, req))
    .filter(l => !req.verifiedOnly || l.verified)
    .filter(l => req.minPurity <= 0 || (l.purity != null && l.purity >= req.minPurity))
    // Score each candidate as if it supplied as much as it could toward the order.
    .map(l => allocate(l, req.tonnesPerMonth, req.site));

  const key: Record<Strategy, (a: Allocation) => number> = {
    cost: a => a.landedPerTonne,
    fewest: a => -a.capacityT,
    emissions: a => a.distanceKm,
  };
  candidates.sort((a, b) => key[req.strategy](a) - key[req.strategy](b));

  const lines: Allocation[] = [];
  let remaining = req.tonnesPerMonth;
  for (const c of candidates) {
    if (remaining <= 0 || lines.length >= req.maxPartners) break;
    lines.push(allocate(c.listing, remaining, req.site));
    remaining -= lines[lines.length - 1].tonnes;
  }
  return summarise(lines, req);
}

/** Supply listings that qualify but were not picked, for adding by hand. */
export function spareCandidates(listings: Listing[], req: OrderRequest, picked: Allocation[]) {
  const ids = new Set(picked.map(p => p.listing.id));
  return listings.filter(l =>
    l.kind === 'supply' && l.material === req.material && !ids.has(l.id) && gradeOk(l, req) &&
    (!req.verifiedOnly || l.verified) &&
    (req.minPurity <= 0 || (l.purity != null && l.purity >= req.minPurity)),
  );
}
