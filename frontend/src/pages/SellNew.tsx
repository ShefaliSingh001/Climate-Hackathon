import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api, isMock } from '../api/client';
import type { Frequency, Listing, MaterialKey, NewListing, StateCode } from '../api/types';
import { MATERIALS, MATERIAL_KEYS } from '../lib/materials';
import { HOME_SITE, REGIONS } from '../lib/regions';
import { LAYERS } from '../components/map/layers';

const CERTS = ['EPA licence', 'ISO 14001', 'ISO 9001', 'APCO member', 'NTCRS approved', 'drumMUSTER collector'];
const STATES = REGIONS.filter(r => r.code !== 'AU').map(r => r.code as StateCode);

const pickIcon = L.divIcon({ className: '', html: '<div class="pin" style="--c:#1F6B4F">You</div>', iconSize: [30, 30], iconAnchor: [15, 15] });

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: e => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

type Errors = Partial<Record<'grade' | 'tonnes' | 'price' | 'suburb', string>>;

export function SellNew() {
  const [form, setForm] = useState<NewListing>({
    kind: 'supply', company: HOME_SITE.name, suburb: HOME_SITE.suburb, state: HOME_SITE.state,
    lat: HOME_SITE.lat, lng: HOME_SITE.lng, material: 'copper', grade: '', form: '', tonnes: 10,
    frequency: 'Monthly', priceAud: 0, virginPriceAud: null, purity: null, certifications: ['EPA licence'],
  });
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [created, setCreated] = useState<Listing | null>(null);

  const update = (patch: Partial<NewListing>) => setForm(f => ({ ...f, ...patch }));
  const toggleCert = (c: string) =>
    update({ certifications: form.certifications.includes(c) ? form.certifications.filter(x => x !== c) : [...form.certifications, c] });

  function validate(): Errors {
    const e: Errors = {};
    if (!form.grade.trim()) e.grade = 'Enter the grade buyers will search for, e.g. "#1 bare bright".';
    if (!(form.tonnes > 0)) e.tonnes = 'Enter a volume above zero.';
    if (!(form.priceAud > 0)) e.price = 'Enter an asking price in A$ per tonne.';
    if (!form.suburb.trim()) e.suburb = 'Enter the suburb where the material is collected.';
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setStatus('saving');
    try {
      setCreated(await api.createListing(form));
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  if (created) {
    return (
      <main className="page"><div className="page-inner" style={{ maxWidth: 640 }}>
        <div className="notice" role="status">
          <CheckCircle2 size={16} />
          <div>
            <b>{MATERIALS[created.material].label} listing published.</b><br />
            It shows as unverified until we check your EPA licence. {isMock && 'Demo mode: it lives in this browser tab only.'}
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <Link className="btn btn-primary" to={`/listing/${created.id}`}>View on map</Link>
              <button className="btn btn-ghost" onClick={() => setCreated(null)}>List another</button>
            </div>
          </div>
        </div>
      </div></main>
    );
  }

  return (
    <main className="page">
      <div className="page-inner">
        <div className="page-head">
          <h1>List recovered material</h1>
          <p>Tell buyers what you have, how much and where. Listings with a grade, purity and licence get matched first.</p>
        </div>
        <form className="sell-grid" onSubmit={submit} noValidate>
          <div className="stack">
            <section className="panel form">
              <h2>Material</h2>
              <div className="form-row">
                <label className="field">Material
                  <select id="s-material" value={form.material} onChange={e => update({ material: e.target.value as MaterialKey })}>
                    {MATERIAL_KEYS.map(k => <option key={k} value={k}>{MATERIALS[k].label}</option>)}
                  </select>
                </label>
                <label className="field">Grade
                  <input id="s-grade" value={form.grade} placeholder="#1 bare bright (Millberry)" onChange={e => update({ grade: e.target.value })} aria-invalid={!!errors.grade} />
                  {errors.grade && <span className="err">{errors.grade}</span>}
                </label>
              </div>
              <div className="form-row">
                <label className="field">Form
                  <input id="s-form" value={form.form} placeholder="Granules, bales, loose…" onChange={e => update({ form: e.target.value })} />
                </label>
                <label className="field">Purity (%)
                  <input id="s-purity" type="number" step={0.1} min={0} max={100} value={form.purity ?? ''} placeholder="Leave blank if assay on request" onChange={e => update({ purity: e.target.value === '' ? null : Number(e.target.value) })} />
                </label>
              </div>
            </section>

            <section className="panel form">
              <h2>Volume and price</h2>
              <div className="form-row three">
                <label className="field">Tonnes
                  <input id="s-tonnes" type="number" min={0} value={form.tonnes} onChange={e => update({ tonnes: Number(e.target.value) })} aria-invalid={!!errors.tonnes} />
                  {errors.tonnes && <span className="err">{errors.tonnes}</span>}
                </label>
                <label className="field">Every
                  <select id="s-frequency" value={form.frequency} onChange={e => update({ frequency: e.target.value as Frequency })}>
                    <option>Weekly</option><option>Fortnightly</option><option>Monthly</option>
                  </select>
                </label>
                <label className="field">Asking A$ / t
                  <input id="s-price" type="number" min={0} value={form.priceAud || ''} onChange={e => update({ priceAud: Number(e.target.value) })} aria-invalid={!!errors.price} />
                  {errors.price && <span className="err">{errors.price}</span>}
                </label>
              </div>
            </section>

            <section className="panel form">
              <h2>Licences and certifications</h2>
              <div className="chips">
                {CERTS.map(c => <button type="button" key={c} className="chip" aria-pressed={form.certifications.includes(c)} onClick={() => toggleCert(c)}>{c}</button>)}
              </div>
            </section>
          </div>

          <div className="stack">
            <section className="panel form">
              <h2>Collection site</h2>
              <div className="form-row">
                <label className="field">Suburb
                  <input id="s-suburb" value={form.suburb} onChange={e => update({ suburb: e.target.value })} aria-invalid={!!errors.suburb} />
                  {errors.suburb && <span className="err">{errors.suburb}</span>}
                </label>
                <label className="field">State
                  <select id="s-state" value={form.state} onChange={e => update({ state: e.target.value as StateCode })}>
                    {STATES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </label>
              </div>
              <div className="picker-map">
                <MapContainer center={[form.lat, form.lng]} zoom={9} style={{ height: '100%' }} attributionControl={false}>
                  <TileLayer url={LAYERS.map.base.url} subdomains={LAYERS.map.base.subdomains} />
                  <Marker position={[form.lat, form.lng]} icon={pickIcon} />
                  <ClickToPlace onPick={(lat, lng) => update({ lat, lng })} />
                </MapContainer>
              </div>
              <p className="hint">Click the map to move the pin to your yard. <span className="num">{form.lat.toFixed(3)}, {form.lng.toFixed(3)}</span></p>
            </section>
            {status === 'error' && <div className="notice error" role="alert"><AlertTriangle size={16} />Couldn't publish the listing. Check your connection and try again.</div>}
            <button className="btn btn-primary" type="submit" disabled={status === 'saving'}>{status === 'saving' ? 'Publishing…' : 'Publish listing'}</button>
          </div>
        </form>
      </div>
    </main>
  );
}
