// Road-freight cost estimate. Indicative Australian rates for a hackathon demo; the backend
// (or a carrier quote API) can replace this later without changing the callers.

export type TruckKey = 'rigid' | 'semi' | 'bdouble';

export interface Truck {
  label: string;
  payloadT: number;
  /** A$ per km travelled, all-in (driver, fuel, tolls averaged). */
  ratePerKm: number;
}

export const TRUCKS: Record<TruckKey, Truck> = {
  rigid:   { label: 'Rigid truck',  payloadT: 12, ratePerKm: 2.9 },
  semi:    { label: 'Semi-trailer', payloadT: 24, ratePerKm: 3.6 },
  bdouble: { label: 'B-double',     payloadT: 38, ratePerKm: 4.4 },
};
export const TRUCK_KEYS = Object.keys(TRUCKS) as TruckKey[];

/** Loading, weighbridge and unloading per trip, A$. */
export const FEE_PER_TRIP = 180;
/** Road freight emissions, kg CO2e per tonne-km (articulated truck, indicative). */
export const KG_CO2E_PER_TKM = 0.075;

export interface FreightEstimate {
  truck: TruckKey;
  trips: number;
  /** A$ per month. */
  cost: number;
  /** A$ per tonne delivered. */
  perTonne: number;
  /** t CO2e per month from the trucks. */
  co2eT: number;
}

export function estimateFreight(tonnesPerMonth: number, roadKm: number, truck: TruckKey, emptyReturn = true): FreightEstimate {
  const t = Math.max(0, tonnesPerMonth);
  const { payloadT, ratePerKm } = TRUCKS[truck];
  const trips = t > 0 ? Math.ceil(t / payloadT) : 0;
  const kmBilled = roadKm * (emptyReturn ? 2 : 1);
  const cost = trips * (FEE_PER_TRIP + kmBilled * ratePerKm);
  return { truck, trips, cost, perTonne: t > 0 ? cost / t : 0, co2eT: (t * roadKm * KG_CO2E_PER_TKM) / 1000 };
}

/** The truck with the lowest cost per tonne for this volume and distance. */
export function cheapestFreight(tonnesPerMonth: number, roadKm: number, emptyReturn = true): FreightEstimate {
  return TRUCK_KEYS
    .map(k => estimateFreight(tonnesPerMonth, roadKm, k, emptyReturn))
    .reduce((best, e) => (e.cost < best.cost ? e : best));
}
