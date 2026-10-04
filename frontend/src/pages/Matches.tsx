import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { api, isMock } from '../api/client';
import type { GradeKey, MaterialKey } from '../api/types';
import { useAsync } from '../hooks/useAsync';
import { GRADES, MATERIALS, MATERIAL_KEYS } from '../lib/materials';
import { useSite } from '../auth/AuthProvider';
import { PRICE_NOTE, aud } from '../lib/format';
import { NumberField } from '../components/ui/NumberField';
import { Select } from '../components/ui/Select';
import { CombinePlanner } from '../components/sourcing/CombinePlanner';

interface Requirement {
  material: MaterialKey;
  /** Exact grade; undefined = any grade. Only the real API (matching model) uses it. */
  grade?: GradeKey;
  minPurity: number;
  tonnesPerMonth: number;
  /** A$ per month for the material, excluding freight. */
  budgetAud: number;
}

// Starting values per material: min purity %, t/month, A$/t ceiling. Volumes are set above most
// single suppliers so the combine view has something to do. Mock values follow the sample listings;
// live values follow the NSW dataset in the backend.
const MOCK_DEFAULTS: Partial<Record<MaterialKey, [number, number, number]>> = {
  copper: [99, 60, 20000], aluminium: [97, 150, 3700], steel: [97, 3000, 520], plastics: [99, 120, 1850],
  paper: [95, 2500, 220], ewaste: [0, 10, 9000], glass: [99, 6000, 150],
};
const LIVE_DEFAULTS: Partial<Record<MaterialKey, [number, number, number]>> = {
  steel: [0, 300, 520], aluminium: [0, 150, 3800], copper: [0, 60, 19900], brass: [0, 40, 11400], alloys: [0, 80, 2700],
};
const DEFAULTS = isMock ? MOCK_DEFAULTS : LIVE_DEFAULTS;
const OFFERED = MATERIAL_KEYS.filter(k => DEFAULTS[k]);

const requirement = (material: MaterialKey): Requirement => {
  const [minPurity, tonnesPerMonth, perT] = DEFAULTS[material] ?? [0, 10, 1000];
  return { material, grade: isMock ? undefined : 'high', minPurity, tonnesPerMonth, budgetAud: tonnesPerMonth * perT };
};

export function Matches() {
  const [params] = useSearchParams();
  const HOME_SITE = useSite();
  const initialMaterial = (OFFERED as string[]).includes(params.get('material') ?? '') ? (params.get('material') as MaterialKey) : OFFERED[0];

  const [draft, setDraft] = useState<Requirement>(() => requirement(initialMaterial));
  const [submitted, setSubmitted] = useState<Requirement>(draft);
  const supply = useAsync(() => api.listListings('supply', HOME_SITE), []);

  const update = (patch: Partial<Requirement>) => setDraft(d => ({ ...d, ...patch }));
  const onSubmit = (e: FormEvent) => { e.preventDefault(); setSubmitted(draft); };

  return (
    <main className="page">
      <div className="page-inner">
        <div className="page-head">
          <h1>Source recycled material</h1>
          <p>Describe what your plant needs each month. ResourceX combines suppliers into one order that reaches your volume within budget.</p>
        </div>

        <div className="matches-grid">
          <form className="panel form req-form" onSubmit={onSubmit}>
            <h2>Requirement</h2>
            <div className="field"><label htmlFor="m-material">Material</label>
              <Select<MaterialKey> id="m-material" value={draft.material} onChange={k => { const r = requirement(k); setDraft(r); setSubmitted(r); }}
                options={OFFERED.map(k => ({ value: k, label: MATERIALS[k].label, color: MATERIALS[k].color }))} />
            </div>
            {isMock ? (
              <label className="field" htmlFor="m-purity">Minimum purity
                <NumberField id="m-purity" decimals min={0} max={100} value={draft.minPurity} onChange={v => update({ minPurity: v ?? 0 })} suffix="%" />
              </label>
            ) : (
              <div className="field"><label htmlFor="m-grade">Grade</label>
                <Select<GradeKey | 'any'> id="m-grade" value={draft.grade ?? 'any'} onChange={g => update({ grade: g === 'any' ? undefined : g })}
                  options={[...(Object.keys(GRADES) as GradeKey[]).map(g => ({ value: g, label: GRADES[g] })), { value: 'any' as const, label: 'Any grade' }]} />
              </div>
            )}
            <label className="field" htmlFor="m-tonnes">How much you need each month
              <NumberField id="m-tonnes" min={1} value={draft.tonnesPerMonth || null} onChange={v => update({ tonnesPerMonth: v ?? 0 })} suffix="tonnes" />
            </label>
            <label className="field" htmlFor="m-budget">Monthly budget for the material (excluding freight)
              <NumberField id="m-budget" min={1} value={draft.budgetAud || null} onChange={v => update({ budgetAud: v ?? 0 })} prefix="$" />
              <span className="hint">That's about {aud(draft.tonnesPerMonth ? draft.budgetAud / draft.tonnesPerMonth : 0)} per tonne. {PRICE_NOTE}</span>
            </label>
            <label className="field">Delivery site
              <input id="m-site" value={`${HOME_SITE.name}, ${HOME_SITE.suburb} ${HOME_SITE.state}`} readOnly />
            </label>
            <button className="btn btn-primary" type="submit"><Sparkles size={16} />Update plan</button>
            {isMock
              ? <p className="hint">Demo mode: suggested splits are worked out in the browser. With VITE_API_URL set, they come from the matching model.</p>
              : <p className="hint">Suppliers must match the material and grade exactly, hold stock in the delivery window (next month) and fit the budget. Freight is estimated separately.</p>}
          </form>

          <div className="stack">
            {supply.error && !supply.data && <div className="panel empty">Couldn't load suppliers: {supply.error.message}</div>}
            {supply.data
              ? <CombinePlanner supply={supply.data} request={{ ...submitted, site: HOME_SITE }} />
              : !supply.error && <div className="skeleton" style={{ height: 240 }} />}
          </div>
        </div>
      </div>
    </main>
  );
}
