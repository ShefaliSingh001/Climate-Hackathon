import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Handshake, Send, Sparkles } from 'lucide-react';
import type { Listing } from '../../api/types';
import { api } from '../../api/client';
import { useAuth, useSite } from '../../auth/AuthProvider';
import { useAsync } from '../../hooks/useAsync';
import { MATERIALS } from '../../lib/materials';
import { roadKm } from '../../lib/geo';
import { cheapestFreight } from '../../lib/logistics';
import { PRICE_NOTE, aud, fmtInt, monthlyTonnes, tonnes as fmtTonnes } from '../../lib/format';
import { NumberField } from '../ui/NumberField';

const MAX_PARTNERS = 3;

/** Fills the request from your own listings first, then the nearest other suppliers. */
function suggest(need: number, mine: Listing[], others: Listing[]) {
  const out: Record<string, number> = {};
  let left = need;
  for (const l of [...mine, ...others.slice(0, MAX_PARTNERS)]) {
    if (left <= 0) break;
    const t = Math.min(left, Math.floor(monthlyTonnes(l.tonnes, l.frequency)));
    if (t > 0) { out[l.id] = t; left -= t; }
  }
  return out;
}

/**
 * Seller-side planner on a buyer request: combine your own supply with other recyclers' to cover a request
 * that is too big for one yard, then invite them to a joint offer.
 */
export function TeamUpPlanner({ request }: { request: Listing }) {
  const { account } = useAuth();
  const site = useSite();
  const supply = useAsync(() => api.listListings('supply', site), [site]);
  const need = Math.round(monthlyTonnes(request.tonnes, request.frequency));

  const { mine, others } = useMemo(() => {
    const same = (supply.data ?? []).filter(l => l.material === request.material);
    const isMine = (l: Listing) => !!account && l.abn === account.abn;
    const byDistance = (a: Listing, b: Listing) => roadKm(a, request) - roadKm(b, request);
    return { mine: same.filter(isMine).sort(byDistance), others: same.filter(l => !isMine(l)).sort(byDistance) };
  }, [supply.data, account, request]);

  const [lines, setLines] = useState<Record<string, number>>({});
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [err, setErr] = useState('');

  useEffect(() => { if (supply.data) setLines(suggest(need, mine, others)); }, [supply.data, need, mine, others]);

  const all = [...mine, ...others];
  const active = all.filter(l => (lines[l.id] ?? 0) > 0);
  const partners = active.filter(l => !mine.includes(l));
  const covered = active.reduce((s, l) => s + lines[l.id], 0);
  const materialCost = active.reduce((s, l) => s + lines[l.id] * l.priceAud, 0);
  const freightCost = active.reduce((s, l) => s + cheapestFreight(lines[l.id], roadKm(l, request)).cost, 0);
  const avgPrice = covered ? materialCost / covered : 0;
  const delivered = covered ? (materialCost + freightCost) / covered : 0;
  const myCapacity = mine.reduce((s, l) => s + monthlyTonnes(l.tonnes, l.frequency), 0);
  const withinPrice = covered > 0 && avgPrice <= request.priceAud;
  const short = Math.max(0, need - covered);
  const m = MATERIALS[request.material];

  const setT = (id: string, t: number | null) => setLines(prev => ({ ...prev, [id]: t ?? 0 }));
  const toggle = (l: Listing) => setT(l.id, lines[l.id] ? 0 : Math.min(Math.max(1, short || 1), Math.floor(monthlyTonnes(l.tonnes, l.frequency))));

  async function send() {
    setState('sending');
    try {
      await api.createCollaboration({ requestId: request.id, members: active.map(l => ({ listingId: l.id, tonnes: lines[l.id] })), message: message.trim() });
      setState('sent');
    } catch (e) {
      setErr((e as Error).message);
      setState('error');
    }
  }

  return (
    <section className="panel teamup" id="team-up">
      <div className="panel-head">
        <h2 className="with-icon"><Handshake size={16} />Team up with other recyclers</h2>
        <button type="button" className="link-btn" onClick={() => setLines(suggest(need, mine, others))}><Sparkles size={13} /> Suggest partners</button>
      </div>
      <p className="hint">
        {request.company} needs {fmtTonnes(need)} of {m.label.toLowerCase()} a month.
        {' '}{myCapacity > 0 ? `You list about ${fmtTonnes(myCapacity)} a month.` : `You have no ${m.label.toLowerCase()} listed, so you would coordinate the team.`}
        {' '}Combine with nearby suppliers and send one joint offer.
      </p>

      {supply.loading && !supply.data && <div className="skeleton" style={{ height: 140, marginTop: 12 }} />}

      {supply.data && (
        <>
          <div className="table-scroll">
            <table className="alloc teamup-table">
              <thead><tr><th /><th>Supplier</th><th className="r">Can supply</th><th className="r">Price</th><th className="r">To buyer</th><th className="r">Tonnes a month</th></tr></thead>
              <tbody>
                {all.slice(0, mine.length + 6).map(l => {
                  const on = (lines[l.id] ?? 0) > 0;
                  const own = mine.includes(l);
                  const cap = Math.floor(monthlyTonnes(l.tonnes, l.frequency));
                  return (
                    <tr key={l.id} className={on ? '' : 'off'}>
                      <td><input type="checkbox" checked={on} onChange={() => toggle(l)} aria-label={`Include ${l.company}`} /></td>
                      <td>
                        <div className="alloc-name">
                          <span className="code small" style={{ '--c': m.color } as CSSProperties} title={m.label}>{m.code}</span>
                          <div><b>{l.company}</b>{own && <span className="tag good" style={{ marginLeft: 6 }}>You</span>}<small>{l.suburb}, {l.state}</small></div>
                        </div>
                      </td>
                      <td className="r num">{fmtInt(cap)}<small>tonnes a month</small></td>
                      <td className="r num">{aud(l.priceAud)}<small>per tonne</small></td>
                      <td className="r num">{fmtInt(roadKm(l, request))} km</td>
                      <td className="r"><NumberField className="t-input" min={0} max={cap} value={lines[l.id] ?? 0} onChange={v => setT(l.id, v)} aria-label={`Tonnes from ${l.company}`} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="teamup-summary">
            <div className="meter">
              <div className="meter-head"><span>Covered</span><span className="num">{fmtInt(covered)} of {fmtTonnes(need)}</span></div>
              <div className="track"><div className="fill" style={{ width: `${Math.min(100, (covered / Math.max(1, need)) * 100)}%`, background: short ? 'var(--warn)' : 'var(--good)' }} /></div>
            </div>
            <dl className="stat-grid">
              <div><dt>Partners</dt><dd className="num">{partners.length}</dd></div>
              <div><dt>Average price</dt><dd className="num">{aud(avgPrice)}<small>buyer pays up to {aud(request.priceAud)}</small></dd></div>
              <div><dt>Delivered to buyer</dt><dd className="num">{aud(delivered)}<small>per tonne with freight</small></dd></div>
            </dl>
            <p className={`plan-status ${withinPrice && !short ? 'ok' : 'warn'}`}>
              {withinPrice && !short ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              {covered === 0 ? 'Pick at least one supplier.'
                : short ? `Short by ${fmtTonnes(short)} a month. Add a partner or raise tonnes.`
                : withinPrice ? 'Covers the whole request within the buyer’s price.'
                : `Average price is ${aud(avgPrice - request.priceAud)} per tonne over the buyer’s limit.`}
            </p>
          </div>

          <label className="field">Message to partners (optional)
            <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder={`e.g. Can you cover ${fmtTonnes(Math.max(1, short || 10))} a month from your yard?`} />
          </label>

          {state === 'sent' ? (
            <div className="notice ok"><CheckCircle2 size={16} />Invites sent to {partners.length} {partners.length === 1 ? 'partner' : 'partners'}. Follow replies in <Link to="/collaborations">Collaborations</Link>.</div>
          ) : (
            <div className="teamup-actions">
              <button type="button" className="btn btn-primary" disabled={!partners.length || state === 'sending'} onClick={send}>
                <Send size={15} />{state === 'sending' ? 'Sending…' : partners.length ? `Invite ${partners.length} ${partners.length === 1 ? 'partner' : 'partners'}` : 'Invite partners'}
              </button>
              {state === 'error' && <span className="err">{err}</span>}
              <span className="hint">Partners accept or decline in their Collaborations page. You send the joint offer once they reply. {PRICE_NOTE}</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
