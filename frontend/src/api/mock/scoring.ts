// Stand-in for the backend matching model. Only the mock API uses this.
import type { Listing, MatchRequest, MatchResult, ScoreBreakdown, Site } from '../types';
import { roadKm } from '../../lib/geo';
import { aud, fmtInt, monthlyTonnes } from '../../lib/format';

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

export function scoreListing(listing: Listing, req: MatchRequest): MatchResult {
  const distanceKm = roadKm(req.site, listing);
  const material = listing.material !== req.material ? 0
    : listing.purity == null ? 80
    : clamp(100 - Math.max(0, req.minPurity - listing.purity) * 25);
  const distance = clamp(100 - distanceKm / 10);
  const withinBudget = !req.maxPriceAud || listing.priceAud <= req.maxPriceAud;
  const price = listing.virginPriceAud
    ? clamp(((1 - listing.priceAud / listing.virginPriceAud) * 220 + 40) * (withinBudget ? 1 : 0.4))
    : 60;
  const volume = clamp((monthlyTonnes(listing.tonnes, listing.frequency) / Math.max(1, req.tonnesPerMonth)) * 100);
  const reliability = clamp((listing.verified ? 60 : 30) + listing.monthsOnPlatform * 2 + listing.certifications.length * 4);
  const breakdown: ScoreBreakdown = { material, distance, price, reliability, volume };
  const score = material === 0 ? 0
    : Math.round(material * 0.3 + distance * 0.25 + price * 0.2 + reliability * 0.15 + volume * 0.1);

  const reasons = [
    material >= 95 ? `meets ${req.minPurity}% purity` : `purity ${listing.purity ?? 'n/a'}% is below spec`,
    `${fmtInt(distanceKm)} km by road`,
    withinBudget
      ? `${aud(req.maxPriceAud - listing.priceAud)} per tonne under your limit`
      : `${aud(listing.priceAud - req.maxPriceAud)} per tonne over your limit`,
  ];
  if (volume < 100) reasons.push(`covers ${volume}% of monthly volume`);

  return { listing, score, breakdown, distanceKm, reasons };
}

/** Score a listing as if the user wanted exactly that material and grade. Used for the card badge. */
export function baselineScore(listing: Listing, site: Site) {
  return scoreListing(listing, {
    material: listing.material,
    minPurity: listing.purity ?? 0,
    tonnesPerMonth: monthlyTonnes(listing.tonnes, listing.frequency),
    maxPriceAud: 0,
    site,
  }).score;
}
