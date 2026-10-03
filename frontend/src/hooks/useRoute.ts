import { useEffect, useState } from 'react';
import { getRoute, type Route } from '../lib/routing';

interface Point { lat: number; lng: number }

/** Road route between two points. status: loading → ok | failed (then callers fall back to a straight line). */
export function useRoute(from: Point, to: Point) {
  const [state, setState] = useState<{ route: Route | null; status: 'loading' | 'ok' | 'failed' }>({ route: null, status: 'loading' });
  useEffect(() => {
    let live = true;
    setState({ route: null, status: 'loading' });
    getRoute(from, to).then(route => live && setState({ route, status: route ? 'ok' : 'failed' }));
    return () => { live = false; };
  }, [from.lat, from.lng, to.lat, to.lng]);
  return state;
}
