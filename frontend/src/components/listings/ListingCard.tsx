import type { CSSProperties } from 'react';
import { BadgeCheck, ChevronRight } from 'lucide-react';
import type { ListingView } from '../../hooks/useListings';
import type { Ranking } from '../../lib/ranking';
import { MATERIALS } from '../../lib/materials';
import { aud, fmtInt, volume } from '../../lib/format';

interface Props {
  listing: ListingView;
  ranking?: Ranking;
  hovered: boolean;
  onOpen: () => void;
  onHover: (on: boolean) => void;
}

/** Rail card: position and the listing's key stats in plain words. Full details live on the listing page. */
export function ListingCard({ listing: l, ranking, hovered, onOpen, onHover }: Props) {
  const m = MATERIALS[l.material];

  return (
    <article
      className={`card ranked${hovered ? ' is-hover' : ''}`}
      tabIndex={0}
      role="link"
      aria-label={`${l.company}${ranking ? `, ranked ${ranking.position} of ${ranking.of}` : ''}. Open details`}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <div className="card-top">
        {ranking && <div className={`rank-badge${ranking.position <= 3 ? ' podium' : ''}`}><b>#{ranking.position}</b><span>of {ranking.of}</span></div>}
        <div className="card-title">
          <h3>
            <span className={`code small${l.kind === 'supply' ? '' : ' square'}`} style={{ '--c': m.color } as CSSProperties} title={m.label} aria-label={m.label}>{m.code}</span>
            {l.company}{l.verified && <span className="verified" title="Verified site and licences"><BadgeCheck size={15} /></span>}
          </h3>
          <p className="card-sub">{l.suburb}, {l.state}</p>
        </div>
        <ChevronRight size={16} className="chev" aria-hidden="true" />
      </div>
      <dl className="card-stats">
        <div><dt>Material</dt><dd>{m.label}</dd></div>
        <div><dt>{l.kind === 'supply' ? 'Production rate' : 'Quantity needed'}</dt><dd>{volume(l.tonnes, l.frequency)}</dd></div>
        <div><dt>{l.kind === 'supply' ? 'Price' : 'Pays up to'}</dt><dd>{aud(l.priceAud)} per tonne</dd></div>
        <div><dt>Distance</dt><dd>{fmtInt(l.distanceKm)} km away</dd></div>
      </dl>
    </article>
  );
}
