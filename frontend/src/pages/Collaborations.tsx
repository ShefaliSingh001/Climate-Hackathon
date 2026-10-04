import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Clock, Crown, Handshake, Send, Undo2, Users, XCircle } from 'lucide-react';
import type { Collaboration, CollaborationMember, Listing } from '../api/types';
import { api, isMock } from '../api/client';
import { useAuth, useSite } from '../auth/AuthProvider';
import { useAsync } from '../hooks/useAsync';
import { MATERIALS } from '../lib/materials';
import { PRICE_NOTE, aud, fmtInt, monthlyTonnes, shortDate, tonnes as fmtTonnes } from '../lib/format';

type Tab = 'invites' | 'teams' | 'open';

const MEMBER: Record<CollaborationMember['status'], { label: string; icon: ReactNode }> = {
  lead: { label: 'Lead', icon: <Crown size={12} /> },
  invited: { label: 'Invited', icon: <Clock size={12} /> },
  accepted: { label: 'Accepted', icon: <CheckCircle2 size={12} /> },
  declined: { label: 'Declined', icon: <XCircle size={12} /> },
};

function CollabCard({ c, me, onAction, busy }: {
  c: Collaboration; me: (m: CollaborationMember) => boolean; busy: boolean;
  onAction: (kind: 'accept' | 'decline' | 'offer' | 'withdraw', id: string) => void;
}) {
  const m = MATERIALS[c.material];
  const mine = c.members.find(me);
  const lead = c.members.find(x => x.status === 'lead');
  const iLead = !!mine && mine.status === 'lead';
  const counted = c.members.filter(x => x.status === 'lead' || x.status === 'accepted');
  const covered = counted.reduce((s, x) => s + x.tonnes, 0);
  const pending = c.members.filter(x => x.status === 'invited').length;
  const avg = covered ? counted.reduce((s, x) => s + x.tonnes * x.priceAud, 0) / covered : 0;
  const pct = Math.min(100, (covered / Math.max(1, c.tonnesNeeded)) * 100);

  return (
    <article className={`collab-card${c.status === 'withdrawn' ? ' muted' : ''}`}>
      <header className="cc-head">
        <span className="code small square" style={{ '--c': m.color } as CSSProperties} title={m.label}>{m.code}</span>
        <div className="cc-title">
          <h3><Link to={`/listing/${c.requestId}`}>{c.buyer.company}</Link></h3>
          <p>{c.buyer.suburb}, {c.buyer.state} · needs {fmtTonnes(c.tonnesNeeded)} of {m.label.toLowerCase()} a month · pays up to {aud(c.maxPriceAud)} per tonne</p>
        </div>
        <span className={`status c-${c.status}`}>
          {c.status === 'offer_sent' ? <><Send size={12} />Offer sent</> : c.status === 'withdrawn' ? <><Undo2 size={12} />Withdrawn</> : <><Users size={12} />Forming</>}
        </span>
      </header>

      {!iLead && lead && c.message && (
        <blockquote className="cc-msg"><b>{lead.company}:</b> “{c.message}”</blockquote>
      )}

      <table className="cc-members">
        <tbody>
          {c.members.map(x => (
            <tr key={x.company} className={me(x) ? 'me' : ''}>
              <td><b>{x.company}</b>{me(x) && <span className="tag good">You</span>}<small>{x.suburb}, {x.state} · {fmtInt(x.distanceKm)} km to buyer</small></td>
              <td className="r num">{fmtTonnes(x.tonnes)}<small>a month</small></td>
              <td className="r num">{x.priceAud ? aud(x.priceAud) : '—'}<small>per tonne</small></td>
              <td><span className={`mstatus m-${x.status}`}>{MEMBER[x.status].icon}{MEMBER[x.status].label}</span></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="cc-foot">
        <div className="meter">
          <div className="meter-head"><span>Committed so far</span><span className="num">{fmtInt(covered)} of {fmtTonnes(c.tonnesNeeded)} · average {aud(avg)} per tonne</span></div>
          <div className="track"><div className="fill" style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--good)' : 'var(--warn)' }} /></div>
        </div>
        <div className="cc-actions">
          {mine?.status === 'invited' && c.status === 'forming' && (
            <>
              <button className="btn btn-primary" disabled={busy} onClick={() => onAction('accept', c.id)}><CheckCircle2 size={15} />Accept {fmtTonnes(mine.tonnes)} a month</button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => onAction('decline', c.id)}>Decline</button>
            </>
          )}
          {mine?.status === 'accepted' && c.status === 'forming' && <span className="hint">You're in. {lead?.company} sends the joint offer once everyone replies.</span>}
          {iLead && c.status === 'forming' && (
            <>
              <button className="btn btn-primary" disabled={busy || pending > 0 || covered === 0} onClick={() => onAction('offer', c.id)} title={pending ? 'Waiting for partners to reply' : undefined}>
                <Send size={15} />Send joint offer to buyer
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => onAction('withdraw', c.id)}>Withdraw</button>
              {pending > 0 && <span className="hint">Waiting for {pending} {pending === 1 ? 'partner' : 'partners'} to reply{isMock ? ' (demo partners reply within a few seconds)' : ''}.</span>}
            </>
          )}
          {c.status === 'offer_sent' && <span className="hint">Offer sent to {c.buyer.company}. Track it in <Link to="/orders">Orders</Link>.</span>}
        </div>
        <p className="hint cc-date">Started {shortDate(c.createdAt)}{lead ? ` by ${lead.company}` : ''}</p>
      </div>
    </article>
  );
}

/** Seller collaborations: invites from other recyclers, teams you lead, and requests worth teaming up on. */
export function Collaborations() {
  const { account } = useAuth();
  const site = useSite();
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('invites');
  const list = useAsync(() => api.listCollaborations(), [account?.id, version]);
  const supply = useAsync(() => api.listListings('supply', site), [site]);
  const demand = useAsync(() => api.listListings('demand', site), [site]);

  const me = (x: CollaborationMember) => !!account && (x.abn ? x.abn === account.abn : x.company === account.company);
  const all = list.data ?? [];
  const invites = all.filter(c => c.members.some(x => me(x) && x.status !== 'lead'));
  const teams = all.filter(c => c.members.some(x => me(x) && x.status === 'lead'));
  const waiting = invites.filter(c => c.status === 'forming' && c.members.some(x => me(x) && x.status === 'invited')).length;

  // Keep teams you lead fresh while partners are replying.
  const replying = teams.some(c => c.status === 'forming' && c.members.some(x => x.status === 'invited'));
  useEffect(() => {
    if (!replying) return;
    const t = setInterval(() => setVersion(v => v + 1), 4000);
    return () => clearInterval(t);
  }, [replying]);

  // Buyer requests for materials you sell; the ones bigger than what you list come first.
  const open = useMemo(() => {
    const mine = (supply.data ?? []).filter(l => account && l.abn === account.abn);
    const capacity = mine.reduce<Record<string, number>>((m, l) => ({ ...m, [l.material]: (m[l.material] ?? 0) + monthlyTonnes(l.tonnes, l.frequency) }), {});
    return (demand.data ?? [])
      .filter(r => capacity[r.material] != null && r.abn !== account?.abn)
      .map(r => ({ r, have: capacity[r.material], need: monthlyTonnes(r.tonnes, r.frequency) }))
      .sort((a, b) => (b.need - b.have) - (a.need - a.have));
  }, [supply.data, demand.data, account]);

  const committed = all.filter(c => c.status !== 'withdrawn').reduce((s, c) => s + (c.members.find(x => me(x) && (x.status === 'lead' || x.status === 'accepted'))?.tonnes ?? 0), 0);
  const partnerNames = new Set(all.flatMap(c => c.members.filter(x => !me(x) && x.status !== 'declined').map(x => x.company)));

  async function act(kind: 'accept' | 'decline' | 'offer' | 'withdraw', id: string) {
    setBusy(true);
    try {
      if (kind === 'accept' || kind === 'decline') await api.respondToCollaboration(id, kind === 'accept');
      else if (kind === 'offer') await api.sendJointOffer(id);
      else await api.withdrawCollaboration(id);
      setVersion(v => v + 1);
    } finally {
      setBusy(false);
    }
  }

  const shown = tab === 'invites' ? invites : teams;

  return (
    <main className="page">
      <div className="page-inner">
        <div className="page-head">
          <h1>Collaborations</h1>
          <p>Team up with other recyclers to fill buyer requests that are too big for one yard. One joint offer goes to the buyer; each partner supplies its share.</p>
        </div>

        <dl className="kpis">
          <div className="kpi"><dt>Invites waiting for you</dt><dd>{waiting}</dd></div>
          <div className="kpi"><dt>Teams you're in</dt><dd>{all.filter(c => c.status !== 'withdrawn' && c.members.some(x => me(x) && x.status !== 'declined' && x.status !== 'invited')).length}</dd></div>
          <div className="kpi"><dt>You've committed</dt><dd>{fmtInt(committed)}<span className="unit">tonnes a month</span></dd></div>
          <div className="kpi"><dt>Partner recyclers</dt><dd>{partnerNames.size}</dd></div>
        </dl>

        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'invites'} onClick={() => setTab('invites')}>Invites for you <span className="count num">{invites.length}</span></button>
          <button role="tab" aria-selected={tab === 'teams'} onClick={() => setTab('teams')}>Teams you lead <span className="count num">{teams.length}</span></button>
          <button role="tab" aria-selected={tab === 'open'} onClick={() => setTab('open')}>Requests for your materials <span className="count num">{open.length}</span></button>
        </div>

        {list.error && <div className="panel empty">Couldn't load collaborations: {list.error.message}</div>}
        {list.loading && !list.data && <div className="skeleton" style={{ height: 200 }} />}

        {tab !== 'open' && list.data && (
          <div className="collab-list">
            {shown.map(c => <CollabCard key={c.id} c={c} me={me} busy={busy} onAction={act} />)}
            {shown.length === 0 && (
              <div className="panel empty">
                <Handshake size={26} />
                <p>{tab === 'invites' ? 'No invites yet. Other recyclers can invite you when a buyer request is too big for them.' : 'You are not leading a team yet.'}</p>
                {tab === 'teams' && <button className="btn btn-primary" onClick={() => setTab('open')}>Find a request to team up on</button>}
              </div>
            )}
          </div>
        )}

        {tab === 'open' && (
          <section className="panel table-panel">
            <p className="hint" style={{ marginBottom: 10 }}>Buyer requests for materials you sell. Where a request needs more than you list, team up with other recyclers to cover it.</p>
            <div className="table-scroll">
              <table className="alloc">
                <thead><tr><th>Buyer request</th><th className="r">Needs a month</th><th className="r">You list</th><th className="r">Pays up to</th><th>Fit</th><th /></tr></thead>
                <tbody>
                  {open.map(({ r, have, need }) => <OpenRow key={r.id} r={r} have={have} need={need} />)}
                  {open.length === 0 && <tr><td colSpan={6} className="empty">No buyer requests for the materials you list right now.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="hint table-note">{PRICE_NOTE}</p>
          </section>
        )}
      </div>
    </main>
  );
}

function OpenRow({ r, have, need }: { r: Listing; have: number; need: number }) {
  const m = MATERIALS[r.material];
  return (
    <tr>
      <td>
        <div className="alloc-name">
          <span className="code small square" style={{ '--c': m.color } as CSSProperties} title={m.label}>{m.code}</span>
          <div><Link to={`/listing/${r.id}`}>{r.company}</Link><small>{m.label} · {r.suburb}, {r.state}</small></div>
        </div>
      </td>
      <td className="r num">{fmtTonnes(need)}</td>
      <td className="r num">{fmtTonnes(have)}</td>
      <td className="r num">{aud(r.priceAud)}<small>per tonne</small></td>
      <td>{need > have ? <span className="status s-pending">Short {fmtTonnes(need - have)}</span> : <span className="status s-delivered">You can cover it</span>}</td>
      <td className="r"><Link className={`btn btn-sm ${need > have ? 'btn-primary' : 'btn-ghost'}`} to={`/listing/${r.id}#team-up`}><Handshake size={14} />Team up</Link></td>
    </tr>
  );
}
