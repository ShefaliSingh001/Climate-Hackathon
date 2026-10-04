import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import type { Listing, MaterialKey, Site } from '../../api/types';
import { ListingCard } from '../listings/ListingCard';
import { Select } from '../ui/Select';
import { MATERIALS } from '../../lib/materials';
import { roadKm } from '../../lib/geo';
import { rankListings } from '../../lib/ranking';
import { tonnes } from '../../lib/format';

type Sort = 'rank' | 'distance' | 'price' | 'volume';

interface Props {
  /** Suppliers that qualify and aren't in the order yet. */
  candidates: Listing[];
  site: Site;
  material: MaterialKey;
  /** Tonnes a month still needed, for the header. */
  shortT: number;
  onAdd: (ids: string[]) => void;
  onClose: () => void;
}

/** Pop-up list of suppliers to add to a combined order, in the same card style as the map's side list. */
export function SupplierPicker({ candidates, site, material, shortT, onAdd, onClose }: Props) {
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('rank');
  const dialog = useRef<HTMLDivElement>(null);

  const views = useMemo(() => candidates.map(l => ({ ...l, distanceKm: roadKm(site, l) })), [candidates, site]);
  const rankings = useMemo(() => rankListings(views), [views]);
  const q = query.trim().toLowerCase();
  const shown = views
    .filter(l => !q || `${l.company} ${l.suburb} ${l.state}`.toLowerCase().includes(q))
    .sort((a, b) =>
      sort === 'distance' ? a.distanceKm - b.distanceKm
      : sort === 'price' ? a.priceAud - b.priceAud
      : sort === 'volume' ? b.tonnes - a.tonnes
      : (rankings.get(a.id)?.position ?? 0) - (rankings.get(b.id)?.position ?? 0));

  // Escape closes; focus starts in the dialog and the page behind doesn't scroll.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLElement>('input')?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, []);

  const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));

  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="sp-title" ref={dialog}>
        <header className="modal-head">
          <div>
            <h2 id="sp-title">Add suppliers</h2>
            <p className="hint">
              {candidates.length} {MATERIALS[material].label.toLowerCase()} {candidates.length === 1 ? 'supplier matches' : 'suppliers match'} your grade and purity
              {shortT > 0.5 ? ` · you still need ${tonnes(shortT)} a month` : ''}.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="modal-tools">
          <label className="field-search">
            <Search size={15} />
            <input type="search" placeholder="Search by name or suburb" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search suppliers" />
          </label>
          <Select<Sort> id="sp-sort" size="sm" prefix="Sort" aria-label="Sort suppliers" value={sort} onChange={setSort} options={[
            { value: 'rank', label: 'Best ranked' },
            { value: 'distance', label: 'Nearest' },
            { value: 'price', label: 'Cheapest' },
            { value: 'volume', label: 'Largest volume' },
          ]} />
        </div>

        <div className="modal-list">
          {shown.map(l => {
            const on = picked.includes(l.id);
            return (
              <ListingCard
                key={l.id}
                listing={l}
                ranking={rankings.get(l.id)}
                selected={on}
                onOpen={() => toggle(l.id)}
                actionLabel={on ? 'Selected. Press to remove' : 'Press to select'}
                trailing={<span className={`sel-box pick-box ${on ? 'on' : ''}`} aria-hidden="true">{on && <Check size={13} strokeWidth={3} />}</span>}
              />
            );
          })}
          {shown.length === 0 && <div className="empty">{candidates.length ? 'No suppliers match your search.' : 'Every qualifying supplier is already in your order.'}</div>}
        </div>

        <footer className="modal-foot">
          <span className="hint">{picked.length ? `${picked.length} selected` : 'Select one or more suppliers'}</span>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!picked.length} onClick={() => onAdd(picked)}>
            {picked.length ? `Add ${picked.length} ${picked.length === 1 ? 'supplier' : 'suppliers'}` : 'Add suppliers'}
          </button>
        </footer>
      </div>
    </div>
  );
}
