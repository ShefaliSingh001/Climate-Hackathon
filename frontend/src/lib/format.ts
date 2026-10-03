// Display helpers. Write units in full ("tonnes", "per month") so non-technical users can read every figure.
import type { Frequency } from '../api/types';

const int = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 });

export const fmtInt = (n: number) => int.format(Math.round(n));
/** Dollars (AUD). Pages that show prices carry one "prices in AUD, excluding GST" note. */
export const aud = (n: number) => `$${int.format(Math.round(n))}`;
/** "$13,050 per tonne" */
export const perTonne = (n: number) => `${aud(n)} per tonne`;
/** "25 tonnes", "1 tonne" */
export const tonnes = (n: number) => `${fmtInt(n)} ${Math.round(n) === 1 ? 'tonne' : 'tonnes'}`;
/** "week" | "fortnight" | "month" */
export const per = (f: Frequency) => (f === 'Weekly' ? 'week' : f === 'Fortnightly' ? 'fortnight' : 'month');
/** "25 tonnes per month" */
export const volume = (n: number, f: Frequency) => `${tonnes(n)} per ${per(f)}`;

const PERIODS_PER_MONTH: Record<Frequency, number> = { Weekly: 4.33, Fortnightly: 2.17, Monthly: 1 };
export const monthlyTonnes = (t: number, f: Frequency) => t * PERIODS_PER_MONTH[f];

/** Percent cheaper than newly sourced material, or null when there is no benchmark. */
export const belowNew = (price: number, newPrice: number | null) =>
  newPrice ? Math.round((1 - price / newPrice) * 100) : null;

/** Emissions given in tonnes, shown in kilograms below one tonne. */
export const co2e = (t: number) => (t < 1 ? `${fmtInt(t * 1000)} kg` : `${t.toFixed(1)} tonnes`);

/** 1 → "1st", 2 → "2nd", 11 → "11th" */
export function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
}

/** "about 1 h 50 min" */
export function driveTime(minutes: number) {
  const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
  return h ? `about ${h} h${m ? ` ${m} min` : ''}` : `about ${m} min`;
}

export const PRICE_NOTE = 'All prices are in Australian dollars (AUD), excluding GST.';
