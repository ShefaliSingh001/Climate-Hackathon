import { create } from 'zustand';
import type { ListingKind, MaterialKey } from '../api/types';
import type { RegionCode } from '../lib/regions';
import { useSettings } from './settings';

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
  set: (patch: Partial<Omit<MarketState, Actions>>) => void;
  toggleMaterial: (m: MaterialKey | null) => void;
  setMaterials: (m: MaterialKey[]) => void;
  setRegion: (r: RegionCode) => void;
  /** Back to the user's defaults from Settings. */
  resetFilters: () => void;
}

type Actions = 'set' | 'toggleMaterial' | 'setMaterials' | 'setRegion' | 'resetFilters';

/** Filter defaults come from the user's settings. */
export const filterDefaults = () => {
  const s = useSettings.getState();
  return { region: s.region, materials: [] as MaterialKey[], sort: 'match' as SortKey, radiusKm: s.radiusKm, verifiedOnly: false };
};

export const useMarket = create<MarketState>(set => ({
  mode: 'supply',
  ...filterDefaults(),
  query: '',
  hoveredId: null,
  layer: useSettings.getState().mapLayer,
  fitToken: 0,
  set: patch => set(patch),
  toggleMaterial: m => set(s => ({
    materials: m === null ? [] : s.materials.includes(m) ? s.materials.filter(x => x !== m) : [...s.materials, m],
  })),
  setMaterials: materials => set({ materials }),
  setRegion: region => set(s => ({ region, fitToken: s.fitToken + 1 })),
  resetFilters: () => set(s => ({ ...filterDefaults(), fitToken: s.region === filterDefaults().region ? s.fitToken : s.fitToken + 1 })),
}));
