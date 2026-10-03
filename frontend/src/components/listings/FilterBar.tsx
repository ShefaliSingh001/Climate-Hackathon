import type { CSSProperties } from 'react';
import type { MaterialKey } from '../../api/types';
import type { ListingView } from '../../hooks/useListings';
import { MATERIALS, MATERIAL_KEYS } from '../../lib/materials';
import { REGIONS, type RegionCode } from '../../lib/regions';
import { useMarket, type SortKey } from '../../state/store';

export function FilterBar({ inRegion }: { inRegion: ListingView[] }) {
  const { region, materials, sort, radiusKm, verifiedOnly, set, setRegion, toggleMaterial } = useMarket();

  const counts = inRegion.reduce<Partial<Record<MaterialKey, number>>>((acc, l) => {
    acc[l.material] = (acc[l.material] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="filters">
      <div className="region-row">
        <label htmlFor="region">State</label>
        <select id="region" className="select" value={region} onChange={e => setRegion(e.target.value as RegionCode)}>
          {REGIONS.map(r => <option key={r.code} value={r.code}>{r.code === 'AU' ? r.name : `${r.name} (${r.code})`}</option>)}
        </select>
      </div>

      <div className="chips" role="group" aria-label="Material">
        <button className="chip" aria-pressed={materials.length === 0} onClick={() => toggleMaterial(null)}>All materials</button>
        {MATERIAL_KEYS.filter(k => counts[k]).map(k => (
          <button
            key={k}
            className="chip"
            aria-pressed={materials.includes(k)}
            onClick={() => toggleMaterial(k)}
            style={{ '--c': MATERIALS[k].color } as CSSProperties}
          >
            <span className="dot" />{MATERIALS[k].label} <span className="count num">{counts[k]}</span>
          </button>
        ))}
      </div>

      <div className="filter-row">
        <label className="sr-only" htmlFor="sort">Sort</label>
        <select id="sort" className="select" value={sort} onChange={e => set({ sort: e.target.value as SortKey })}>
          <option value="match">Sort: Best match</option>
          <option value="distance">Sort: Nearest</option>
          <option value="price">Sort: Price vs virgin</option>
          <option value="volume">Sort: Volume</option>
        </select>
        <label className="sr-only" htmlFor="radius">Distance</label>
        <select id="radius" className="select" value={radiusKm} onChange={e => set({ radiusKm: Number(e.target.value) })}>
          <option value={0}>Any distance</option>
          <option value={50}>Within 50 km</option>
          <option value={150}>Within 150 km</option>
          <option value={400}>Within 400 km</option>
          <option value={1000}>Within 1,000 km</option>
        </select>
        <label className="toggle">
          <input id="verified" type="checkbox" checked={verifiedOnly} onChange={e => set({ verifiedOnly: e.target.checked })} /> Verified only
        </label>
      </div>
    </div>
  );
}
