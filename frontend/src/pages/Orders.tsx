import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronDown, Clock, PackageCheck, Search, Truck, Users, XCircle } from 'lucide-react';
import type { Order, OrderStatus } from '../api/types';
import { api, isMock } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { useAsync } from '../hooks/useAsync';
import { MATERIALS } from '../lib/materials';
import { PRICE_NOTE, aud, audBig, co2e, fmtInt, monthName, shortDate, tonnes as fmtTonnes } from '../lib/format';
import { MonthlyChart, type MonthPoint } from '../components/orders/MonthlyChart';
import { Select } from '../components/ui/Select';

type Period = 3 | 6 | 12;
type Tab = 'all' | 'active' | 'delivered' | 'cancelled';

const ACTIVE: OrderStatus[] = ['pending', 'confirmed', 'in_transit'];
const STEPS: OrderStatus[] = ['pending', 'confirmed', 'in_transit', 'delivered'];

const STATUS: Record<OrderStatus, { label: string; icon: ReactNode }> = {
  pending: { label: 'Awaiting reply', icon: <Clock size={13} /> },
  confirmed: { label: 'Confirmed', icon: <CheckCircle2 size={13} /> },
  in_transit: { label: 'In transit', icon: <Truck size={13} /> },
  delivered: { label: 'Delivered', icon: <PackageCheck size={13} /> },
  cancelled: { label: 'Cancelled', icon: <XCircle size={13} /> },
};

const monthsAgo = (n: number) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() - n + 1, 1); };
const between = (o: Order, from: Date, to: Date) => { const t = new Date(o.placedAt); return t >= from && t < to; };

function StatusTag({ status, buyer }: { status: OrderStatus; buyer: boolean }) {
  const label = status === 'pending' ? (buyer ? 'Quote requested' : 'Offer sent') : STATUS[status].label;
  return <span className={`status s-${status}`}>{STATUS[status].icon}{label}</span>;
}

function Delta({ now, before }: { now: number; before: number }) {
  if (!before) return <small className="muted">No earlier period to compare</small>;
  const pct = Math.round(((now - before) / before) * 100);
  const up = pct >= 0;
  return <small className={up ? 'up' : 'down'}>{up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(pct)}% on the previous period</small>;
}

function Stepper({ status }: { status: OrderStatus }) {
  const at = STEPS.indexOf(status);
  return (
    <ol className="stepper" aria-label={`Status: ${STATUS[status].label}`}>
      {STEPS.map((s, i) => (
        <li key={s} className={i < at ? 'done' : i === at ? 'now' : ''}><i />{s === 'pending' ? 'Requested' : STATUS[s].label}</li>
      ))}
    </ol>
  );
}

/** Order history for buyers and sellers: KPIs, a monthly chart, breakdowns and the full order table. */
export function Orders() {
  const { account } = useAuth();
  const buyer = account?.role !== 'seller';
  const { data, loading, error } = useAsync(() => api.listOrders(), [account?.id]);
  const [period, setPeriod] = useState<Period>(12);
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const orders = data ?? [];
  const other = (o: Order) => (buyer ? o.seller : o.buyer);
  // Buyers pay for material and freight; sellers are paid for the material.
  const valueOf = (o: Order) => o.tonnes * (o.priceAud + (buyer ? o.freightAud : 0));

  const stats = useMemo(() => {
    const now = new Date(Date.now() + 864e5);
    const from = monthsAgo(period), prevFrom = monthsAgo(period * 2);
    const live = (o: Order) => o.status !== 'cancelled';
    const cur = orders.filter(o => live(o) && between(o, from, now));
    const prev = orders.filter(o => live(o) && between(o, prevFrom, from));
    const sum = (list: Order[], f: (o: Order) => number) => list.reduce((s, o) => s + f(o), 0);
    const t = sum(cur, o => o.tonnes), v = sum(cur, valueOf);

    const months: MonthPoint[] = Array.from({ length: period }, (_, i) => {
      const start = monthsAgo(period - i), end = monthsAgo(period - i - 1);
      const inMonth = cur.filter(o => between(o, start, end));
      return {
        key: start.toISOString(), label: monthName(start), long: start.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }),
        tonnes: sum(inMonth, o => o.tonnes), value: sum(inMonth, valueOf), orders: inMonth.length,
      };
    });

    const byMaterial = Object.entries(cur.reduce<Record<string, number>>((m, o) => ({ ...m, [o.material]: (m[o.material] ?? 0) + o.tonnes }), {}))
      .sort((a, b) => b[1] - a[1]);
    const partners = Object.values(cur.reduce<Record<string, { name: string; place: string; tonnes: number; orders: number }>>((m, o) => {
      const p = other(o);
      const row = m[p.company] ?? { name: p.company, place: `${p.suburb}, ${p.state}`, tonnes: 0, orders: 0 };
      row.tonnes += o.tonnes; row.orders += 1;
      return { ...m, [p.company]: row };
    }, {})).sort((a, b) => b.tonnes - a.tonnes).slice(0, 5);

    return {
      tonnes: t, value: v, co2: sum(cur, o => o.co2eAvoidedT), count: cur.length,
      partnerCount: new Set(cur.map(o => other(o).company)).size,
      prev: { tonnes: sum(prev, o => o.tonnes), value: sum(prev, valueOf), count: prev.length, co2: sum(prev, o => o.co2eAvoidedT) },
      months, byMaterial, partners,
    };
  }, [orders, period, buyer]);

  const active = orders.filter(o => ACTIVE.includes(o.status));
  const counts: Record<Tab, number> = {
    all: orders.length, active: active.length,
    delivered: orders.filter(o => o.status === 'delivered').length, cancelled: orders.filter(o => o.status === 'cancelled').length,
  };
  const q = query.trim().toLowerCase();
  const rows = orders
    .filter(o => tab === 'all' || (tab === 'active' ? ACTIVE.includes(o.status) : o.status === tab))
    .filter(o => !q || [o.ref, other(o).company, MATERIALS[o.material].label, other(o).suburb].some(x => x.toLowerCase().includes(q)));

  const who = buyer ? 'Supplier' : 'Buyer';
  const maxMat = Math.max(1, ...stats.byMaterial.map(([, t]) => t));

  return (
    <main className="page">
      <div className="page-inner orders">
        <div className="page-head head-row">
          <div>
            <h1>Orders</h1>
            <p>{buyer ? 'Everything you have bought on ResourceX, with delivered cost and emissions avoided.' : 'Everything you have sold on ResourceX, including joint orders with partner recyclers.'}</p>
          </div>
          <Select<Period> id="o-period" size="sm" prefix="Period" aria-label="Period" value={period} onChange={setPeriod}
            options={[{ value: 3, label: 'Last 3 months' }, { value: 6, label: 'Last 6 months' }, { value: 12, label: 'Last 12 months' }]} />
        </div>

        {error && <div className="panel empty">Couldn't load your orders: {error.message}</div>}
        {loading && !data && <div className="skeleton" style={{ height: 320 }} />}

        {data && orders.length === 0 && (
          <section className="panel empty">
            <PackageCheck size={28} />
            <p>No orders yet.</p>
            <p className="hint">{buyer ? 'Request a quote from a supplier and it appears here.' : 'Make an offer on a buyer request, or team up with other recyclers, and it appears here.'}</p>
            <Link className="btn btn-primary" to="/marketplace" style={{ marginTop: 12 }}>{buyer ? 'Find supply' : 'See buyer requests'}</Link>
          </section>
        )}

        {orders.length > 0 && (
          <>
            <dl className="kpis">
              <div className="kpi"><dt>{buyer ? 'Spent, delivered' : 'Sales'}</dt><dd>{audBig(stats.value)}</dd><Delta now={stats.value} before={stats.prev.value} /></div>
              <div className="kpi"><dt>{buyer ? 'Tonnes bought' : 'Tonnes sold'}</dt><dd>{fmtInt(stats.tonnes)}</dd><Delta now={stats.tonnes} before={stats.prev.tonnes} /></div>
              <div className="kpi"><dt>Orders</dt><dd>{fmtInt(stats.count)}<span className="unit">{buyer ? 'from' : 'to'} {stats.partnerCount} {buyer ? 'suppliers' : 'buyers'}</span></dd><Delta now={stats.count} before={stats.prev.count} /></div>
              <div className="kpi"><dt>Emissions avoided</dt><dd>{fmtInt(stats.co2)}<span className="unit">tonnes <abbr title="carbon dioxide equivalent">CO₂e</abbr></span></dd><Delta now={stats.co2} before={stats.prev.co2} /></div>
            </dl>

            <div className="orders-grid">
              <section className="panel">
                <div className="panel-head">
                  <h2>Tonnes {buyer ? 'bought' : 'sold'} each month</h2>
                  <span className="hint">{stats.count} orders · cancelled orders left out</span>
                </div>
                <MonthlyChart data={stats.months} valueLabel={buyer ? 'Spent' : 'Sales'} />
              </section>

              <section className="panel">
                <h2>By material</h2>
                <div className="hbars">
                  {stats.byMaterial.map(([k, t]) => {
                    const m = MATERIALS[k as keyof typeof MATERIALS];
                    return (
                      <div key={k} className="hbar">
                        <span><span className="dot" style={{ '--c': m.color } as CSSProperties} />{m.label}</span>
                        <div className="track"><div className="fill" style={{ width: `${Math.max(2, (t / maxMat) * 100)}%` }} /></div>
                        <span className="num">{fmtInt(t)}</span>
                      </div>
                    );
                  })}
                </div>
                <h2 style={{ marginTop: 20 }}>Top {buyer ? 'suppliers' : 'buyers'}</h2>
                <ol className="partners-list">
                  {stats.partners.map((p, i) => (
                    <li key={p.name}>
                      <span className="pos num">{i + 1}</span>
                      <span className="who"><b>{p.name}</b><small>{p.place} · {p.orders} orders</small></span>
                      <span className="num">{fmtTonnes(p.tonnes)}</span>
                    </li>
                  ))}
                </ol>
              </section>
            </div>

            {active.length > 0 && (
              <section className="panel">
                <div className="panel-head">
                  <h2>In progress</h2>
                  <span className="hint">{active.length} {active.length === 1 ? 'order' : 'orders'}</span>
                </div>
                <div className="progress-list">
                  {active.slice(0, 6).map(o => (
                    <article key={o.id} className="progress-card">
                      <div className="pc-head">
                        <span className="code small" style={{ '--c': MATERIALS[o.material].color } as CSSProperties} title={MATERIALS[o.material].label}>{MATERIALS[o.material].code}</span>
                        <div><b>{other(o).company}</b><small>{o.ref} · {fmtTonnes(o.tonnes)} of {MATERIALS[o.material].label.toLowerCase()}</small></div>
                        {o.partners?.length ? <span className="tag" title={`With ${o.partners.join(', ')}`}><Users size={12} /> Joint</span> : null}
                      </div>
                      <Stepper status={o.status} />
                      <p className="hint">{o.status === 'pending' ? `Sent ${shortDate(o.placedAt)}` : `Delivery ${shortDate(o.deliveryDate)}`}</p>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section className="panel table-panel">
              <div className="orders-toolbar">
                <div className="tabs" role="tablist">
                  {(['all', 'active', 'delivered', 'cancelled'] as Tab[]).map(t => (
                    <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                      {t === 'all' ? 'All orders' : t[0].toUpperCase() + t.slice(1)} <span className="count num">{counts[t]}</span>
                    </button>
                  ))}
                </div>
                <label className="field-search">
                  <Search size={15} />
                  <input type="search" placeholder={`Search order, ${who.toLowerCase()} or material`} value={query} onChange={e => setQuery(e.target.value)} aria-label="Search orders" />
                </label>
              </div>
              <div className="table-scroll">
                <table className="alloc orders-table">
                  <thead>
                    <tr><th>Order</th><th>{who}</th><th>Material</th><th className="r">Tonnes</th><th className="r">{buyer ? 'Delivered price' : 'Price'}</th><th className="r">Total</th><th>Status</th><th /></tr>
                  </thead>
                  <tbody>
                    {rows.map(o => {
                      const m = MATERIALS[o.material];
                      const isOpen = open === o.id;
                      return (
                        <Fragment key={o.id}>
                          <tr className={`orow${isOpen ? ' open' : ''}`} onClick={() => setOpen(isOpen ? null : o.id)}>
                            <td><b className="num">{o.ref}</b><small>{shortDate(o.placedAt)}</small></td>
                            <td><span className="who-cell">{other(o).company}{o.partners?.length ? <span className="tag"><Users size={11} /> Joint</span> : null}</span><small>{other(o).suburb}, {other(o).state}</small></td>
                            <td><span className="mat-cell"><span className="dot" style={{ '--c': m.color } as CSSProperties} />{m.label}</span><small>{o.grade}</small></td>
                            <td className="r num">{fmtInt(o.tonnes)}</td>
                            <td className="r num">{aud(o.priceAud + (buyer ? o.freightAud : 0))}<small>per tonne</small></td>
                            <td className="r num">{aud(valueOf(o))}</td>
                            <td><StatusTag status={o.status} buyer={buyer} /></td>
                            <td><button className="icon-btn" aria-expanded={isOpen} aria-label={`${isOpen ? 'Hide' : 'Show'} details for ${o.ref}`} onClick={e => { e.stopPropagation(); setOpen(isOpen ? null : o.id); }}><ChevronDown size={16} /></button></td>
                          </tr>
                          {isOpen && (
                            <tr className="order-detail">
                              <td colSpan={8}>
                                <div className="od-grid">
                                  <dl>
                                    <div><dt>Placed</dt><dd>{shortDate(o.placedAt)}</dd></div>
                                    <div><dt>{o.status === 'delivered' ? 'Delivered' : 'Delivery'}</dt><dd>{o.status === 'cancelled' ? 'Cancelled' : shortDate(o.deliveryDate)}</dd></div>
                                    <div><dt>Material price</dt><dd className="num">{aud(o.priceAud)} per tonne</dd></div>
                                    <div><dt>Freight</dt><dd className="num">{aud(o.freightAud)} per tonne{buyer ? '' : ' (paid by buyer)'}</dd></div>
                                    <div><dt>Distance by road</dt><dd className="num">{fmtInt(o.distanceKm)} km</dd></div>
                                    <div><dt>Emissions avoided</dt><dd className="num">{co2e(o.co2eAvoidedT)} <abbr title="carbon dioxide equivalent">CO₂e</abbr></dd></div>
                                    {o.partners?.length ? <div><dt>Joint order with</dt><dd>{o.partners.join(', ')}</dd></div> : null}
                                  </dl>
                                  <div className="od-side">
                                    {o.status !== 'cancelled' && <Stepper status={o.status} />}
                                    <div className="od-actions">
                                      {o.listingId && <Link className="btn btn-ghost" to={`/listing/${o.listingId}`}>View listing</Link>}
                                      {buyer && o.listingId && o.status === 'delivered' && <Link className="btn btn-primary" to={`/listing/${o.listingId}#enquiry`}>Order again</Link>}
                                      {!buyer && o.collaborationId && <Link className="btn btn-ghost" to="/collaborations">Open collaboration</Link>}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {rows.length === 0 && <tr><td colSpan={8} className="empty">No orders match.</td></tr>}
                  </tbody>
                </table>
              </div>
              <p className="hint table-note">{PRICE_NOTE}{isMock ? ' Demo mode: sample order history. Quote requests and offers you send are added here.' : ''}</p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
