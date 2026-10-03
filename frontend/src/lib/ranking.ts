// Turns a set of listings into positions: an overall rank plus a rank on each factor.
// The UI shows positions ("#2 of 18", "1st nearest") and relative bars, never a score.
import type { Listing } from '../api/types';

export type Factor = 'material' | 'distance' | 'price' | 'reliability';
export const FACTORS: { key: Factor; label: string; best: string }[] = [
  { key: 'material', label: 'Material', best: 'best quality' },
  { key: 'distance', label: 'Distance', best: 'nearest' },
  { key: 'price', label: 'Price', best: 'best price' },
  { key: 'reliability', label: 'Reliability', best: 'most reliable' },
];

export interface FactorRank {
  /** 1 = best among the listings ranked together. Ties share a position. */
  position: number;
  /** 0–100 bar fill, relative to the others in the set. */
  fill: number;
}

export interface Ranking {
  position: number;
  of: number;
  factors: Record<Factor, FactorRank>;
}

type Rankable = Listing & { distanceKm: number };

const GRADE_VALUE = { high: 100, medium: 80, short_use: 60 } as const;
// Same weights as the mock scorer and the backend's ranked list.
const WEIGHTS: Record<Factor, number> = { material: 0.3, distance: 0.25, price: 0.2, reliability: 0.15 };

/** Raw value per factor, oriented so that higher is always better. */
function raw(l: Rankable): Record<Factor, number> {
  const material = l.purity ?? (l.gradeKey ? GRADE_VALUE[l.gradeKey] : 80);
  // Supply: how much cheaper than newly sourced. Demand (seen by sellers): how much the buyer pays relative to it.
  const ratio = l.virginPriceAud ? l.priceAud / l.virginPriceAud : null;
  const price = ratio == null ? 0 : l.kind === 'supply' ? 1 - ratio : ratio;
  const reliability = (l.verified ? 40 : 0) + l.monthsOnPlatform * 2 + l.certifications.length * 4;
  return { material, distance: -l.distanceKm, price, reliability };
}

/** Competition ranking: equal values share a position (1, 2, 2, 4). */
function positions(values: number[]) {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  const pos = new Array<number>(values.length);
  order.forEach(([v, i], k) => { pos[i] = k > 0 && v === order[k - 1][0] ? pos[order[k - 1][1]] : k + 1; });
  return pos;
}

function fills(values: number[]) {
  const lo = Math.min(...values), hi = Math.max(...values);
  return values.map(v => (hi === lo ? 100 : Math.round(15 + ((v - lo) / (hi - lo)) * 85)));
}

/** Ranks listings against each other. Uses the backend's matchScore for the overall order when every listing has one. */
export function rankListings<T extends Rankable>(listings: T[]): Map<string, Ranking> {
  const out = new Map<string, Ranking>();
  if (!listings.length) return out;
  const raws = listings.map(raw);
  const perFactor = {} as Record<Factor, { pos: number[]; fill: number[] }>;
  for (const { key } of FACTORS) {
    const vals = raws.map(r => r[key]);
    perFactor[key] = { pos: positions(vals), fill: fills(vals) };
  }
  const useModel = listings.every(l => l.matchScore != null);
  const overall = listings.map((l, i) =>
    useModel ? l.matchScore! : FACTORS.reduce((s, f) => s + perFactor[f.key].fill[i] * WEIGHTS[f.key], 0));
  const overallPos = positions(overall);

  listings.forEach((l, i) => {
    out.set(l.id, {
      position: overallPos[i],
      of: listings.length,
      factors: Object.fromEntries(FACTORS.map(f => [f.key, { position: perFactor[f.key].pos[i], fill: perFactor[f.key].fill[i] }])) as Record<Factor, FactorRank>,
    });
  });
  return out;
}

/** Per-factor positions for results that already carry 0–100 factor values (Sourcing's ranked list). */
export function rankBreakdowns(rows: Record<Factor, number>[]): Record<Factor, FactorRank>[] {
  const per = Object.fromEntries(FACTORS.map(f => [f.key, positions(rows.map(r => r[f.key]))])) as Record<Factor, number[]>;
  return rows.map((r, i) => Object.fromEntries(FACTORS.map(f => [f.key, { position: per[f.key][i], fill: Math.max(4, r[f.key]) }])) as Record<Factor, FactorRank>);
}

/** Backend reasons can use short units ("$900/t"); spell them out for the UI. */
export const plainReason = (s: string) => s.replace(/\/t\b/g, ' per tonne').replace(/(\d) t\b/g, '$1 tonnes');
