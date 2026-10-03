import type { Frequency } from '../api/types';

const int = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 });

export const fmtInt = (n: number) => int.format(Math.round(n));
export const aud = (n: number) => `A$${int.format(Math.round(n))}`;
export const per = (f: Frequency) => (f === 'Weekly' ? 'wk' : f === 'Fortnightly' ? 'fn' : 'mo');

const PERIODS_PER_MONTH: Record<Frequency, number> = { Weekly: 4.33, Fortnightly: 2.17, Monthly: 1 };
export const monthlyTonnes = (tonnes: number, f: Frequency) => tonnes * PERIODS_PER_MONTH[f];

/** Percent below the virgin benchmark, or null when there is no benchmark. */
export const belowVirgin = (price: number, virgin: number | null) =>
  virgin ? Math.round((1 - price / virgin) * 100) : null;

/** Emissions given in tonnes, shown in kg below one tonne. */
export const co2e = (tonnes: number) =>
  tonnes < 1 ? `${fmtInt(tonnes * 1000)} kg` : `${tonnes.toFixed(1)} t`;
