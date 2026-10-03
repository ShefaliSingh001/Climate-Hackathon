import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, CheckCircle2, Plus, X } from 'lucide-react';
import { api, isMock } from '../../api/client';
import type { Listing, OrderPlanResult } from '../../api/types';
import { MATERIALS } from '../../lib/materials';
import { aud, co2e, fmtInt, tonnes } from '../../lib/format';
import { NumberField } from '../ui/NumberField';
import { Select } from '../ui/Select';
import { TRUCKS } from '../../lib/logistics';
import { allocate, spareCandidates, summarise, STRATEGIES, type Allocation, type OrderRequest, type Strategy } from '../../lib/sourcing';
import { RouteMap } from '../map/RouteMap';

interface Props {
  supply: Listing[];
  request: Omit<OrderRequest, 'strategy' | 'maxPartners' | 'verifiedOnly'>;
}

/** Fills one demand from several suppliers (via the matching model), then lets the buyer adjust the split by hand. */
export function CombinePlanner({ supply, request }: Props) {
  const [strategy, setStrategy] = useState<Strategy>('cost');
  const [maxPartners, setMaxPartners] = useState(4);
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [lines, setLines] = useState<Allocation[]>([]);
  const [sent, setSent] = useState(false);
  const [result, setResult] = useState<OrderPlanResult | null>(null);
  const [option, setOption] = useState(0);
  const [planning, setPlanning] = useState(false);
  const [failed, setFailed] = useState(false);

  const req: OrderRequest = { ...request, strategy, maxPartners, verifiedOnly };
  const reqKey = JSON.stringify(req);
  const byId = useMemo(() => new Map(supply.map(s => [s.id, s])), [supply]);

  const linesFor = (r: OrderPlanResult | null, i: number): Allocation[] =>
    (r?.plans[i]?.lines ?? []).flatMap(l => {
      const listing = byId.get(l.listingId);
      return listing ? [allocate(listing, l.tonnes, req.site)] : [];
    });

  // Re-plan whenever the requirement or options change; manual edits apply on top until then.
  useEffect(() => {
    let live = true;
    setPlanning(true);
    setSent(false);
    api.planOrder(req).then(
      r => { if (live) { setResult(r); setOption(0); setLines(linesFor(r, 0)); setFailed(false); setPlanning(false); } },
      () => { if (live) { setResult(null); setLines([]); setFailed(true); setPlanning(false); } },
    );
    return () => { live = false; };
  }, [byId, reqKey]);

  const pickOption = (i: number) => { setOption(i); setLines(linesFor(result, i)); setSent(false); };

  const plan = useMemo(() => summarise(lines, req), [lines, reqKey]);
  const spare = spareCandidates(supply, req, lines);

  const setTonnes = (id: string, t: number) =>
    setLines(ls => ls.map(l => (l.listing.id === id ? allocate(l.listing, t, req.site) : l)));
  const remove = (id: string) => setLines(ls => ls.filter(l => l.listing.id !== id));
  const add = (id: string) => {
    const listing = supply.find(s => s.id === id);
    if (listing) setLines(ls => [...ls, allocate(listing, Math.max(plan.shortfallT, 1), req.site)]);
  };

  async function requestAll() {
    await Promise.all(lines.filter(l => l.tonnes > 0).map(l =>
      api.sendEnquiry(l.listing.id, { tonnesPerMonth: Math.round(l.tonnes), firstDelivery: 'November 2026', message: 'Part of a combined order via ResourceX.' })));
    setSent(true);
  }

  const coverage = req.tonnesPerMonth ? Math.min(100, (plan.tonnes / req.tonnesPerMonth) * 100) : 0;
  const spend = req.budgetAud ? (plan.materialTotal / req.budgetAud) * 100 : 0;
  const met = plan.shortfallT < 0.5;
  const inBudget = plan.budgetLeft >= 0;

  return (
    <div className="stack">
      <section className="panel">
        <div className="filter-row">
          <Select<Strategy> id="c-strategy" size="sm" prefix="Optimise for" aria-label="Optimise for" value={strategy} onChange={setStrategy}
            options={(Object.keys(STRATEGIES) as Strategy[]).map(k => ({ value: k, label: STRATEGIES[k] }))} />
          <Select<number> id="c-partners" size="sm" prefix="Up to" aria-label="Maximum partners" value={maxPartners} onChange={setMaxPartners}
            options={[2, 3, 4, 5, 6, 8].map(n => ({ value: n, label: `${n} partners` }))} />
          <label className="toggle"><input id="c-verified" type="checkbox" checked={verifiedOnly} onChange={e => setVerifiedOnly(e.target.checked)} /> Verified only</label>
        </div>
      </section>

      {result && result.plans.length > 1 && (
        <section className="panel">
          <div className="filter-row" role="radiogroup" aria-label="Alternative plans">
            {result.plans.map((p, i) => (
              <button key={p.rank} type="button" className="chip" role="radio" aria-checked={i === option} aria-pressed={i === option} onClick={() => pickOption(i)}>
                Option {p.rank} · <span className="num">{aud(p.totalCostAud)}</span> · {p.supplierCount} {p.supplierCount === 1 ? 'partner' : 'partners'}
              </button>
            ))}
          </div>
          <p className="hint">Each option uses a different set of suppliers. Costs are supplier prices before freight.</p>
        </section>
      )}

      {failed && <div className="panel empty">Couldn't plan this order. Check the API is running and try again.</div>}
      {result?.notice && <p className="hint">{result.notice}</p>}

      <section className={`panel plan-summary ${met && inBudget ? 'ok' : 'warn'}`} aria-busy={planning}>
        <div className="plan-status">
          {!lines.length && result?.reason && <><b>No combination found.</b> {result.reason}{result.shortfallTonnes ? ` Short by ${tonnes(result.shortfallTonnes)} of compatible stock.` : ''}</>}
          {met && inBudget && <><CheckCircle2 size={18} /><b>Demand met within budget</b> using {lines.filter(l => l.tonnes > 0).length} partners</>}
          {lines.length > 0 && !met && <><b>Short by {tonnes(plan.shortfallT)} a month.</b> Add a partner, allow more partners or untick “Verified only”.</>}
          {met && !inBudget && <><b>Over budget by {aud(-plan.budgetLeft)} a month.</b> Try “Lowest cost” or raise the budget.</>}
          {!lines.length && !result?.reason && !failed && <>Planning…</>}
        </div>
        <div className="meters">
          <div className="meter">
            <div className="meter-head"><span>Volume each month</span><span className="num">{fmtInt(plan.tonnes)} of {tonnes(req.tonnesPerMonth)}</span></div>
            <div className="track"><div className="fill" style={{ width: `${coverage}%`, background: met ? 'var(--good)' : 'var(--warn)' }} /></div>
          </div>
          <div className="meter">
            <div className="meter-head"><span>Material budget each month</span><span className="num">{aud(plan.materialTotal)} of {aud(req.budgetAud)}</span></div>
            <div className="track"><div className="fill" style={{ width: `${Math.min(100, spend)}%`, background: inBudget ? 'var(--good)' : 'var(--danger)' }} /></div>
          </div>
        </div>
        <dl className="stat-grid">
          <div><dt>Average delivered cost</dt><dd className="num">{aud(plan.avgLandedPerTonne)}<small>per tonne</small></dd></div>
          <div><dt>{inBudget ? 'Under budget' : 'Over budget'}</dt><dd className="num">{aud(Math.abs(plan.budgetLeft))}<small>per month</small></dd></div>
          <div><dt>Emissions avoided</dt><dd className="num">{tonnes(plan.avoidedCo2eT)}<small><abbr title="carbon dioxide equivalent">CO₂e</abbr> per month</small></dd></div>
          <div><dt>Truck emissions</dt><dd className="num">{co2e(plan.freightCo2eT)}<small><abbr title="carbon dioxide equivalent">CO₂e</abbr> per month</small></dd></div>
        </dl>
      </section>

      <div className="combine-grid">
        <section className="panel table-panel">
          <h2>Order split</h2>
          {lines.length === 0 ? (
            <div className="empty">No suppliers in this plan. Change the grade, allow more partners, untick “Verified only” or add a supplier below.</div>
          ) : (
            <div className="table-scroll">
              <table className="alloc">
                <thead>
                  <tr><th>Partner</th><th className="r">Tonnes per month</th><th className="r">Price per tonne</th><th className="r">Freight per tonne</th><th className="r">Delivered per tonne</th><th className="r">Monthly total</th><th /></tr>
                </thead>
                <tbody>
                  {lines.map(a => (
                    <tr key={a.listing.id}>
                      <td>
                        <div className="alloc-name">
                          <span className="code small" style={{ '--c': MATERIALS[a.listing.material].color } as CSSProperties} title={MATERIALS[a.listing.material].label}>{MATERIALS[a.listing.material].code}</span>
                          <div>
                            <Link to={`/listing/${a.listing.id}`}>{a.listing.company}</Link>
                            {a.listing.verified && <span className="verified"><BadgeCheck size={13} /></span>}
                            <small>{a.listing.suburb}, {a.listing.state} · {fmtInt(a.distanceKm)} km · {a.freight.trips} {a.freight.trips === 1 ? 'trip' : 'trips'} by {TRUCKS[a.freight.truck].label.toLowerCase()}</small>
                          </div>
                        </div>
                      </td>
                      <td className="r">
                        <NumberField className="t-input" min={0} max={Math.round(a.capacityT)} value={Math.round(a.tonnes)}
                          aria-label={`Tonnes per month from ${a.listing.company}`} onChange={v => setTonnes(a.listing.id, v ?? 0)} />
                        <small>of {tonnes(a.capacityT)} available</small>
                      </td>
                      <td className="r num">{aud(a.listing.priceAud)}</td>
                      <td className="r num">{aud(a.freight.perTonne)}</td>
                      <td className="r num"><b>{aud(a.landedPerTonne)}</b></td>
                      <td className="r num">{aud(a.total)}</td>
                      <td><button className="icon-btn" onClick={() => remove(a.listing.id)} aria-label={`Remove ${a.listing.company}`}><X size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td>Total</td><td className="r num">{tonnes(plan.tonnes)}</td><td /><td /><td className="r num">{aud(plan.avgLandedPerTonne)}</td><td className="r num"><b>{aud(plan.total)}</b></td><td /></tr>
                </tfoot>
              </table>
            </div>
          )}
          {spare.length > 0 && (
            <div className="add-row">
              <Plus size={15} />
              <Select<string> id="c-add" className="grow" value={null} placeholder="Add another supplier…" aria-label="Add a supplier" onChange={add}
                options={spare.map(s => ({ value: s.id, label: s.company, hint: `${s.suburb}, ${s.state} · ${aud(s.priceAud)} per tonne` }))} />
            </div>
          )}
          <div className="add-row">
            {sent ? (
              <div className="notice" role="status"><CheckCircle2 size={16} />
                <div>Quote requests sent to {lines.filter(l => l.tonnes > 0).length} partners.{isMock && ' Demo mode: nothing left this browser.'}</div>
              </div>
            ) : (
              <button className="btn btn-primary" disabled={!lines.some(l => l.tonnes > 0)} onClick={requestAll}>Request quotes from all partners</button>
            )}
          </div>
        </section>

        <section className="panel flush">
          <RouteMap site={req.site} listings={lines.filter(l => l.tonnes > 0).map(l => l.listing)} height={340} />
        </section>
      </div>
      <p className="hint">
        {isMock ? 'Demo mode: the split is a quick greedy estimate in the browser.' : 'The split comes from the ResourceX matching model: exact material and grade, every partner available in the delivery window, the exact tonnes and the material budget.'}
        {' '}Landed cost = supplier price + estimated road freight to your site. Freight uses the cheapest truck per partner and assumes an empty return leg.
      </p>
    </div>
  );
}
