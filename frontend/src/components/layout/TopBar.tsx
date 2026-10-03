import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Plus, RefreshCcw, Search } from 'lucide-react';
import { useMarket } from '../../state/store';
import { HOME_SITE } from '../../lib/regions';

export const APP_NAME = 'CircuLink';

export function TopBar() {
  const { mode, query, set } = useMarket();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const onMarket = pathname === '/' || pathname.startsWith('/listing');

  const goMarket = () => { if (!onMarket) navigate('/'); };

  return (
    <header className="topbar">
      <Link to="/" className="brand">
        <span className="brand-mark" aria-hidden="true"><RefreshCcw size={17} strokeWidth={2.2} /></span>
        <span>{APP_NAME}<small>Secondary materials exchange · Australia</small></span>
      </Link>
      <nav className="nav" aria-label="Main">
        <NavLink to="/" end className={() => (onMarket ? 'active' : '')}>Marketplace</NavLink>
        <NavLink to="/matches">AI matches</NavLink>
        <NavLink to="/impact">Impact</NavLink>
      </nav>
      <label className="search">
        <Search size={16} />
        <span className="sr-only">Search materials and companies</span>
        <input
          id="global-search"
          type="search"
          value={query}
          placeholder={mode === 'supply' ? 'Search copper, PET flake, HMS steel, suburbs…' : 'Search buyer requests by material or company…'}
          onChange={e => { set({ query: e.target.value }); goMarket(); }}
        />
      </label>
      <div className="spacer" />
      <div className="seg" role="group" aria-label="I want to">
        <button aria-pressed={mode === 'supply'} onClick={() => { set({ mode: 'supply', materials: [] }); goMarket(); }}>Buy</button>
        <button aria-pressed={mode === 'demand'} onClick={() => { set({ mode: 'demand', materials: [] }); goMarket(); }}>Sell</button>
      </div>
      <Link to="/sell/new" className="btn btn-primary"><Plus size={16} /><span className="label">List material</span></Link>
      <div className="avatar" title={`${HOME_SITE.name}, ${HOME_SITE.suburb} ${HOME_SITE.state}`}>WC</div>
    </header>
  );
}
