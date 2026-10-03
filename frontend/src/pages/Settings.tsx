import type { CSSProperties, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, LogOut, Map as MapIcon, Monitor, Moon, Palette, RotateCcw, Sun, UserRound } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { LAYERS, LAYER_KEYS } from '../components/map/layers';
import { Select } from '../components/ui/Select';
import { Switch } from '../components/ui/Switch';
import { REGIONS, type RegionCode } from '../lib/regions';
import { useSettings, type Theme } from '../state/settings';
import { useMarket } from '../state/store';

const THEMES: { value: Theme; label: string; hint: string; icon: ReactNode }[] = [
  { value: 'system', label: 'System', hint: 'Follows your device', icon: <Monitor size={15} /> },
  { value: 'light', label: 'Light', hint: 'Always light', icon: <Sun size={15} /> },
  { value: 'dark', label: 'Dark', hint: 'Always dark', icon: <Moon size={15} /> },
];

const RADII = [
  { value: 0, label: 'Any distance' },
  { value: 50, label: 'Within 50 km' },
  { value: 150, label: 'Within 150 km' },
  { value: 400, label: 'Within 400 km' },
  { value: 1000, label: 'Within 1,000 km' },
];

function Section({ icon, title, note, children }: { icon: ReactNode; title: string; note?: string; children: ReactNode }) {
  return (
    <section className="panel settings-section">
      <header>
        <h2>{icon}{title}</h2>
        {note && <p className="hint">{note}</p>}
      </header>
      {children}
    </section>
  );
}

function Row({ label, hint, children }: { label: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-label">{label}{hint && <small>{hint}</small>}</div>
      <div className="settings-control">{children}</div>
    </div>
  );
}

export function Settings() {
  const { account, signOut } = useAuth();
  const navigate = useNavigate();
  const s = useSettings();
  const market = useMarket();

  const setMapLayer = (k: typeof s.mapLayer) => { s.update({ mapLayer: k }); market.set({ layer: k }); };

  function resetDemo() {
    if (!window.confirm('Reset demo data? This removes listings you created in this browser and restores the default settings.')) return;
    try { localStorage.removeItem('resourcex.createdListings'); } catch { /* ignore */ }
    s.reset();
    window.location.reload();
  }

  return (
    <main className="page">
      <div className="page-inner settings">
        <div className="page-head">
          <h1>Settings</h1>
          <p>Preferences are saved in this browser.</p>
        </div>

        <Section icon={<Palette size={16} />} title="Appearance">
          <Row label="Theme">
            <div className="theme-pick" role="radiogroup" aria-label="Theme">
              {THEMES.map(t => (
                <button key={t.value} type="button" role="radio" aria-checked={s.theme === t.value} className={`theme-opt ${t.value}`} onClick={() => s.update({ theme: t.value })}>
                  <span className="theme-preview" aria-hidden="true"><i /><i /><i /></span>
                  <span className="theme-name">{t.icon}{t.label}{s.theme === t.value && <Check size={14} className="theme-check" />}</span>
                  <small>{t.hint}</small>
                </button>
              ))}
            </div>
          </Row>
          <Row label="Reduce animations" hint="Turns off route pulses, page transitions and scroll effects. Your device setting is always respected.">
            <Switch checked={s.motion === 'reduced'} onChange={on => s.update({ motion: on ? 'reduced' : 'system' })} label={s.motion === 'reduced' ? 'On' : 'Off'} />
          </Row>
        </Section>

        <Section icon={<MapIcon size={16} />} title="Map defaults" note="Used each time you open the map. You can still change them there.">
          <Row label="Map style">
            <div className="style-pick" role="radiogroup" aria-label="Map style">
              {LAYER_KEYS.map(k => (
                <button key={k} type="button" role="radio" aria-checked={s.mapLayer === k} className="style-opt" onClick={() => setMapLayer(k)}>
                  <i style={{ '--sw-water': LAYERS[k].swatch.water, '--sw-land': LAYERS[k].swatch.land } as CSSProperties}><span className="sw-land" /></i>
                  {LAYERS[k].label}
                </button>
              ))}
            </div>
          </Row>
          <Row label={<label htmlFor="set-region">State</label>}>
            <Select<RegionCode> id="set-region" value={s.region} onChange={r => { s.update({ region: r }); market.setRegion(r); }}
              options={REGIONS.map(r => ({ value: r.code, label: r.code === 'AU' ? r.name : `${r.name} (${r.code})` }))} />
          </Row>
          <Row label={<label htmlFor="set-radius">Search distance</label>}>
            <Select<number> id="set-radius" value={s.radiusKm} onChange={r => { s.update({ radiusKm: r }); market.set({ radiusKm: r }); }} options={RADII} />
          </Row>
        </Section>

        <Section icon={<Bell size={16} />} title="Email notifications" note="Demo: saved in this browser. No emails are sent yet.">
          <div className="settings-switches">
            <Switch checked={s.notifications.newMatches} onChange={v => s.update({ notifications: { ...s.notifications, newMatches: v } })}
              label={account?.role === 'seller' ? 'New buyer requests for my materials' : 'New suppliers that match my needs'} hint="As soon as they are listed" />
            <Switch checked={s.notifications.enquiries} onChange={v => s.update({ notifications: { ...s.notifications, enquiries: v } })}
              label={account?.role === 'seller' ? 'Quote requests from buyers' : 'Replies to my quote requests'} hint="Every message" />
            <Switch checked={s.notifications.weeklySummary} onChange={v => s.update({ notifications: { ...s.notifications, weeklySummary: v } })}
              label="Weekly summary" hint="Prices, new listings and emissions avoided, every Monday" />
          </div>
        </Section>

        {account && (
          <Section icon={<UserRound size={16} />} title="Account" note="Editing business details comes with backend sign-in (see AUTH.md).">
            <dl className="settings-spec">
              <div><dt>Business</dt><dd>{account.company}</dd></div>
              <div><dt>Name</dt><dd>{account.name}</dd></div>
              <div><dt>Email</dt><dd>{account.email}</dd></div>
              <div><dt>Account type</dt><dd>{account.role === 'buyer' ? 'Buyer' : 'Seller'}{account.demo ? ' (demo)' : ''}</dd></div>
              {account.abn && <div><dt>ABN</dt><dd className="num">{account.abn.replace(/(\d{2})(\d{3})(\d{3})(\d{3})/, '$1 $2 $3 $4')}</dd></div>}
              <div><dt>Site</dt><dd>{account.site.name}, {account.site.suburb} {account.site.state}</dd></div>
            </dl>
            <div className="settings-actions">
              <button type="button" className="btn btn-ghost" onClick={async () => { await signOut(); navigate('/'); }}><LogOut size={15} />Sign out</button>
              <button type="button" className="btn btn-ghost danger" onClick={resetDemo}><RotateCcw size={15} />Reset demo data</button>
            </div>
          </Section>
        )}
      </div>
    </main>
  );
}
