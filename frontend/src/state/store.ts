import { create } from 'zustand';
import type { ListingKind, MaterialKey } from '../api/types';
import type { RegionCode } from '../lib/regions';

export type MapLayerKey = 'map' | 'satellite' | 'terrain' | 'dark';
export type SortKey = 'match' | 'distance' | 'price' | 'volume';

interface MarketState {
  mode: ListingKind;
  region: RegionCode;
  materials: MaterialKey[];
  query: string;
  sort: SortKey;
  radiusKm: number;
  verifiedOnly: boolean;
  hoveredId: string | null;
  layer: MapLayerKey;
  /** Bumped when the map should re-fit to the selected region. */
  fitToken: number;
  set: (patch: Partial<Omit<MarketState, 'set' | 'toggleMaterial' | 'setRegion'>>) => void;
  toggleMaterial: (m: MaterialKey | null) => void;
  setRegion: (r: RegionCode) => void;
}

export const useMarket = create<MarketState>(set => ({
  mode: 'supply',
  region: 'NSW',
  materials: [],
  query: '',
  sort: 'match',
  radiusKm: 0,
  verifiedOnly: false,
  hoveredId: null,
  layer: 'map',
  fitToken: 0,
  set: patch => set(patch),
  toggleMaterial: m => set(s => ({
    materials: m === null ? [] : s.materials.includes(m) ? s.materials.filter(x => x !== m) : [...s.materials, m],
  })),
  setRegion: region => set(s => ({ region, fitToken: s.fitToken + 1 })),
}));
