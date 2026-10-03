import type { MaterialKey } from '../../api/types';
import type { ListingView } from '../../hooks/useListings';
import { MATERIALS, MATERIAL_KEYS } from '../../lib/materials';
import { REGIONS, type RegionCode } from '../../lib/regions';
import { filterDefaults, useMarket, type SortKey } from '../../state/store';
import { MultiSelect } from '../ui/MultiSelect';
import { Select } from '../ui/Select';
import { Switch } from '../ui/Switch';

export function FilterBar({ inRegion }: { inRegion: ListingView[] }) {
  const { region, materials, sort, radiusKm, verifiedOnly, set, setRegion, setMaterials, resetFilters } = useMarket();

  const counts = inRegion.reduce<Partial<Record<MaterialKey, number>>>((acc, l) => {
    acc[l.material] = (acc[l.material] ?? 0) + 1;
    return acc;
  }, {});

  const d = filterDefaults();
  const changed = region !== d.region || materials.length > 0 || sort !== d.sort || radiusKm !== d.radiusKm || verifiedOnly !== d.verifiedOnly;

  return (
    <div className="filters">
      <div className="filter-grid">
        <div className="filter-field">
          <label htmlFor="region">State</label>
          <Select<RegionCode> id="region" value={region} onChange={setRegion}
            options={REGIONS.map(r => ({ value: r.code, label: r.name, hint: r.code === 'AU' ? undefined : r.code }))} />
        </div>
        <div className="filter-field">
          <label htmlFor="materials">Materials</label>
          <MultiSelect<MaterialKey>
            id="materials"
            values={materials}
            onChange={setMaterials}
            allLabel="All materials"
            noun="materials"
            options={MATERIAL_KEYS.filter(k => counts[k] || materials.includes(k)).map(k => ({
              value: k, label: MATERIALS[k].label, color: MATERIALS[k].color, count: counts[k] ?? 0,
            }))}
          />
        </div>
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
        <Switch id="verified" checked={verifiedOnly} onChange={v => set({ verifiedOnly: v })} label="Verified only" />
        {changed && <button type="button" className="link-btn" onClick={resetFilters}>Clear filters</button>}
      </div>
    </div>
  );
}
