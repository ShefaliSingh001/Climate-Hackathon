import { FACTORS, type Factor, type FactorRank } from '../../lib/ranking';
import { ordinal } from '../../lib/format';

interface Props {
  factors: Record<Factor, FactorRank>;
  of: number;
  /** Buyer requests rank price the other way round (higher offer is better). */
  kind?: 'supply' | 'demand';
}

const BEST: Record<Factor, { supply: string; demand: string }> = {
  material: { supply: 'quality', demand: 'quality' },
  distance: { supply: 'nearest', demand: 'nearest' },
  price: { supply: 'cheapest', demand: 'best offer' },
  reliability: { supply: 'reliability', demand: 'reliability' },
};

/** Four relative bars, each labelled with the listing's position on that factor ("2nd nearest"). */
export function RankBars({ factors, of, kind = 'supply' }: Props) {
  return (
    <div className="rank-bars">
      {FACTORS.map(f => {
        const r = factors[f.key];
        const title = `${ordinal(r.position)} of ${of} for ${BEST[f.key][kind]}`;
        return (
          <div key={f.key} className="rank-bar" title={title}>
            <span className="rb-label">{f.label}</span>
            <div className="track"><div className="fill" style={{ width: `${r.fill}%` }} /></div>
            <span className={`rb-pos${r.position === 1 ? ' top' : ''}`}>{ordinal(r.position)}</span>
          </div>
        );
      })}
    </div>
  );
}
