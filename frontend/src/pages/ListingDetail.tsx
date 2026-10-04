import { useEffect, type CSSProperties } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, Clock, Handshake, Layers3, Leaf, MapPin, Trophy } from 'lucide-react';
import type { Listing, Site } from '../api/types';
import { useRoute } from '../hooks/useRoute';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { MATERIALS } from '../lib/materials';
import { useAuth, useSite } from '../auth/AuthProvider';
import { roadKm } from '../lib/geo';
import { PRICE_NOTE, aud, belowNew, driveTime, fmtInt, monthlyTonnes, tonnes, volume } from '../lib/format';
import { RouteMap } from '../components/map/RouteMap';
import { LogisticsEstimate } from '../components/listings/LogisticsEstimate';
import { EnquiryForm } from '../components/listings/EnquiryForm';
import { TeamUpPlanner } from '../components/collab/TeamUpPlanner';

export function ListingDetail() {
  const { id = '' } = useParams();
  const { account } = useAuth();
  const HOME_SITE = useSite();
  const { data: l, loading, error } = useAsync(() => api.getListing(id), [id]);

  if (loading && !l) {
    return <main className="page"><div className="page-inner"><div className="skeleton" style={{ height: 120 }} /><div className="skeleton" style={{ height: 320 }} /></div></main>;
  }
  if (error || !l) {
    return (
      <main className="page"><div className="page-inner">
        <Link to="/marketplace" className="back"><ArrowLeft size={16} />Back to the map</Link>
        <div className="panel empty">This listing doesn't exist or was removed.</div>
      </div></main>
    );
  }

  // Buyers see supply; sellers see buyer requests and their own listings.
  const own = !!account && l.abn === account.abn;
  const allowed = account?.role === 'buyer' ? l.kind === 'supply' : l.kind === 'demand' || own;
  if (!allowed) {
    return (
      <main className="page"><div className="page-inner">
        <Link to="/marketplace" className="back"><ArrowLeft size={16} />Back to the map</Link>
        <div className="panel empty">This listing isn't available for {account?.role === 'buyer' ? 'buyer' : 'seller'} accounts.</div>
      </div></main>
    );
  }

  return <ListingBody l={l} own={own} site={HOME_SITE} />;
}

/** Position passed from the map list, e.g. { position: 3, of: 22 }. */
interface RankState { rank?: { position: number; of: number } }

function ListingBody({ l, own, site: HOME_SITE }: { l: Listing; own: boolean; site: Site }) {
  const location = useLocation();
  const rank = (location.state as RankState | null)?.rank;
  // Links like /listing/d06#team-up or #enquiry jump to that panel once it has rendered.
  useEffect(() => {
    if (!location.hash) return;
    const t = setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    return () => clearTimeout(t);
  }, [location.hash, l.id]);
  const { route } = useRoute(HOME_SITE, l);
  const m = MATERIALS[l.material];
  const isSupply = l.kind === 'supply';
  // Real road distance when the routing service answers; otherwise straight line × 1.25.
  const distanceKm = route?.distanceKm ?? roadKm(HOME_SITE, l);
  const monthly = monthlyTonnes(l.tonnes, l.frequency);
  const pct = belowNew(l.priceAud, l.virginPriceAud);
  const max = Math.max(l.priceAud, l.virginPriceAud ?? 0);

  return (
    <main className="page">
      <div className="page-inner">
        <Link to={own ? '/my-listings' : '/marketplace'} className="back"><ArrowLeft size={16} />{own ? 'Back to my listings' : 'Back to the map'}</Link>

        <header className="detail-head">
          <div className={`code large${isSupply ? '' : ' square'}`} style={{ '--c': m.color } as CSSProperties}>{m.code}</div>
          <div className="detail-title">
            <p className="eyebrow">{isSupply ? 'Supply listing' : 'Buyer request'} · {m.label}</p>
            <h1>{l.company}{l.verified && <span className="verified" title="Verified site and licences"><BadgeCheck size={20} /></span>}</h1>
            <p className="detail-sub"><MapPin size={14} />{l.suburb}, {l.state} · {fmtInt(distanceKm)} km by road from {HOME_SITE.suburb}
              {route && <><Clock size={14} style={{ marginLeft: 6 }} />{driveTime(route.durationMin)} drive</>}</p>
            {rank && <p className="detail-rank"><Trophy size={14} />Ranked #{rank.position} of {rank.of} {isSupply ? 'suppliers' : 'buyer requests'} on your map</p>}
          </div>
          <div className="detail-actions">
            {own ? <span className="tag good">Your listing</span> : <a className="btn btn-primary" href="#enquiry">{isSupply ? 'Request a quote' : 'Make an offer'}</a>}
            {isSupply && !own && (
              <Link className="btn btn-ghost" to={`/sourcing?tab=combine&material=${l.material}`}><Layers3 size={16} />Combine with other suppliers</Link>
            )}
            {!isSupply && !own && <a className="btn btn-ghost" href="#team-up"><Handshake size={16} />Team up with other recyclers</a>}
          </div>
        </header>

        <dl className="kpis">
          <div className="kpi"><dt>{isSupply ? 'Available' : 'Wants'}</dt><dd>{tonnes(l.tonnes)}<small>per {l.frequency === 'Weekly' ? 'week' : l.frequency === 'Fortnightly' ? 'fortnight' : 'month'} · about {tonnes(monthly)} a month</small></dd></div>
          <div className="kpi"><dt>{isSupply ? 'Price' : 'Pays up to'}</dt><dd>{aud(l.priceAud)}<small>per tonne · {pct != null ? (pct >= 0 ? `${pct}% cheaper than newly sourced` : `${-pct}% dearer than newly sourced`) : 'no newly sourced benchmark'}</small></dd></div>
          <div className="kpi"><dt>{isSupply ? 'Purity' : 'Minimum purity'}</dt><dd>{l.purity != null ? `${l.purity}%` : 'On request'}<small>{l.grade}</small></dd></div>
          <div className="kpi"><dt>Emissions avoided</dt><dd>{tonnes(monthly * m.co2PerTonne)}<small>of <abbr title="carbon dioxide equivalent">CO₂e</abbr> per month at full volume</small></dd></div>
        </dl>

        {!isSupply && !own && <TeamUpPlanner request={l} />}

        <div className="detail-grid">
          <div className="stack">
            <LogisticsEstimate listing={l} distanceKm={distanceKm} defaultTonnes={Math.max(1, Math.round(Math.min(monthly, 30)))} />

            <section className="panel">
              <h2>Material</h2>
              <table className="spec">
                <tbody>
                  <tr><th>Material</th><td>{m.label}</td></tr>
                  <tr><th>Grade</th><td>{l.grade}</td></tr>
                  <tr><th>Form</th><td>{l.form}</td></tr>
                  <tr><th>{isSupply ? 'Purity' : 'Minimum purity'}</th><td className="num">{l.purity != null ? `${l.purity}%` : 'Assay on request'}</td></tr>
                  <tr><th>Volume</th><td>{volume(l.tonnes, l.frequency)}</td></tr>
                  <tr><th>Frequency</th><td>{l.frequency}</td></tr>
                </tbody>
              </table>
            </section>

            <section className="panel">
              <h2>Price per tonne against newly sourced materials</h2>
              <div className="pricebar">
                <div className="pb-row">
                  <span>{isSupply ? 'This listing' : 'Offer'}</span>
                  <div className="track"><div className="fill" style={{ width: `${(l.priceAud / max) * 100}%` }} /></div>
                  <span className="num">{aud(l.priceAud)}</span>
                </div>
                {l.virginPriceAud != null && (
                  <div className="pb-row">
                    <span>Newly sourced</span>
                    <div className="track"><div className="fill" style={{ width: '100%', background: 'var(--ink-3)' }} /></div>
                    <span className="num">{aud(l.virginPriceAud)}</span>
                  </div>
                )}
              </div>
              <p className="hint" style={{ marginTop: 8 }}>"Newly sourced" is the indicative Australian delivered price of the same material made from new raw resources. {PRICE_NOTE}</p>
            </section>

            <section className="panel">
              <h2 className="with-icon"><Leaf size={16} />Estimated impact at full volume</h2>
              <div className="impact-pair">
                <div><b className="num">{tonnes(monthly)}</b><span>of material kept in use per month</span></div>
                <div><b className="num">{tonnes(monthly * m.co2PerTonne)}</b><span>of <abbr title="carbon dioxide equivalent">CO₂e</abbr> (carbon emissions) avoided per month, at {m.co2PerTonne} tonnes per tonne of material</span></div>
              </div>
            </section>
          </div>

          <div className="stack">
            <section className="panel flush">
              <RouteMap site={HOME_SITE} listings={[l]} />
            </section>
            <section className="panel">
              <h2>Business</h2>
              <table className="spec">
                <tbody>
                  <tr><th>Location</th><td>{l.suburb}, {l.state}</td></tr>
                  <tr><th>Trading on ResourceX</th><td className="num">{l.monthsOnPlatform} months</td></tr>
                  <tr><th>Status</th><td>{l.verified ? 'Verified site and licences' : 'Not yet verified'}</td></tr>
                </tbody>
              </table>
              <h2 style={{ marginTop: 16 }}>Licences and certifications</h2>
              <div className="certs">
                {l.verified && <span className="tag good">Verified site</span>}
                {l.certifications.map(c => <span key={c} className="tag">{c}</span>)}
              </div>
            </section>
            {!own && <EnquiryForm listing={l} monthly={monthly} />}
          </div>
        </div>
      </div>
    </main>
  );
}
