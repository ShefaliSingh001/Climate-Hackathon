import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, MapPin, Moon, Search, Settings as SettingsIcon, Sun } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useMarket } from '../../state/store';
import { useSettings } from '../../state/settings';
import { Logo } from '../brand/Logo';

export { APP_NAME } from '../brand/Logo';

const NAV = {
  buyer: [
    { to: '/marketplace', label: 'Supply map' },
    { to: '/sourcing', label: 'Sourcing' },
    { to: '/impact', label: 'Impact' },
  ],
  seller: [
    { to: '/marketplace', label: 'Buyer requests' },
    { to: '/my-listings', label: 'My listings' },
    { to: '/impact', label: 'Impact' },
  ],
};

export function TopBar() {
  const { account, signOut } = useAuth();
  const { query, set } = useMarket();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);
  const { theme, update } = useSettings();
  const dark = theme === 'dark' || (theme === 'system' && typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [menu]);

  if (!account) return null;
  const isBuyer = account.role === 'buyer';
  const initials = account.company.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const onMap = pathname === '/marketplace' || pathname.startsWith('/listing');

  return (
    <header className="topbar">
      <Logo to="/" size={24} />
      <nav className="nav" aria-label="Main">
        {NAV[account.role].map(n => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive || (n.to === '/marketplace' && onMap) ? 'active' : '')}>{n.label}</NavLink>
        ))}
      </nav>
      <label className="search">
        <Search size={16} />
        <span className="sr-only">Search</span>
        <input
          id="global-search"
          type="search"
          value={query}
          placeholder={isBuyer ? 'Search copper, HMS steel, suburbs…' : 'Search buyer requests by material or company…'}
          onChange={e => { set({ query: e.target.value }); if (pathname !== '/marketplace') navigate('/marketplace'); }}
        />
      </label>
      <div className="spacer" />
      <div className="account" ref={menuRef}>
        <button className="account-btn" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(m => !m)}>
          <span className="avatar">{initials}</span>
          <span className="account-name">{account.company}<small>{isBuyer ? 'Buyer' : 'Seller'}</small></span>
          <ChevronDown size={15} />
        </button>
        {menu && (
          <div className="account-menu" role="menu">
            <div className="account-head">
              <b>{account.name}</b>
              <span>{account.email}</span>
              <span className={`role-badge ${account.role}`}>{isBuyer ? 'Buyer account' : 'Seller account'}{account.demo ? ' · demo' : ''}</span>
            </div>
            <div className="account-row"><MapPin size={14} />{account.site.suburb}, {account.site.state}</div>
            <Link role="menuitem" to="/settings" className="account-row action" onClick={() => setMenu(false)}>
              <SettingsIcon size={14} />Settings
            </Link>
            <button role="menuitem" className="account-row action plain" onClick={() => update({ theme: dark ? 'light' : 'dark' })}>
              {dark ? <Sun size={14} /> : <Moon size={14} />}{dark ? 'Light mode' : 'Dark mode'}
            </button>
            <button role="menuitem" className="account-row action" onClick={async () => { await signOut(); navigate('/'); }}>
              <LogOut size={14} />Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
