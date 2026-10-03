import type { CSSProperties } from 'react';
import type { MaterialKey } from '../../api/types';
import type { ListingView } from '../../hooks/useListings';
import { MATERIALS, MATERIAL_KEYS } from '../../lib/materials';
import { REGIONS, type RegionCode } from '../../lib/regions';
import { useMarket, type SortKey } from '../../state/store';
import { Select } from '../ui/Select';

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
        <Select<RegionCode> id="region" className="region-select" value={region} onChange={setRegion}
          options={REGIONS.map(r => ({ value: r.code, label: r.code === 'AU' ? r.name : `${r.name} (${r.code})` }))} />
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
        <Select<SortKey> id="sort" size="sm" prefix="Sort" aria-label="Sort by" value={sort} onChange={v => set({ sort: v })} options={[
          { value: 'match', label: 'Best ranked' },
          { value: 'distance', label: 'Nearest' },
          { value: 'price', label: 'Cheapest vs newly sourced' },
          { value: 'volume', label: 'Largest volume' },
        ]} />
        <Select<number> id="radius" size="sm" prefix="Distance" aria-label="Distance" value={radiusKm} onChange={v => set({ radiusKm: v })} options={[
          { value: 0, label: 'Any' },
          { value: 50, label: 'Within 50 km' },
          { value: 150, label: 'Within 150 km' },
          { value: 400, label: 'Within 400 km' },
          { value: 1000, label: 'Within 1,000 km' },
        ]} />
        <label className="toggle">
          <input id="verified" type="checkbox" checked={verifiedOnly} onChange={e => set({ verifiedOnly: e.target.checked })} /> Verified only
        </label>
      </div>
    </div>
  );
}
