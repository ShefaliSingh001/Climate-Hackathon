import { useState } from 'react';
import { aud, fmtInt, tonnes } from '../../lib/format';

export interface MonthPoint {
  key: string;
  /** "Oct" */
  label: string;
  /** "October 2026", for the tooltip. */
  long: string;
  tonnes: number;
  value: number;
  orders: number;
}

/** Nice round step for 3–4 gridlines. */
function niceMax(v: number) {
  if (v <= 0) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = [1, 2, 2.5, 5, 10].find(x => x * p >= v)!;
  return m * p;
}

/** Single-series column chart of tonnes per month, with a hover/focus tooltip on each column. */
export function MonthlyChart({ data, valueLabel }: { data: MonthPoint[]; valueLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...data.map(d => d.tonnes)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * max);
  const h = hover != null ? data[hover] : null;

  return (
    <div className="mchart" onMouseLeave={() => setHover(null)}>
      <div className="mchart-plot">
        <div className="mchart-grid" aria-hidden="true">
          {ticks.slice().reverse().map(t => <div key={t}><span className="num">{fmtInt(t)}</span></div>)}
        </div>
        <div className="mchart-cols" role="list" aria-label="Tonnes each month">
          {data.map((d, i) => (
            <button
              key={d.key}
              type="button"
              role="listitem"
              className={`mchart-col${hover === i ? ' on' : ''}${hover != null && hover !== i ? ' dim' : ''}`}
              aria-label={`${d.long}: ${tonnes(d.tonnes)}, ${d.orders} orders, ${aud(d.value)}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            >
              <span className="mchart-bar" style={{ height: `${(d.tonnes / max) * 100}%` }} />
            </button>
          ))}
          {h && hover != null && (
            <div className="mchart-tip" style={{ left: `${((hover + 0.5) / data.length) * 100}%` }} role="status">
              <b>{h.long}</b>
              <span><i>Tonnes</i><span className="num">{fmtInt(h.tonnes)}</span></span>
              <span><i>{valueLabel}</i><span className="num">{aud(h.value)}</span></span>
              <span><i>Orders</i><span className="num">{h.orders}</span></span>
            </div>
          )}
        </div>
      </div>
      <div className="mchart-x" aria-hidden="true">
        {data.map((d, i) => <span key={d.key} className={hover === i ? 'on' : ''}>{d.label}</span>)}
      </div>
    </div>
  );
}
