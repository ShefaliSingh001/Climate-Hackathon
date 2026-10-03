// Road routes from the public OSRM demo server (no key). This is a third-party service, not our backend,
// so it is called here rather than through api/client.ts. The demo server is fair-use only: use a hosted
// router (self-hosted OSRM, Valhalla, GraphHopper or Mapbox Directions) before launch.

interface Point { lat: number; lng: number }

export interface Route {
  /** [lat, lng] pairs along the road. */
  coords: [number, number][];
  distanceKm: number;
  durationMin: number;
}

const OSRM = 'https://router.project-osrm.org/route/v1/driving';
const cache = new Map<string, Promise<Route | null>>();

/** Driving route between two points, or null when routing is unavailable. Results are cached per point pair. */
export function getRoute(from: Point, to: Point): Promise<Route | null> {
  const key = [from.lat, from.lng, to.lat, to.lng].map(v => v.toFixed(4)).join(',');
  let hit = cache.get(key);
  if (!hit) {
    hit = fetchRoute(from, to);
    cache.set(key, hit);
    hit.then(r => { if (!r) cache.delete(key); }); // let a failed lookup retry next time
  }
  return hit;
}

async function fetchRoute(from: Point, to: Point): Promise<Route | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${OSRM}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=simplified&geometries=geojson`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const body = await res.json() as { code: string; routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] };
    const r = body.code === 'Ok' ? body.routes?.[0] : undefined;
    if (!r) return null;
    return {
      coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distanceKm: r.distance / 1000,
      durationMin: r.duration / 60,
    };
  } catch {
    return null;
  }
}
