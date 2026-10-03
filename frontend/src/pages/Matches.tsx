import { useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BadgeCheck, Layers3, ListOrdered, Sparkles, Trophy } from 'lucide-react';
import { api, isMock } from '../api/client';
import type { GradeKey, MaterialKey } from '../api/types';
import { useAsync } from '../hooks/useAsync';
import { GRADES, MATERIALS, MATERIAL_KEYS } from '../lib/materials';
import { useSite } from '../auth/AuthProvider';
import { aud, fmtInt, per } from '../lib/format';
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
  copper: [99, 60, 13600], aluminium: [97, 150, 3000], steel: [97, 3000, 520], plastics: [99, 120, 1850],
  paper: [95, 2500, 220], ewaste: [0, 10, 9000], glass: [99, 6000, 150],
};
const LIVE_DEFAULTS: Partial<Record<MaterialKey, [number, number, number]>> = {
  steel: [0, 300, 330], aluminium: [0, 150, 1600], copper: [0, 60, 8000], brass: [0, 40, 5500], alloys: [0, 80, 2200],
};
const DEFAULTS = isMock ? MOCK_DEFAULTS : LIVE_DEFAULTS;
const OFFERED = MATERIAL_KEYS.filter(k => DEFAULTS[k]);

const requirement = (material: MaterialKey): Requirement => {
  const [minPurity, tonnesPerMonth, perT] = DEFAULTS[material] ?? [0, 10, 1000];
  return { material, grade: isMock ? undefined : 'high', minPurity, tonnesPerMonth, budgetAud: tonnesPerMonth * perT };
};

type Tab = 'ranked' | 'combine';

export function Matches() {
  const [params, setParams] = useSearchParams();
  const HOME_SITE = useSite();
  const tab: Tab = params.get('tab') === 'combine' ? 'combine' : 'ranked';
  const initialMaterial = (OFFERED as string[]).includes(params.get('material') ?? '') ? (params.get('material') as MaterialKey) : OFFERED[0];

  const [draft, setDraft] = useState<Requirement>(() => requirement(initialMaterial));
  const [submitted, setSubmitted] = useState<Requirement>(draft);
  const ceiling = submitted.tonnesPerMonth ? submitted.budgetAud / submitted.tonnesPerMonth : 0;

  const ranked = useAsync(
    () => api.findMatches({ material: submitted.material, grade: submitted.grade, minPurity: submitted.minPurity, tonnesPerMonth: submitted.tonnesPerMonth, maxPriceAud: ceiling, site: HOME_SITE }),
    [submitted],
  );
  const supply = useAsync(() => api.listListings('supply', HOME_SITE), []);

  const update = (patch: Partial<Requirement>) => setDraft(d => ({ ...d, ...patch }));
  const onSubmit = (e: FormEvent) => { e.preventDefault(); setSubmitted(draft); };
  const setTab = (t: Tab) => setParams(p => { p.set('tab', t); return p; }, { replace: true });

  return (
    <main className="page">
      <div className="page-inner">
        <div className="page-head">
          <h1>Source recycled material</h1>
          <p>Describe what your plant needs each month. Rank single suppliers, or let ResourceX split the order across several partners to reach your volume within budget.</p>
        </div>

        <div className="matches-grid">
          <form className="panel form req-form" onSubmit={onSubmit}>
            <h2>Requirement</h2>
            <label className="field">Material
              <select id="m-material" value={draft.material} onChange={e => { const r = requirement(e.target.value as MaterialKey); setDraft(r); setSubmitted(r); }}>
                {OFFERED.map(k => <option key={k} value={k}>{MATERIALS[k].label}</option>)}
              </select>
            </label>
            {isMock ? (
              <label className="field">Minimum purity (%)
                <input id="m-purity" type="number" step={0.1} min={0} max={100} value={draft.minPurity} onChange={e => update({ minPurity: Number(e.target.value) })} />
              </label>
            ) : (
              <label className="field">Grade
                <select id="m-grade" value={draft.grade ?? ''} onChange={e => update({ grade: (e.target.value || undefined) as GradeKey | undefined })}>
                  {(Object.keys(GRADES) as GradeKey[]).map(g => <option key={g} value={g}>{GRADES[g]}</option>)}
                  <option value="">Any grade</option>
                </select>
              </label>
            )}
            <label className="field">Demand (tonnes / month)
              <input id="m-tonnes" type="number" min={1} value={draft.tonnesPerMonth} onChange={e => update({ tonnesPerMonth: Number(e.target.value) })} />
            </label>
            <label className="field">Material budget (A$ / month, excl. freight)
              <input id="m-budget" type="number" min={1} step={1000} value={draft.budgetAud} onChange={e => update({ budgetAud: Number(e.target.value) })} />
              <span className="hint">≈ {aud(draft.tonnesPerMonth ? draft.budgetAud / draft.tonnesPerMonth : 0)} per tonne</span>
            </label>
            <label className="field">Delivery site
              <input id="m-site" value={`${HOME_SITE.name}, ${HOME_SITE.suburb} ${HOME_SITE.state}`} readOnly />
            </label>
            <button className="btn btn-primary" type="submit"><Sparkles size={16} />Update results</button>
            {isMock
              ? <p className="hint">Demo mode: scores and splits are calculated in the browser. With VITE_API_URL set, ranking comes from the matching model.</p>
              : <p className="hint">Suppliers must match the material and grade exactly, hold stock in the delivery window (next month) and fit the budget. Freight is estimated separately.</p>}
          </form>

          <div className="stack">
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'ranked'} onClick={() => setTab('ranked')}><ListOrdered size={16} />Ranked suppliers</button>
              <button role="tab" aria-selected={tab === 'combine'} onClick={() => setTab('combine')}><Layers3 size={16} />Combine suppliers</button>
            </div>

            {tab === 'combine' ? (
              supply.data
                ? <CombinePlanner supply={supply.data} request={{ ...submitted, site: HOME_SITE }} />
                : <div className="skeleton" style={{ height: 240 }} />
            ) : (
              <div className="mlist" aria-live="polite" aria-busy={ranked.loading}>
                {ranked.error && <div className="panel empty">Couldn't load matches: {ranked.error.message}</div>}
                {ranked.loading && !ranked.data && [0, 1, 2].map(i => <div key={i} className="skeleton" style={{ height: 110 }} />)}
                {ranked.data && ranked.data.length === 0 && <div className="panel empty">No supply listed for this material yet.</div>}
                {ranked.data?.map((r, i) => {
                  const l = r.listing;
                  return (
                    <article key={l.id} className="mcard" style={{ opacity: ranked.loading || r.eligible === false ? 0.6 : 1 }}>
                      <span className="rank">#{i + 1}</span>
                      <div style={{ minWidth: 0 }}>
                        <h3>
                          <span className="code small" style={{ '--c': MATERIALS[l.material].color } as CSSProperties}>{MATERIALS[l.material].code}</span>
                          <Link to={`/listing/${l.id}`}>{l.company}</Link>
                          {l.verified && <span className="verified"><BadgeCheck size={15} /></span>}
                          {r.inBestPlan && <span className="tag good" title="Part of the cheapest combined order"><Trophy size={13} /> Best combined order</span>}
                        </h3>
                        <p>{l.grade} · <span className="num">{fmtInt(l.tonnes)} t/{per(l.frequency)}</span> · <span className="num">{aud(l.priceAud)}/t</span> · {l.suburb}, {l.state}</p>
                        <p className="why">{r.reasons.join(' · ')}</p>
                      </div>
                      <div className="bars">
                        <div className="total"><span>Match score</span><b>{r.score}</b></div>
                        {(['material', 'distance', 'price', 'reliability'] as const).map(k => (
                          <div key={k} className="bar">
                            <span style={{ textTransform: 'capitalize' }}>{k}</span>
                            <div className="track"><div className="fill" style={{ width: `${r.breakdown[k]}%` }} /></div>
                            <span className="num">{r.breakdown[k]}</span>
                          </div>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
