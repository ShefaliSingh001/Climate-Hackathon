import { useState, type FormEvent, type ReactNode } from 'react';
import { api, isMock } from '../api/client';
import type { MaterialKey, NewListing } from '../api/types';
import { DATASET_MATERIALS, GRADES, MATERIALS, MATERIAL_KEYS } from '../lib/materials';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Factory, Recycle } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { DEMO_ACCOUNTS } from '../auth/mockAuth';
import type { Role } from '../auth/types';
import { DotField } from '../components/brand/DotField';
import { Logo } from '../components/brand/Logo';
import { PLACES, placeLabel, toSite } from '../lib/places';
import { NumberField } from '../components/ui/NumberField';
import { Select } from '../components/ui/Select';

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth">
      <aside className="auth-brand">
        <DotField />
        <div className="auth-brand-inner">
          <Logo to="/" size={64} tagline />
          <p>Recycled materials, matched to the manufacturers who need them.</p>
        </div>
      </aside>
      <section className="auth-panel">
        <div className="auth-card">{children}</div>
      </section>
    </main>
  );
}

/** Where to go after signing in: the requested page if it was inside the app, otherwise the map. */
function useNext() {
  const [params] = useSearchParams();
  const next = params.get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/marketplace';
}

function DemoButtons() {
  const { signInDemo } = useAuth();
  const navigate = useNavigate();
  const next = useNext();
  const go = async (role: Role) => { await signInDemo(role); navigate(next, { replace: true }); };
  return (
    <>
      <div className="or"><span>or try a demo account</span></div>
      <div className="demo-row">
        {(['buyer', 'seller'] as Role[]).map(r => (
          <button key={r} type="button" className="demo" onClick={() => go(r)}>
            <b>Demo {r}</b>
            <span>{DEMO_ACCOUNTS[r].company} · {DEMO_ACCOUNTS[r].site.suburb}</span>
          </button>
        ))}
      </div>
    </>
  );
}

export function Login() {
  const { account, signIn } = useAuth();
  const navigate = useNavigate();
  const next = useNext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (account) return <Navigate to={next} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    setBusy(true); setError('');
    try { await signIn(email, password); navigate(next, { replace: true }); }
    catch (err) { setError((err as Error).message); setBusy(false); }
  }

  return (
    <AuthLayout>
      <h1>Log in</h1>
      <p className="muted">Welcome back. Use your work email.</p>
      <form className="auth-form" onSubmit={submit} noValidate>
        <label className="field">Email
          <input id="login-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com.au" />
        </label>
        <label className="field">Password
          <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        {error && <div className="notice error" role="alert"><AlertTriangle size={16} />{error}</div>}
        <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
      <DemoButtons />
      <p className="muted small">New to ResourceX? <Link to="/signup">Create an account</Link></p>
    </AuthLayout>
  );
}

// Compliance tags used by the NSW dataset (demo tags, see backend/README.md).
const CERTS = ['Cert A', 'Cert B', 'Cert C', 'Cert D', 'Cert E'];
const SIGNUP_MATERIALS = isMock ? MATERIAL_KEYS : DATASET_MATERIALS;

const isoDay = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** What the business sells (seller) or needs (buyer). Saved as its producers / manufacturers row. */
interface Business {
  material: MaterialKey;
  grade: string;
  /** Seller: input materials it processes. Buyer: what it makes with the material. */
  detail: string;
  tonnes: number;
  priceAud: number;
  budgetAud: number;
  orderBy: string;
  deliverBy: string;
  certifications: string[];
  website: string;
}

const ROLE_OPTIONS: { role: Role; title: string; text: string; Icon: typeof Factory }[] = [
  { role: 'buyer', title: 'I buy recycled material', text: 'Manufacturers sourcing feedstock', Icon: Factory },
  { role: 'seller', title: 'I sell recovered material', text: 'Recyclers and producers', Icon: Recycle },
];

export function Signup() {
  const { account, signUp, isEmailAvailable } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [role, setRole] = useState<Role>(params.get('role') === 'seller' ? 'seller' : 'buyer');
  const [form, setForm] = useState({ company: '', name: '', email: '', password: '', abn: '', place: 0 });
  const [biz, setBiz] = useState<Business>({
    material: SIGNUP_MATERIALS[0], grade: GRADES.high, detail: '', tonnes: 50, priceAud: 0, budgetAud: 0,
    orderBy: isoDay(14), deliverBy: isoDay(45), certifications: ['Cert A'], website: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form | keyof Business | 'form', string>>>({});
  const [busy, setBusy] = useState(false);

  // While submitting, signUp sets the account before navigate() runs; don't let this redirect win.
  if (account && !busy) return <Navigate to="/marketplace" replace />;
  const update = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));
  const updateBiz = (patch: Partial<Business>) => setBiz(b => ({ ...b, ...patch }));
  const toggleCert = (c: string) =>
    updateBiz({ certifications: biz.certifications.includes(c) ? biz.certifications.filter(x => x !== c) : [...biz.certifications, c] });
  const seller = role === 'seller';

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!form.company.trim()) errs.company = 'Enter your business name.';
    if (!form.name.trim()) errs.name = 'Enter your name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = 'Enter a valid email address.';
    if (form.password.length < 8) errs.password = 'Use at least 8 characters.';
    if (!/^\d{11}$/.test(form.abn.replace(/\s/g, ''))) errs.abn = 'Enter your 11-digit ABN.';
    if (!(biz.tonnes > 0)) errs.tonnes = 'Enter tonnes per month above zero.';
    if (seller && !biz.detail.trim()) errs.detail = 'Describe the material you take in, e.g. "Steel offcuts and swarf".';
    if (seller && !(biz.priceAud > 0)) errs.priceAud = 'Enter your asking price in dollars per tonne.';
    if (!seller && !(biz.budgetAud > 0)) errs.budgetAud = 'Enter your total budget in dollars.';
    if (!seller && (!biz.orderBy || !biz.deliverBy)) errs.deliverBy = 'Enter both dates.';
    else if (!seller && biz.deliverBy < biz.orderBy) errs.deliverBy = 'Delivery can\'t be before the order date.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      if (!(await isEmailAvailable(form.email))) throw new Error('An account with this email already exists. Log in instead.');
      const site = toSite(form.company.trim(), PLACES[form.place]);
      const abn = form.abn.replace(/\s/g, '');
      const website = biz.website.trim() ? (/^https?:\/\//.test(biz.website.trim()) ? biz.website.trim() : `https://${biz.website.trim()}`) : null;
      // Save the business first (producers or manufacturers table), then create the login.
      const listing: NewListing = {
        kind: seller ? 'supply' : 'demand', company: form.company.trim(), abn, website,
        suburb: site.suburb, state: site.state, lat: site.lat, lng: site.lng,
        material: biz.material, grade: biz.grade, form: biz.detail.trim(), tonnes: biz.tonnes, frequency: 'Monthly',
        priceAud: seller ? biz.priceAud : Math.round((biz.budgetAud / biz.tonnes) * 100) / 100,
        virginPriceAud: null, purity: null, certifications: seller ? biz.certifications : [],
        ...(seller ? {} : { budgetAud: biz.budgetAud, orderBy: biz.orderBy, deliverBy: biz.deliverBy }),
      };
      try {
        await api.createListing(listing);
      } catch (err) {
        throw new Error(`Couldn't save your business: ${(err as Error).message}`);
      }
      await signUp({ ...form, abn, role, site });
      navigate(seller ? '/my-listings' : '/marketplace', { replace: true });
    } catch (err) {
      setErrors({ form: (err as Error).message });
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <h1>Create your account</h1>
      <p className="muted">Choose the side of the market you're on. You can't switch later without a new account.</p>
      <form className="auth-form" onSubmit={submit} noValidate>
        <div className="role-pick" role="radiogroup" aria-label="Account type">
          {ROLE_OPTIONS.map(({ role: r, title, text, Icon }) => (
            <button key={r} type="button" role="radio" aria-checked={role === r} className="role-opt" onClick={() => setRole(r)}>
              <Icon size={18} /><b>{title}</b><span>{text}</span>
            </button>
          ))}
        </div>
        <div className="form-row">
          <label className="field">Business name
            <input id="su-company" value={form.company} onChange={e => update({ company: e.target.value })} aria-invalid={!!errors.company} />
            {errors.company && <span className="err">{errors.company}</span>}
          </label>
          <label className="field">ABN
            <input id="su-abn" inputMode="numeric" placeholder="11 digits" value={form.abn} onChange={e => update({ abn: e.target.value })} aria-invalid={!!errors.abn} />
            {errors.abn && <span className="err">{errors.abn}</span>}
          </label>
        </div>
        <div className="form-row">
          <label className="field">Your name
            <input id="su-name" autoComplete="name" value={form.name} onChange={e => update({ name: e.target.value })} aria-invalid={!!errors.name} />
            {errors.name && <span className="err">{errors.name}</span>}
          </label>
          <div className="field"><label htmlFor="su-place">{role === 'buyer' ? 'Delivery site' : 'Yard location'}</label>
            <Select<number> id="su-place" value={form.place} onChange={i => update({ place: i })}
              options={PLACES.map((p, i) => ({ value: i, label: placeLabel(p) }))} />
          </div>
        </div>
        <fieldset className="auth-section">
          <legend>{seller ? 'What you sell' : 'What you need'}</legend>
          <div className="form-row">
            <div className="field"><label htmlFor="su-material">{seller ? 'Material you produce' : 'Material you need'}</label>
              <Select<MaterialKey> id="su-material" value={biz.material} onChange={k => updateBiz({ material: k })}
                options={SIGNUP_MATERIALS.map(k => ({ value: k, label: MATERIALS[k].label, color: MATERIALS[k].color }))} />
            </div>
            <div className="field"><label htmlFor="su-grade">{seller ? 'Grade you produce' : 'Grade required'}</label>
              <Select<string> id="su-grade" value={biz.grade} onChange={g => updateBiz({ grade: g })}
                options={Object.values(GRADES).map(g => ({ value: g, label: g }))} />
            </div>
          </div>
          <label className="field">{seller ? 'Input materials you process' : 'What you make with it (optional)'}
            <input id="su-detail" value={biz.detail} placeholder={seller ? 'Steel offcuts, swarf and plate' : 'Structural sections, window frames…'}
              onChange={e => updateBiz({ detail: e.target.value })} aria-invalid={!!errors.detail} />
            {errors.detail && <span className="err">{errors.detail}</span>}
          </label>
          <div className="form-row">
            <label className="field" htmlFor="su-tonnes">{seller ? 'How much you produce each month' : 'How much you need each month'}
              <NumberField id="su-tonnes" min={0} value={biz.tonnes || null} onChange={v => updateBiz({ tonnes: v ?? 0 })} suffix="tonnes" aria-invalid={!!errors.tonnes} />
              {errors.tonnes && <span className="err">{errors.tonnes}</span>}
            </label>
            {seller ? (
              <label className="field" htmlFor="su-price">Asking price per tonne
                <NumberField id="su-price" min={0} value={biz.priceAud || null} onChange={v => updateBiz({ priceAud: v ?? 0 })} prefix="$" aria-invalid={!!errors.priceAud} />
                {errors.priceAud && <span className="err">{errors.priceAud}</span>}
              </label>
            ) : (
              <label className="field" htmlFor="su-budget">Total budget (excluding freight)
                <NumberField id="su-budget" min={0} value={biz.budgetAud || null} onChange={v => updateBiz({ budgetAud: v ?? 0 })} prefix="$" aria-invalid={!!errors.budgetAud} />
                {errors.budgetAud && <span className="err">{errors.budgetAud}</span>}
              </label>
            )}
          </div>
          {seller ? (
            <div className="field">Compliance
              <div className="chips">
                {CERTS.map(c => <button type="button" key={c} className="chip" aria-pressed={biz.certifications.includes(c)} onClick={() => toggleCert(c)}>{c}</button>)}
              </div>
            </div>
          ) : (
            <div className="form-row">
              <label className="field">Order by
                <input id="su-order-by" type="date" value={biz.orderBy} onChange={e => updateBiz({ orderBy: e.target.value })} />
              </label>
              <label className="field">Deliver by
                <input id="su-deliver-by" type="date" value={biz.deliverBy} onChange={e => updateBiz({ deliverBy: e.target.value })} aria-invalid={!!errors.deliverBy} />
                {errors.deliverBy && <span className="err">{errors.deliverBy}</span>}
              </label>
            </div>
          )}
          <label className="field">Website (optional)
            <input id="su-website" type="url" placeholder="www.yourcompany.com.au" value={biz.website} onChange={e => updateBiz({ website: e.target.value })} />
          </label>
        </fieldset>
        <label className="field">Work email
          <input id="su-email" type="email" autoComplete="email" value={form.email} onChange={e => update({ email: e.target.value })} aria-invalid={!!errors.email} />
          {errors.email && <span className="err">{errors.email}</span>}
        </label>
        <label className="field">Password
          <input id="su-password" type="password" autoComplete="new-password" value={form.password} onChange={e => update({ password: e.target.value })} aria-invalid={!!errors.password} />
          {errors.password && <span className="err">{errors.password}</span>}
        </label>
        {errors.form && <div className="notice error" role="alert"><AlertTriangle size={16} />{errors.form}</div>}
        <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
      <p className="muted small">Already have an account? <Link to="/login">Log in</Link></p>
    </AuthLayout>
  );
}
