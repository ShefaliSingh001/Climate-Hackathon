import type { CSSProperties } from 'react';
import { BadgeCheck, Leaf } from 'lucide-react';
import type { ListingView } from '../../hooks/useListings';
import { MATERIALS } from '../../lib/materials';
import { aud, belowVirgin, fmtInt, monthlyTonnes, per } from '../../lib/format';

interface Props {
  listing: ListingView;
  selected: boolean;
  hovered: boolean;
  onSelect: () => void;
  onHover: (on: boolean) => void;
}

export function ListingCard({ listing: l, selected, hovered, onSelect, onHover }: Props) {
  const m = MATERIALS[l.material];
  const isSupply = l.kind === 'supply';
  const pct = belowVirgin(l.priceAud, l.virginPriceAud);
  const co2 = monthlyTonnes(l.tonnes, l.frequency) * m.co2PerTonne;

  return (
    <article
      className={`card${selected ? ' is-selected' : ''}${hovered ? ' is-hover' : ''}`}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      aria-label={l.company}
      onClick={onSelect}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <div className="card-top">
        <div className={`code${isSupply ? '' : ' square'}`} style={{ '--c': m.color } as CSSProperties}>{m.code}</div>
        <div className="card-title">
          <h3>{l.company}{l.verified && <span className="verified" title="Verified site and licences"><BadgeCheck size={16} /></span>}</h3>
          <p>{l.grade} · {l.form}</p>
        </div>
        {l.matchScore != null && <div className="score"><b>{l.matchScore}</b><span>Match</span></div>}
      </div>
      <dl className="metrics">
        <div className="metric"><dt>{isSupply ? 'Available' : 'Wants'}</dt><dd className="num">{fmtInt(l.tonnes)} t/{per(l.frequency)}</dd></div>
        <div className="metric">
          <dt>{isSupply ? 'Price' : 'Pays up to'}</dt>
          <dd><span className="num">{aud(l.priceAud)}</span>{pct != null && <> <span className="delta num">−{pct}%</span></>}</dd>
        </div>
        <div className="metric"><dt>Distance</dt><dd className="num">{fmtInt(l.distanceKm)} km</dd></div>
      </dl>
      <div className="card-foot">
        <span className="co2"><Leaf size={13} /><span className="num">≈{fmtInt(co2)}</span> tCO₂e/mo avoided</span>
        <span>{l.suburb}, {l.state} · <span className="tag">{l.certifications[0]}</span></span>
      </div>
    </article>
  );
}
