import type { CSSProperties } from 'react';
import { BadgeCheck, ChevronRight } from 'lucide-react';
import type { ListingView } from '../../hooks/useListings';
import type { Ranking } from '../../lib/ranking';
import { MATERIALS } from '../../lib/materials';
import { aud, fmtInt, volume } from '../../lib/format';
import { RankBars } from './RankBars';

interface Props {
  listing: ListingView;
  ranking?: Ranking;
  hovered: boolean;
  onOpen: () => void;
  onHover: (on: boolean) => void;
}

/** Rail card: position, key facts in plain words, and the ranking breakdown. Full details live on the listing page. */
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
          <p className="card-line">
            <span>{m.label}</span>
            <span>{volume(l.tonnes, l.frequency)}</span>
          </p>
          <p className="card-line">
            <span>{aud(l.priceAud)} per tonne</span>
            <span>{fmtInt(l.distanceKm)} km away</span>
          </p>
        </div>
        <ChevronRight size={16} className="chev" aria-hidden="true" />
      </div>
      {ranking && <RankBars factors={ranking.factors} of={ranking.of} kind={l.kind} compact />}
    </article>
  );
}
