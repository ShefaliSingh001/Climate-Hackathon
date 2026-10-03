import type { CSSProperties } from 'react';
import { BadgeCheck, ChevronRight } from 'lucide-react';
import type { ListingView } from '../../hooks/useListings';
import { MATERIALS } from '../../lib/materials';
import { aud, fmtInt, per } from '../../lib/format';

interface Props {
  listing: ListingView;
  hovered: boolean;
  onOpen: () => void;
  onHover: (on: boolean) => void;
}

/** Compact row for the results rail. Full details live on the listing page. */
export function ListingCard({ listing: l, hovered, onOpen, onHover }: Props) {
  const m = MATERIALS[l.material];

  return (
    <article
      className={`card compact${hovered ? ' is-hover' : ''}`}
      tabIndex={0}
      role="link"
      aria-label={`${l.company}, open details`}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <div className={`code${l.kind === 'supply' ? '' : ' square'}`} style={{ '--c': m.color } as CSSProperties}>{m.code}</div>
      <div className="card-title">
        <h3>{l.company}{l.verified && <span className="verified" title="Verified site and licences"><BadgeCheck size={15} /></span>}</h3>
        <p className="card-line">
          <span className="num">{fmtInt(l.tonnes)} t/{per(l.frequency)}</span>
          <span className="num">{aud(l.priceAud)}/t</span>
          <span className="num">{fmtInt(l.distanceKm)} km</span>
        </p>
      </div>
      {l.matchScore != null && <div className="score"><b>{l.matchScore}</b><span>Match</span></div>}
      <ChevronRight size={16} className="chev" aria-hidden="true" />
    </article>
  );
}
