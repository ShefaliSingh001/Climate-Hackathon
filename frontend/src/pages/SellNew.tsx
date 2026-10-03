import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api, isMock } from '../api/client';
import type { Frequency, Listing, MaterialKey, NewListing, StateCode } from '../api/types';
import { GRADES, MATERIALS, MATERIAL_KEYS } from '../lib/materials';
import { REGIONS } from '../lib/regions';
import { useAuth } from '../auth/AuthProvider';
import { LAYERS } from '../components/map/layers';
import { NumberField } from '../components/ui/NumberField';
import { Select } from '../components/ui/Select';

const CERTS = ['EPA licence', 'ISO 14001', 'ISO 9001', 'APCO member', 'NTCRS approved', 'drumMUSTER collector'];
const STATES = REGIONS.filter(r => r.code !== 'AU').map(r => r.code as StateCode);

const pickIcon = L.divIcon({ className: '', html: '<div class="pin" style="--c:#4F7A26">You</div>', iconSize: [30, 30], iconAnchor: [15, 15] });

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: e => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

type Errors = Partial<Record<'grade' | 'tonnes' | 'price' | 'suburb' | 'abn', string>>;

export function SellNew() {
  const { account } = useAuth();
  const site = account!.site;
  const [form, setForm] = useState<NewListing>({
    kind: 'supply', company: account!.company, suburb: site.suburb, state: site.state,
    lat: site.lat, lng: site.lng, material: isMock ? 'copper' : 'steel', grade: isMock ? '' : GRADES.high, form: '', tonnes: 10, abn: account!.abn,
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
    if (!(form.priceAud > 0)) e.price = 'Enter an asking price in dollars per tonne.';
    if (!form.suburb.trim()) e.suburb = 'Enter the suburb where the material is collected.';
    if (!isMock && !/^\d{11}$/.test((form.abn ?? '').replace(/\s/g, ''))) e.abn = 'Enter your 11-digit ABN.';
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setStatus('saving');
    try {
      setCreated(await api.createListing({ ...form, abn: form.abn?.replace(/\s/g, '') }));
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
            It shows as unverified until we check your EPA licence. {isMock && 'Demo mode: it is saved in this browser only.'}
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <Link className="btn btn-primary" to="/my-listings">Go to my listings</Link>
              <Link className="btn btn-ghost" to={`/listing/${created.id}`}>View listing</Link>
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
                <div className="field"><label htmlFor="s-material">Material</label>
                  <Select<MaterialKey> id="s-material" value={form.material} onChange={k => update({ material: k })}
                    options={MATERIAL_KEYS.map(k => ({ value: k, label: MATERIALS[k].label, color: MATERIALS[k].color }))} />
                </div>
                <div className="field"><label htmlFor="s-grade">Grade</label>
                  {isMock
                    ? <input id="s-grade" value={form.grade} placeholder="#1 bare bright (Millberry)" onChange={e => update({ grade: e.target.value })} aria-invalid={!!errors.grade} />
                    : <Select<string> id="s-grade" value={form.grade} onChange={g => update({ grade: g })}
                        options={Object.values(GRADES).map(g => ({ value: g, label: g }))} />}
                  {errors.grade && <span className="err">{errors.grade}</span>}
                </div>
              </div>
              <div className="form-row">
                <label className="field">Form
                  <input id="s-form" value={form.form} placeholder="Granules, bales, loose…" onChange={e => update({ form: e.target.value })} />
                </label>
                <label className="field" htmlFor="s-purity">Purity
                  <NumberField id="s-purity" decimals min={0} max={100} value={form.purity} placeholder="Leave blank if tested on request" onChange={v => update({ purity: v })} suffix="%" />
                </label>
              </div>
            </section>

            <section className="panel form">
              <h2>Volume and price</h2>
              <div className="form-row three">
                <label className="field" htmlFor="s-tonnes">Amount
                  <NumberField id="s-tonnes" min={0} value={form.tonnes || null} onChange={v => update({ tonnes: v ?? 0 })} suffix="tonnes" aria-invalid={!!errors.tonnes} />
                  {errors.tonnes && <span className="err">{errors.tonnes}</span>}
                </label>
                <div className="field"><label htmlFor="s-frequency">How often</label>
                  <Select<Frequency> id="s-frequency" value={form.frequency} onChange={f => update({ frequency: f })} options={[
                    { value: 'Weekly', label: 'Every week' }, { value: 'Fortnightly', label: 'Every fortnight' }, { value: 'Monthly', label: 'Every month' },
                  ]} />
                </div>
                <label className="field" htmlFor="s-price">Asking price per tonne
                  <NumberField id="s-price" min={0} value={form.priceAud || null} onChange={v => update({ priceAud: v ?? 0 })} prefix="$" aria-invalid={!!errors.price} />
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
              {!isMock && (
                <label className="field">Business ABN
                  <input id="s-abn" inputMode="numeric" value={form.abn ?? ''} placeholder="11 digits" onChange={e => update({ abn: e.target.value })} aria-invalid={!!errors.abn} />
                  {errors.abn && <span className="err">{errors.abn}</span>}
                </label>
              )}
              <div className="form-row">
                <label className="field">Suburb
                  <input id="s-suburb" value={form.suburb} onChange={e => update({ suburb: e.target.value })} aria-invalid={!!errors.suburb} />
                  {errors.suburb && <span className="err">{errors.suburb}</span>}
                </label>
                <div className="field"><label htmlFor="s-state">State</label>
                  <Select<StateCode> id="s-state" value={form.state} onChange={st => update({ state: st })} options={STATES.map(st => ({ value: st, label: st }))} />
                </div>
              </div>
              <div className="picker-map">
                <MapContainer center={[form.lat, form.lng]} zoom={9} style={{ height: '100%' }} attributionControl={false}>
                  <TileLayer url={LAYERS.map.base.url} maxZoom={LAYERS.map.base.maxZoom} />
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
