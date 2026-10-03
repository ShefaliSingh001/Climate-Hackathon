import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Info } from 'lucide-react';
import { FilterBar } from '../components/listings/FilterBar';
import { ListingCard } from '../components/listings/ListingCard';
import { MarketMap } from '../components/map/MarketMap';
import { useListings } from '../hooks/useListings';
import { regionByCode } from '../lib/regions';
import { useSite } from '../auth/AuthProvider';
import { useMarket } from '../state/store';

export function Marketplace() {
  const navigate = useNavigate();
  const { mode, region, hoveredId, set } = useMarket();
  const HOME_SITE = useSite();
  const { all, inRegion, visible, rankings, loading, error } = useListings();
  const open = (id: string) => {
    set({ hoveredId: null });
    const r = rankings.get(id);
    navigate(`/listing/${id}`, { state: r ? { rank: { position: r.position, of: r.of } } : undefined });
  };

  const noun = mode === 'supply' ? 'supply listings' : 'buyer requests';

  return (
    <main className="market">
      <aside className="rail" aria-label="Results">
        <FilterBar inRegion={inRegion} />
        <div className="results-head">
          <span><strong className="num">{visible.length}</strong> {noun} in {region === 'AU' ? 'Australia' : regionByCode(region).name}</span>
          <span>from {HOME_SITE.suburb}, {HOME_SITE.state}</span>
        </div>
        <details className="rank-legend">
          <summary><Info size={13} />How ranking works</summary>
          <p>Listings are ranked against each other on material quality, distance, price and reliability. "1st" is best. Prices are in Australian dollars per tonne, excluding GST.</p>
        </details>
        <div className="list" onMouseLeave={() => set({ hoveredId: null })}>
          {error && <div className="notice error" role="alert"><AlertTriangle size={16} />Couldn't load listings: {error.message}</div>}
          {loading && !all.length && [0, 1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton" />)}
          {!loading && !error && visible.length === 0 && (
            <div className="empty">No {noun} match these filters.<br />Try another state, a wider distance or a different material.</div>
          )}
          {visible.map(l => (
            <ListingCard
              key={l.id}
              listing={l}
              ranking={rankings.get(l.id)}
              hovered={l.id === hoveredId}
              onOpen={() => open(l.id)}
              onHover={on => set({ hoveredId: on ? l.id : null })}
            />
          ))}
        </div>
      </aside>

      <MarketMap listings={visible} rankings={rankings} onOpen={open} />
    </main>
  );
}
