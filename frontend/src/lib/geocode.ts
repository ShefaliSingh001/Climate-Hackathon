// Address search for placing a yard or delivery site on the map. Uses Photon (photon.komoot.io), a free,
// keyless OpenStreetMap geocoder that allows search-as-you-type within fair use. It is a third-party
// service, not our backend, so it is called here like lib/routing.ts. For production, use a paid or
// self-hosted geocoder (Geoscape G-NAF, Mapbox, Google Places or a self-hosted Photon).
// If Photon can't be reached, known suburbs (lib/places.ts) still resolve.
import type { StateCode } from '../api/types';
import { PLACES } from './places';
import { REGIONS } from './regions';

export interface GeoResult {
  /** "12 Smith Street, Kooragang NSW 2304" */
  label: string;
  street: string;
  suburb: string;
  state: StateCode | null;
  postcode: string;
  lat: number;
  lng: number;
}

const PHOTON = 'https://photon.komoot.io/api/';
// Australia, so results stay local.
const AU_BBOX = '112.5,-44,154,-10';
const cache = new Map<string, Promise<GeoResult[]>>();

const STATE_BY_NAME = new Map(REGIONS.filter(r => r.code !== 'AU').map(r => [r.name.toLowerCase(), r.code as StateCode]));
const toState = (s?: string): StateCode | null => {
  if (!s) return null;
  const up = s.toUpperCase();
  return (REGIONS.some(r => r.code === up && up !== 'AU') ? up as StateCode : null) ?? STATE_BY_NAME.get(s.toLowerCase()) ?? null;
};

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    countrycode?: string; name?: string; street?: string; housenumber?: string; postcode?: string;
    city?: string; district?: string; locality?: string; county?: string; state?: string; type?: string;
  };
}

function fromPhoton(f: PhotonFeature): GeoResult | null {
  const p = f.properties;
  if (p.countrycode && p.countrycode !== 'AU') return null;
  const [lng, lat] = f.geometry.coordinates;
  const street = p.street ? `${p.housenumber ? `${p.housenumber} ` : ''}${p.street}` : p.type === 'street' ? p.name ?? '' : '';
  const suburb = p.district ?? p.locality ?? p.city ?? (p.type === 'city' || p.type === 'district' ? p.name : '') ?? '';
  const state = toState(p.state);
  const place = [suburb, state, p.postcode].filter(Boolean).join(' ');
  const head = street || (p.name && p.name !== suburb ? p.name : '');
  return { label: [head, place].filter(Boolean).join(', ') || p.name || '', street, suburb, state, postcode: p.postcode ?? '', lat, lng };
}

/** Offline fallback: matches a known suburb anywhere in the query. */
function local(query: string): GeoResult[] {
  const q = query.toLowerCase();
  return PLACES
    .filter(p => q.includes(p.suburb.toLowerCase()) || p.suburb.toLowerCase().startsWith(q.trim()))
    .slice(0, 5)
    .map(p => ({ label: `${p.suburb} ${p.state}`, street: '', suburb: p.suburb, state: p.state, postcode: '', lat: p.lat, lng: p.lng }));
}

/** Up to five Australian matches for a free-text address, best first. Never throws. */
export function geocode(query: string, signal?: AbortSignal): Promise<GeoResult[]> {
  const q = query.trim();
  if (q.length < 3) return Promise.resolve([]);
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const run = (async () => {
    try {
      const url = `${PHOTON}?q=${encodeURIComponent(q)}&limit=6&lang=en&bbox=${AU_BBOX}`;
      const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json() as { features?: PhotonFeature[] };
      const out = (body.features ?? []).map(fromPhoton).filter((r): r is GeoResult => !!r).slice(0, 5);
      return out.length ? out : local(q);
    } catch (e) {
      if ((e as Error).name === 'AbortError' && signal?.aborted) throw e;
      return local(q);
    }
  })();
  cache.set(key, run);
  run.catch(() => cache.delete(key));
  return run;
}
