import { useMemo } from 'react';
import { api } from '../api/client';
import type { Listing } from '../api/types';
import { MATERIALS } from '../lib/materials';
import { useSite } from '../auth/AuthProvider';
import { roadKm } from '../lib/geo';
import { useMarket } from '../state/store';
import { useAsync } from './useAsync';
import { rankListings } from '../lib/ranking';
import { isVerified } from '../lib/verify';

export interface ListingView extends Listing {
  distanceKm: number;
}

/** Listings for the current Buy/Sell mode, plus the filtered + sorted view the UI shows. */
export function useListings() {
  const { mode, region, materials, query, sort, radiusKm, verifiedOnly } = useMarket();
  const site = useSite();
  const { data, loading, error } = useAsync(() => api.listListings(mode, site), [mode, site]);

  const all: ListingView[] = useMemo(
    () => (data ?? []).map(l => ({ ...l, distanceKm: roadKm(site, l) })),
    [data, site],
  );

  // Region scoping is applied before the material filter so chip counts reflect the chosen state.
  const inRegion = useMemo(() => all.filter(l => region === 'AU' || l.state === region), [all, region]);

  // Filtered set, then ranked against each other, then sorted for display.
  const { visible, rankings } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = inRegion.filter(l =>
      (!materials.length || materials.includes(l.material)) &&
      (!verifiedOnly || isVerified(l)) &&
      (!radiusKm || l.distanceKm <= radiusKm) &&
      (!q || [l.company, l.suburb, l.state, l.grade, l.form, MATERIALS[l.material].label].join(' ').toLowerCase().includes(q)),
    );
    const ratio = (l: Listing) => (l.virginPriceAud ? l.priceAud / l.virginPriceAud : 1);
    const by: Record<typeof sort, (a: ListingView, b: ListingView) => number> = {
      match: (a, b) => (rankings.get(a.id)?.position ?? 0) - (rankings.get(b.id)?.position ?? 0),
      distance: (a, b) => a.distanceKm - b.distanceKm,
      price: (a, b) => ratio(a) - ratio(b),
      volume: (a, b) => b.tonnes - a.tonnes,
    };
    const rankings = rankListings(out);
    return { visible: out.sort(by[sort]), rankings };
  }, [inRegion, materials, verifiedOnly, radiusKm, query, sort]);

  return { all, inRegion, visible, rankings, loading, error };
}
