import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { FilterBar } from '../components/listings/FilterBar';
import { ListingCard } from '../components/listings/ListingCard';
import { ListingDrawer } from '../components/listings/ListingDrawer';
import { MarketMap } from '../components/map/MarketMap';
import { useListings } from '../hooks/useListings';
import { HOME_SITE, regionByCode } from '../lib/regions';
import { useMarket } from '../state/store';

export function Marketplace() {
  const { id: selectedId = null } = useParams();
  const navigate = useNavigate();
  const { mode, region, hoveredId, set } = useMarket();
  const { all, inRegion, visible, loading, error } = useListings();
  const selected = selectedId ? all.find(l => l.id === selectedId) : undefined;

  const select = (id: string) => navigate(`/listing/${id}`);
  const close = () => navigate('/');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && selectedId) navigate('/'); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, navigate]);

  const noun = mode === 'supply' ? 'supply listings' : 'buyer requests';

  return (
    <main className="market">
      <aside className="rail" aria-label="Results">
        <FilterBar inRegion={inRegion} />
        <div className="results-head">
          <span><strong className="num">{visible.length}</strong> {noun} in {region === 'AU' ? 'Australia' : regionByCode(region).name}</span>
          <span>from {HOME_SITE.suburb}, {HOME_SITE.state}</span>
        </div>
        <div className="list" onMouseLeave={() => set({ hoveredId: null })}>
          {error && <div className="notice error" role="alert"><AlertTriangle size={16} />Couldn't load listings: {error.message}</div>}
          {loading && !all.length && [0, 1, 2, 3].map(i => <div key={i} className="skeleton" />)}
          {!loading && !error && visible.length === 0 && (
            <div className="empty">No {noun} match these filters.<br />Try another state, a wider distance or a different material.</div>
          )}
          {visible.map(l => (
            <ListingCard
              key={l.id}
              listing={l}
              selected={l.id === selectedId}
              hovered={l.id === hoveredId}
              onSelect={() => select(l.id)}
              onHover={on => set({ hoveredId: on ? l.id : null })}
            />
          ))}
        </div>
      </aside>

      <MarketMap listings={visible} selectedId={selectedId} onSelect={select}>
        {selected && <ListingDrawer listing={selected} onClose={close} />}
      </MarketMap>
    </main>
  );
}
