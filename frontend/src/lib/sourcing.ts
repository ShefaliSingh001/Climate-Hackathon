// Splits one demand (tonnes per month + budget) across several suppliers.
// Greedy allocation; good enough for tens of candidates. Runs in the browser for now.
import type { Listing, MaterialKey, Site } from '../api/types';
import { roadKm } from './geo';
import { monthlyTonnes } from './format';
import { MATERIALS } from './materials';
import { cheapestFreight, type FreightEstimate } from './logistics';

export type Strategy = 'cost' | 'fewest' | 'emissions';

export const STRATEGIES: Record<Strategy, string> = {
  cost: 'Lowest landed cost',
  fewest: 'Fewest partners',
  emissions: 'Lowest freight emissions',
};

export interface OrderRequest {
  material: MaterialKey;
  minPurity: number;
  tonnesPerMonth: number;
  /** Total A$ per month for material plus freight. */
  budgetAud: number;
  site: Site;
  maxPartners: number;
  verifiedOnly: boolean;
  strategy: Strategy;
}

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
  return {
    lines,
    tonnes,
    total,
    shortfallT: Math.max(0, req.tonnesPerMonth - tonnes),
    budgetLeft: req.budgetAud - total,
    avgLandedPerTonne: tonnes ? total / tonnes : 0,
    freightCo2eT: active.reduce((s, l) => s + l.freight.co2eT, 0),
    avoidedCo2eT: tonnes * MATERIALS[req.material].co2PerTonne,
  };
}

export function planOrder(listings: Listing[], req: OrderRequest): OrderPlan {
  const candidates = listings
    .filter(l => l.kind === 'supply' && l.material === req.material)
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
    l.kind === 'supply' && l.material === req.material && !ids.has(l.id) &&
    (!req.verifiedOnly || l.verified) &&
    (req.minPurity <= 0 || (l.purity != null && l.purity >= req.minPurity)),
  );
}
