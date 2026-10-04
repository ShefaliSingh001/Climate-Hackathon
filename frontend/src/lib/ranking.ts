// Turns a set of listings into positions: an overall rank plus a rank on each factor.
// The UI shows positions ("#2 of 18", "1st nearest") and relative bars, never a score.
import type { Listing } from '../api/types';
import { isVerified } from './verify';

export type Factor = 'material' | 'distance' | 'price' | 'reliability';
export const FACTORS: { key: Factor; label: string; best: string }[] = [
  { key: 'material', label: 'Material', best: 'best quality' },
  { key: 'distance', label: 'Distance', best: 'nearest' },
  { key: 'price', label: 'Price', best: 'best price' },
  { key: 'reliability', label: 'Reliability', best: 'most reliable' },
];

export interface FactorRank {
  /** 1 = best among the listings ranked together. Every listing has its own position (no ties). */
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
  const reliability = (isVerified(l) ? 40 : 0) + l.monthsOnPlatform * 2 + l.certifications.length * 4;
  return { material, distance: -l.distanceKm, price, reliability };
}

/**
 * Unique positions 1, 2, 3… (higher value is better). Equal values never share a position:
 * `tiebreak` decides (lower comes first), then the original order.
 */
function positions(values: number[], tiebreak: number[] = values.map((_, i) => i)) {
  const order = values.map((_, i) => i).sort((a, b) => values[b] - values[a] || tiebreak[a] - tiebreak[b] || a - b);
  const pos = new Array<number>(values.length);
  order.forEach((i, k) => { pos[i] = k + 1; });
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
  const fillsBy = Object.fromEntries(FACTORS.map(f => [f.key, fills(raws.map(r => r[f.key]))])) as Record<Factor, number[]>;
  const useModel = listings.every(l => l.matchScore != null);
  const overall = listings.map((l, i) =>
    useModel ? l.matchScore! : FACTORS.reduce((s, f) => s + fillsBy[f.key][i] * WEIGHTS[f.key], 0));
  // Overall ties go to the nearer listing; factor ties go to the better overall position.
  const overallPos = positions(overall, listings.map(l => l.distanceKm));
  const perFactor = {} as Record<Factor, { pos: number[]; fill: number[] }>;
  for (const { key } of FACTORS) {
    perFactor[key] = { pos: positions(raws.map(r => r[key]), overallPos), fill: fillsBy[key] };
  }

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
  // Rows arrive in ranked order, so ties go to the higher-ranked row.
  const per = Object.fromEntries(FACTORS.map(f => [f.key, positions(rows.map(r => r[f.key]))])) as Record<Factor, number[]>;
  return rows.map((r, i) => Object.fromEntries(FACTORS.map(f => [f.key, { position: per[f.key][i], fill: Math.max(4, r[f.key]) }])) as Record<Factor, FactorRank>);
}

/** Backend reasons can use short units ("$900/t"); spell them out for the UI. */
export const plainReason = (s: string) => s.replace(/\/t\b/g, ' per tonne').replace(/(\d) t\b/g, '$1 tonnes');
