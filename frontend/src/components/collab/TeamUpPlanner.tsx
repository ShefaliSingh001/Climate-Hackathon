import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Handshake, Plus, Send, Sparkles, X } from 'lucide-react';
import type { Listing } from '../../api/types';
import { api } from '../../api/client';
import { useAuth, useSite } from '../../auth/AuthProvider';
import { useAsync } from '../../hooks/useAsync';
import { MATERIALS } from '../../lib/materials';
import { roadKm } from '../../lib/geo';
import { cheapestFreight } from '../../lib/logistics';
import { PRICE_NOTE, aud, fmtInt, monthlyTonnes, tonnes as fmtTonnes } from '../../lib/format';
import { NumberField } from '../ui/NumberField';
import { SupplierPicker } from '../sourcing/SupplierPicker';

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
 * that is too big for one yard, then invite them to a joint offer. Partners are picked from the same card pop-up
 * buyers use (SupplierPicker), or suggested from the nearest recyclers.
 */
export function TeamUpPlanner({ request }: { request: Listing }) {
  const { account } = useAuth();
  const site = useSite();
  const supply = useAsync(() => api.listListings('supply', site), [site]);
  const need = Math.round(monthlyTonnes(request.tonnes, request.frequency));

  const { mine, others } = useMemo(() => {
    // Same material, and never the buyer itself (some businesses both buy and sell).
    const same = (supply.data ?? []).filter(l => l.material === request.material && l.abn !== request.abn);
    const isMine = (l: Listing) => !!account && l.abn === account.abn;
    const byDistance = (a: Listing, b: Listing) => roadKm(a, request) - roadKm(b, request);
    return { mine: same.filter(isMine).sort(byDistance), others: same.filter(l => !isMine(l)).sort(byDistance) };
  }, [supply.data, account, request]);

  const [lines, setLines] = useState<Record<string, number>>({});
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [err, setErr] = useState('');
  const [picking, setPicking] = useState(false);

  useEffect(() => { if (supply.data) setLines(suggest(need, mine, others)); }, [supply.data, need, mine, others]);

  const all = [...mine, ...others];
  // Rows shown: your own listings always, then the partners you've added (in the order added).
  const chosen = [...mine, ...Object.keys(lines).map(id => others.find(l => l.id === id)).filter((l): l is Listing => !!l)];
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
  const remove = (id: string) => setLines(({ [id]: _gone, ...rest }) => rest);
  const candidates = others.filter(l => !(l.id in lines));
  /** Adds partners from the pop-up, each covering as much of what is still short as it can. */
  function addPartners(ids: string[]) {
    setPicking(false);
    setLines(prev => {
      let left = Math.max(0, need - Object.values(prev).reduce((a, b) => a + b, 0));
      const next = { ...prev };
      for (const id of ids) {
        const l = others.find(o => o.id === id);
        if (!l) continue;
        const t = Math.max(1, Math.min(Math.floor(monthlyTonnes(l.tonnes, l.frequency)), left || 1));
        next[id] = t;
        left = Math.max(0, left - t);
      }
      return next;
    });
  }

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
        <div className="split-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicking(true)} disabled={!candidates.length}><Plus size={14} />Add partners</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLines(suggest(need, mine, others))}><Sparkles size={14} />Suggest partners</button>
        </div>
      </div>
      <p className="hint">
        {request.company} needs {fmtTonnes(need)} of {m.label.toLowerCase()} a month.
        {' '}{myCapacity > 0 ? `You list about ${fmtTonnes(myCapacity)} a month.` : `You have no ${m.label.toLowerCase()} listed, so you would coordinate the team.`}
        {' '}Combine with nearby suppliers and send one joint offer.
      </p>

      {supply.loading && !supply.data && <div className="skeleton" style={{ height: 140, marginTop: 12 }} />}

      {supply.data && (
        <>
          {chosen.length === 0 ? (
            <div className="split-empty">
              <Handshake size={26} />
              <p><b>No partners yet.</b><br />Add recyclers who list {m.label.toLowerCase()}, or let ResourceX suggest the nearest ones.</p>
              <div className="split-empty-actions">
                <button type="button" className="btn btn-primary" onClick={() => setPicking(true)} disabled={!candidates.length}><Plus size={16} />Add partners</button>
                <button type="button" className="btn btn-ghost" onClick={() => setLines(suggest(need, mine, others))}><Sparkles size={16} />Suggest partners</button>
              </div>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="alloc teamup-table">
                <thead><tr><th>Team</th><th className="r">Can supply</th><th className="r">Price</th><th className="r">To buyer</th><th className="r">Tonnes a month</th><th /></tr></thead>
                <tbody>
                  {chosen.map(l => {
                    const own = mine.includes(l);
                    const cap = Math.floor(monthlyTonnes(l.tonnes, l.frequency));
                    return (
                      <tr key={l.id} className={(lines[l.id] ?? 0) > 0 ? '' : 'off'}>
                        <td>
                          <div className="alloc-name">
                            <span className="code small" style={{ '--c': m.color } as CSSProperties} title={m.label}>{m.code}</span>
                            <div><b>{l.company}</b>{own ? <span className="tag good" style={{ marginLeft: 6 }}>You</span> : <span className="tag" style={{ marginLeft: 6 }}>Invite</span>}<small>{l.suburb}, {l.state}</small></div>
                          </div>
                        </td>
                        <td className="r num">{fmtInt(cap)}<small>tonnes a month</small></td>
                        <td className="r num">{aud(l.priceAud)}<small>per tonne</small></td>
                        <td className="r num">{fmtInt(roadKm(l, request))} km</td>
                        <td className="r"><NumberField className="t-input" min={0} max={cap} value={lines[l.id] ?? 0} onChange={v => setT(l.id, v)} aria-label={`Tonnes from ${l.company}`} /></td>
                        <td>{!own && <button type="button" className="icon-btn" onClick={() => remove(l.id)} aria-label={`Remove ${l.company}`}><X size={15} /></button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

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
      {picking && (
        <SupplierPicker
          candidates={candidates}
          site={request}
          title="Add partners"
          noun={{ one: 'partner', many: 'partners' }}
          distanceText="to the buyer"
          intro={`${candidates.length} other ${candidates.length === 1 ? 'recycler lists' : 'recyclers list'} ${m.label.toLowerCase()} · ranked for ${request.company}${short > 0 ? ` · the team still needs ${fmtTonnes(short)} a month` : ''}.`.replace(/\.\.$/, '.')}
          onAdd={addPartners}
          onClose={() => setPicking(false)}
        />
      )}
    </section>
  );
}
