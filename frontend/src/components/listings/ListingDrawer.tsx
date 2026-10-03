import { useState, type CSSProperties, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, MapPin, X } from 'lucide-react';
import { api, isMock } from '../../api/client';
import type { ListingView } from '../../hooks/useListings';
import { MATERIALS } from '../../lib/materials';
import { aud, belowVirgin, fmtInt, monthlyTonnes, per } from '../../lib/format';

interface Props {
  listing: ListingView;
  onClose: () => void;
}

export function ListingDrawer({ listing: l, onClose }: Props) {
  const m = MATERIALS[l.material];
  const isSupply = l.kind === 'supply';
  const monthly = monthlyTonnes(l.tonnes, l.frequency);
  const pct = belowVirgin(l.priceAud, l.virginPriceAud);
  const max = Math.max(l.priceAud, l.virginPriceAud ?? 0);

  return (
    <aside className="drawer" aria-label={`${l.company} details`}>
      <div className="drawer-head">
        <div className={`code${isSupply ? '' : ' square'}`} style={{ '--c': m.color } as CSSProperties}>{m.code}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>{l.company}</h2>
          <p><MapPin size={13} />{l.suburb}, {l.state} · {fmtInt(l.distanceKm)} km by road</p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close details"><X size={18} /></button>
      </div>

      <div className="drawer-body">
        <section className="sec">
          <h4>{isSupply ? 'Material on offer' : 'Material wanted'}</h4>
          <table className="spec">
            <tbody>
              <tr><th>Material</th><td>{m.label}</td></tr>
              <tr><th>Grade</th><td>{l.grade}</td></tr>
              <tr><th>Form</th><td>{l.form}</td></tr>
              <tr><th>{isSupply ? 'Purity' : 'Min. purity'}</th><td className="num">{l.purity != null ? `${l.purity}%` : 'Assay on request'}</td></tr>
              <tr><th>Volume</th><td className="num">{fmtInt(l.tonnes)} t/{per(l.frequency)} · {l.frequency.toLowerCase()}</td></tr>
              <tr><th>Trading on CircuLink</th><td className="num">{l.monthsOnPlatform} months</td></tr>
            </tbody>
          </table>
        </section>

        <section className="sec">
          <h4>Price per tonne{pct != null && <> · <span style={{ color: 'var(--good)' }}>{pct}% below virgin</span></>}</h4>
          <div className="pricebar">
            <div className="pb-row">
              <span>{isSupply ? 'This listing' : 'Offer'}</span>
              <div className="track"><div className="fill" style={{ width: `${(l.priceAud / max) * 100}%` }} /></div>
              <span className="num">{aud(l.priceAud)}</span>
            </div>
            {l.virginPriceAud != null && (
              <div className="pb-row">
                <span>Virgin equiv.</span>
                <div className="track"><div className="fill" style={{ width: '100%', background: 'var(--ink-3)' }} /></div>
                <span className="num">{aud(l.virginPriceAud)}</span>
              </div>
            )}
          </div>
          <p className="hint" style={{ marginTop: 8 }}>Virgin benchmark is an indicative Australian delivered price, shown for comparison.</p>
        </section>

        <section className="sec">
          <h4>Estimated impact at full volume</h4>
          <div className="impact-pair">
            <div><b className="num">{fmtInt(monthly)} t</b><span>kept in use per month</span></div>
            <div><b className="num">{fmtInt(monthly * m.co2PerTonne)} t</b><span>CO₂e avoided per month (factor {m.co2PerTonne} t/t)</span></div>
          </div>
        </section>

        <section className="sec">
          <h4>Licences and certifications</h4>
          <div className="certs">
            {l.verified && <span className="tag good">Verified site</span>}
            {l.certifications.map(c => <span key={c} className="tag">{c}</span>)}
          </div>
        </section>

        <EnquiryForm key={l.id} listing={l} monthly={monthly} />
      </div>
    </aside>
  );
}

function EnquiryForm({ listing: l, monthly }: { listing: ListingView; monthly: number }) {
  const isSupply = l.kind === 'supply';
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [tonnes, setTonnes] = useState(Math.min(Math.round(monthly), 30));
  const [first, setFirst] = useState('November 2026');
  const [message, setMessage] = useState(
    isSupply ? 'We need assay certificates with each load, delivered to Wetherill Park NSW 2164.' : 'We can supply from Wetherill Park NSW with assay certificates.',
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus('sending');
    try {
      await api.sendEnquiry(l.id, { tonnesPerMonth: tonnes, firstDelivery: first, message });
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  }

  const title = isSupply ? 'Request a quote' : 'Make an offer';
  if (status === 'sent') {
    return (
      <section className="sec">
        <h4>{title}</h4>
        <div className="notice" role="status">
          <CheckCircle2 size={16} />
          <div><b>Request sent to {l.company}.</b><br />{isMock ? 'Demo mode: nothing left this browser.' : 'Replies appear in your inbox.'}</div>
        </div>
      </section>
    );
  }

  return (
    <section className="sec">
      <h4>{title}</h4>
      <form className="form" onSubmit={submit}>
        <div className="form-row">
          <label className="field">Tonnes per month
            <input id="enq-tonnes" type="number" min={1} value={tonnes} onChange={e => setTonnes(Number(e.target.value))} required />
          </label>
          <label className="field">First delivery
            <select id="enq-first" value={first} onChange={e => setFirst(e.target.value)}>
              <option>November 2026</option><option>December 2026</option><option>January 2027</option>
            </select>
          </label>
        </div>
        <label className="field">Note to {isSupply ? 'supplier' : 'buyer'}
          <textarea id="enq-message" value={message} onChange={e => setMessage(e.target.value)} />
        </label>
        {status === 'error' && <div className="notice error" role="alert"><AlertTriangle size={16} />Couldn't send the request. Check your connection and try again.</div>}
        <button className="btn btn-primary" type="submit" disabled={status === 'sending'}>
          {status === 'sending' ? 'Sending…' : isSupply ? 'Send quote request' : 'Send offer'}
        </button>
      </form>
    </section>
  );
}
