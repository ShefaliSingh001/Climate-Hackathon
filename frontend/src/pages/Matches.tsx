import { useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Sparkles } from 'lucide-react';
import { api, isMock } from '../api/client';
import type { MatchRequest, MaterialKey } from '../api/types';
import { useAsync } from '../hooks/useAsync';
import { MATERIALS, MATERIAL_KEYS } from '../lib/materials';
import { HOME_SITE } from '../lib/regions';
import { aud, fmtInt, per } from '../lib/format';

// Sensible starting values per material (min purity %, t/month, max A$/t).
const DEFAULTS: Record<MaterialKey, [number, number, number]> = {
  copper: [99, 20, 13300], aluminium: [97, 40, 2900], steel: [97, 500, 470], plastics: [99, 30, 1750],
  paper: [95, 500, 190], ewaste: [0, 5, 9000], glass: [99, 1000, 130],
};

const request = (material: MaterialKey): MatchRequest => {
  const [minPurity, tonnesPerMonth, maxPriceAud] = DEFAULTS[material];
  return { material, minPurity, tonnesPerMonth, maxPriceAud, site: HOME_SITE };
};

export function Matches() {
  const [draft, setDraft] = useState<MatchRequest>(() => request('copper'));
  const [submitted, setSubmitted] = useState<MatchRequest>(draft);
  const { data, loading, error } = useAsync(() => api.findMatches(submitted), [submitted]);

  const update = (patch: Partial<MatchRequest>) => setDraft(d => ({ ...d, ...patch }));
  const onSubmit = (e: FormEvent) => { e.preventDefault(); setSubmitted(draft); };

  return (
    <main className="page">
      <div className="page-inner">
        <div className="page-head">
          <h1>AI matches for your requirement</h1>
          <p>Describe what your plant needs. CircuLink ranks verified Australian supply by material fit, distance by road, price against virgin feedstock and supplier reliability.</p>
        </div>
        <div className="matches-grid">
          <form className="panel form" onSubmit={onSubmit}>
            <h2>Requirement</h2>
            <label className="field">Material
              <select id="m-material" value={draft.material} onChange={e => { const r = request(e.target.value as MaterialKey); setDraft(r); setSubmitted(r); }}>
                {MATERIAL_KEYS.map(k => <option key={k} value={k}>{MATERIALS[k].label}</option>)}
              </select>
            </label>
            <label className="field">Minimum purity (%)
              <input id="m-purity" type="number" step={0.1} min={0} max={100} value={draft.minPurity} onChange={e => update({ minPurity: Number(e.target.value) })} />
            </label>
            <div className="form-row">
              <label className="field">Tonnes / month
                <input id="m-tonnes" type="number" min={1} value={draft.tonnesPerMonth} onChange={e => update({ tonnesPerMonth: Number(e.target.value) })} />
              </label>
              <label className="field">Max A$ / t
                <input id="m-price" type="number" min={1} value={draft.maxPriceAud} onChange={e => update({ maxPriceAud: Number(e.target.value) })} />
              </label>
            </div>
            <label className="field">Delivery site
              <input id="m-site" value={`${HOME_SITE.name}, ${HOME_SITE.suburb} ${HOME_SITE.state}`} readOnly />
            </label>
            <button className="btn btn-primary" type="submit"><Sparkles size={16} />Find matches</button>
            {isMock && <p className="hint">Demo mode: scores come from a weighted formula in the browser. With VITE_API_URL set, they come from the matching service.</p>}
          </form>

          <div className="mlist" aria-live="polite" aria-busy={loading}>
            {error && <div className="panel empty">Couldn't load matches: {error.message}</div>}
            {loading && !data && [0, 1, 2].map(i => <div key={i} className="skeleton" style={{ height: 110 }} />)}
            {data && data.length === 0 && <div className="panel empty">No supply listed for this material yet.</div>}
            {data?.map((r, i) => {
              const l = r.listing;
              return (
                <article key={l.id} className="mcard" style={{ opacity: loading ? 0.6 : 1 }}>
                  <span className="rank">#{i + 1}</span>
                  <div style={{ minWidth: 0 }}>
                    <h3>
                      <span className="code small" style={{ '--c': MATERIALS[l.material].color } as CSSProperties}>{MATERIALS[l.material].code}</span>
                      <Link to={`/listing/${l.id}`}>{l.company}</Link>
                      {l.verified && <span className="verified"><BadgeCheck size={15} /></span>}
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
        </div>
      </div>
    </main>
  );
}
