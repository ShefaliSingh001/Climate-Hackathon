import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Factory, Recycle } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { DEMO_ACCOUNTS } from '../auth/mockAuth';
import type { Role } from '../auth/types';
import { DotField } from '../components/brand/DotField';
import { Logo } from '../components/brand/Logo';
import { PLACES, placeLabel, toSite } from '../lib/places';

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

const ROLE_OPTIONS: { role: Role; title: string; text: string; Icon: typeof Factory }[] = [
  { role: 'buyer', title: 'I buy recycled material', text: 'Manufacturers sourcing feedstock', Icon: Factory },
  { role: 'seller', title: 'I sell recovered material', text: 'Recyclers and producers', Icon: Recycle },
];

export function Signup() {
  const { account, signUp } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [role, setRole] = useState<Role>(params.get('role') === 'seller' ? 'seller' : 'buyer');
  const [form, setForm] = useState({ company: '', name: '', email: '', password: '', abn: '', place: 0 });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form | 'form', string>>>({});
  const [busy, setBusy] = useState(false);

  if (account) return <Navigate to="/marketplace" replace />;
  const update = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!form.company.trim()) errs.company = 'Enter your business name.';
    if (!form.name.trim()) errs.name = 'Enter your name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = 'Enter a valid email address.';
    if (form.password.length < 8) errs.password = 'Use at least 8 characters.';
    if (!/^\d{11}$/.test(form.abn.replace(/\s/g, ''))) errs.abn = 'Enter your 11-digit ABN.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await signUp({ ...form, role, site: toSite(form.company, PLACES[form.place]) });
      navigate(role === 'seller' ? '/my-listings' : '/marketplace', { replace: true });
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
          <label className="field">{role === 'buyer' ? 'Delivery site' : 'Yard location'}
            <select id="su-place" value={form.place} onChange={e => update({ place: Number(e.target.value) })}>
              {PLACES.map((p, i) => <option key={placeLabel(p)} value={i}>{placeLabel(p)}</option>)}
            </select>
          </label>
        </div>
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
