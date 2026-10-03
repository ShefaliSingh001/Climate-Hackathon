import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, ChevronRight, PackagePlus } from 'lucide-react';
import { api } from '../api/client';
import { useAuth, useSite } from '../auth/AuthProvider';
import { useAsync } from '../hooks/useAsync';
import { MATERIALS } from '../lib/materials';
import { aud, monthlyTonnes, tonnes, volume } from '../lib/format';

/** A seller's own supply listings, matched on ABN. */
export function MyListings() {
  const { account } = useAuth();
  const site = useSite();
  const { data, loading, error } = useAsync(() => api.listListings('supply', site), [site]);
  const mine = (data ?? []).filter(l => account && l.abn === account.abn);
  const monthly = mine.reduce((s, l) => s + monthlyTonnes(l.tonnes, l.frequency), 0);
  const avoided = mine.reduce((s, l) => s + monthlyTonnes(l.tonnes, l.frequency) * MATERIALS[l.material].co2PerTonne, 0);

  return (
    <main className="page">
      <div className="page-inner">
        <div className="page-head head-row">
          <div>
            <h1>My listings</h1>
            <p>What {account?.company} offers each month. Buyers see these on their supply map and in sourcing.</p>
          </div>
          <Link to="/sell/new" className="btn btn-primary"><PackagePlus size={16} />List material</Link>
        </div>

        <dl className="kpis three">
          <div className="kpi"><dt>Active listings</dt><dd>{mine.length}</dd></div>
          <div className="kpi"><dt>Offered per month</dt><dd>{tonnes(monthly)}</dd></div>
          <div className="kpi"><dt>CO₂e buyers avoid</dt><dd>{tonnes(avoided)}<small>per month at full volume</small></dd></div>
        </dl>

        <section className="panel table-panel">
          {error && <div className="empty">Couldn't load your listings: {error.message}</div>}
          {loading && !data && <div className="skeleton" style={{ height: 120 }} />}
          {data && mine.length === 0 && (
            <div className="empty">
              You haven't listed any material yet.<br />
              <Link to="/sell/new" className="btn btn-primary" style={{ marginTop: 14 }}><PackagePlus size={16} />List your first material</Link>
            </div>
          )}
          {mine.length > 0 && (
            <div className="table-scroll">
              <table className="alloc">
                <thead><tr><th>Material</th><th>Grade</th><th className="r">Volume</th><th className="r">Price</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {mine.map(l => (
                    <tr key={l.id}>
                      <td>
                        <div className="alloc-name">
                          <span className="code small" style={{ '--c': MATERIALS[l.material].color } as CSSProperties} title={MATERIALS[l.material].label}>{MATERIALS[l.material].code}</span>
                          <div><Link to={`/listing/${l.id}`}>{MATERIALS[l.material].label}</Link><small>{l.suburb}, {l.state}</small></div>
                        </div>
                      </td>
                      <td>{l.grade}<small>{l.form}</small></td>
                      <td className="r">{volume(l.tonnes, l.frequency)}</td>
                      <td className="r num">{aud(l.priceAud)} <small>per tonne</small></td>
                      <td>{l.verified ? <span className="tag good"><BadgeCheck size={12} /> Verified</span> : <span className="tag">Awaiting checks</span>}</td>
                      <td><Link className="icon-btn" to={`/listing/${l.id}`} aria-label={`Open ${MATERIALS[l.material].label} listing`}><ChevronRight size={16} /></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
