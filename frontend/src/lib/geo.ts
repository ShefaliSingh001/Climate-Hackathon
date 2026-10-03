interface Point { lat: number; lng: number }

const R_KM = 6371;
const RAD = Math.PI / 180;

export function haversineKm(a: Point, b: Point) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLng = (b.lng - a.lng) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(h));
}

/** Rough road distance: straight line × 1.25. Swap for a routing API when available. */
export const ROAD_FACTOR = 1.25;
export const roadKm = (a: Point, b: Point) => haversineKm(a, b) * ROAD_FACTOR;
