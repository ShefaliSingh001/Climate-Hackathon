import { ChevronDown, ExternalLink, Info, Leaf, PiggyBank, Recycle } from 'lucide-react';
import { api } from '../api/client';
import type { ImpactStats, Outlook } from '../api/types';
import { useAsync } from '../hooks/useAsync';
import { MATERIALS } from '../lib/materials';
import { aud, tonnes } from '../lib/format';
import { CircularityChart } from '../components/ui/CircularityChart';

/** One decimal, so recycled + new always add to 100% and the headline gap matches the bars. */
const pct1 = (n: number) => `${n.toFixed(1)}%`;

/** Short labels for the "room to grow" chart. */
const SHORT: Record<string, string> = {
  'Steel fabricator (reusing offcuts)': 'Steel fabricators',
  'Stainless fabricator (reusing offcuts)': 'Stainless fabricators',
  'Iron foundry': 'Iron foundries',
  'Stainless and alloy foundry': 'Alloy foundries',
  'Aluminium foundry': 'Aluminium foundry',
  'Brass and bronze foundry': 'Brass foundry',
  'Electric arc furnace steel mill': 'Arc furnace mill',
  'Blast furnace / basic oxygen steelworks': 'Blast furnace mill',
};

export function Impact() {
  const { data, error } = useAsync(() => api.getImpact(), []);

  return (
    <main className="page">
      <div className="page-inner">
        <div className="page-head impact-head">
          <h1>Impact by 2035</h1>
          {data?.isSample && <span className="sample" title="Real NSW companies; tonnages and prices modelled from October 2026 market data">Modelled data</span>}
        </div>

        {error && <div className="notice error"><Info size={16} /><div>Couldn't load the impact figures. Is the backend running?</div></div>}
        {data && <Hero data={data} />}
        {data && <RoomToGrow outlook={data.outlook} />}
        {data && <ThisMonth data={data} />}
        {data && <Method data={data} />}
      </div>
    </main>
  );
}

function Hero({ data }: { data: ImpactStats }) {
  const o = data.outlook;
  const last = o.years.length - 1;
  const expected = o.scenarios.find(s => s.key === 'expected') ?? o.scenarios[0];
  const today = o.businessAsUsualPct[0], without = o.businessAsUsualPct[last], withRx = expected.sharePct[last];
  // Business as usual is flat today, so "today" and "2035 without" are one bar unless they differ.
  const rows: [string, number, boolean][] = Math.abs(today - without) < 0.05
    ? [['Without ResourceX', without, false], ['With ResourceX', withRx, true]]
    : [['Today', today, false], ['2035 without', without, false], ['2035 with ResourceX', withRx, true]];

  return (
    <section className="panel impact-hero">
      <div className="impact-stat">
        <span className="big-stat num">+{(withRx - without).toFixed(1)}<small>points</small></span>
        <p>more recycled metal for small and medium manufacturers by 2035</p>
      </div>
      <div className="impact-hero-grid">
        <div>
          <div className="mix" role="list">
            {rows.map(([label, recycled, lead]) => (
              <div key={label} className={lead ? 'mix-row lead' : 'mix-row'} role="listitem">
                <span className="mix-label">{label}</span>
                <div className="mix-bar" role="img" aria-label={`${label}: ${pct1(recycled)} recycled, ${pct1(100 - recycled)} new`}>
                  <span className="seg-recycled" style={{ width: `${recycled}%` }} title={`Recycled ${pct1(recycled)}`}>{pct1(recycled)}</span>
                  <span className="seg-new" title={`New ${pct1(100 - recycled)}`}>{pct1(100 - recycled)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="chart-legend" aria-hidden="true">
            <span><i className="swatch recycled" /> Recycled</span>
            <span><i className="swatch new" /> New</span>
          </div>
        </div>
        <TrendChart outlook={o} />
      </div>
    </section>
  );
}

/** Recycled share 2026–2035 with ResourceX (expected, with the scenario range) and without it. */
function TrendChart({ outlook }: { outlook: Outlook }) {
  const W = 340, H = 170, P = { l: 30, r: 46, t: 12, b: 22 };
  const { years, businessAsUsualPct: bau, scenarios } = outlook;
  const exp = scenarios.find(s => s.key === 'expected') ?? scenarios[0];
  const lo = scenarios[0].sharePct, hi = scenarios[scenarios.length - 1].sharePct;
  const all = [...bau, ...lo, ...hi];
  const yMin = Math.floor((Math.min(...all) - 4) / 10) * 10, yMax = Math.ceil((Math.max(...all) + 4) / 10) * 10;
  const x = (i: number) => P.l + (i / (years.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - yMin) / (yMax - yMin)) * (H - P.t - P.b);
  const line = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('');
  const band = `${line(hi)}${[...lo].reverse().map((v, j) => `L${x(lo.length - 1 - j)},${y(v)}`).join('')}Z`;
  const last = years.length - 1;
  const ticks = Array.from({ length: (yMax - yMin) / 10 + 1 }, (_, i) => yMin + i * 10);

  return (
    <figure className="trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Recycled share rises from ${pct1(exp.sharePct[0])} in ${years[0]} to ${pct1(exp.sharePct[last])} in ${years[last]} with ResourceX, and stays at ${pct1(bau[last])} without it.`}>
        {ticks.map(v => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="var(--line)" />
            <text x={P.l - 6} y={y(v) + 4} textAnchor="end" className="tick">{v}%</text>
          </g>
        ))}
        <text x={x(0)} y={H - 4} textAnchor="start" className="tick">{years[0]}</text>
        <text x={x(last)} y={H - 4} textAnchor="end" className="tick">{years[last]}</text>
        <path d={band} fill="var(--accent)" fillOpacity={0.14} />
        <path d={line(bau)} fill="none" stroke="var(--ink-3)" strokeWidth={2} strokeDasharray="5 4" />
        <path d={line(exp.sharePct)} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" />
        {exp.sharePct.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={i === last ? 4.5 : 3} fill="var(--accent)" stroke="var(--surface)" strokeWidth={1.5}>
            <title>{years[i]}: {pct1(v)} with ResourceX, {pct1(bau[i])} without</title>
          </circle>
        ))}
        <text x={x(last) + 8} y={y(exp.sharePct[last]) + 4} className="end-label strong">{pct1(exp.sharePct[last])}</text>
        <text x={x(last) + 8} y={y(bau[last]) + 4} className="end-label">{pct1(bau[last])}</text>
      </svg>
      <figcaption className="chart-legend">
        <span><i className="line solid" /> With ResourceX</span>
        <span><i className="line dashed" /> Without</span>
      </figcaption>
    </figure>
  );
}

/** Recycled share today against each process's limit: where the marketplace can still add recycled metal. */
function RoomToGrow({ outlook }: { outlook: Outlook }) {
  const sme = outlook.baselines.map(b => ({ key: b.group, label: SHORT[b.group] ?? b.group, now: b.nowPct, limit: b.ceilingPct, name: b.sourceName, url: b.url }));
  const mills = outlook.mills.buyers.map(m => ({ key: m.name, label: SHORT[m.process] ?? m.name, now: m.recycledNowPct, limit: m.limitPct, name: m.sourceName, url: m.url }));
  const sources = [...new Map([...sme, ...mills].map(r => [r.url, r])).values()];

  const Row = ({ r }: { r: typeof sme[number] }) => {
    const room = r.limit - r.now;
    return (
      <div className="room-row" title={`${r.label}: ${pct1(r.now)} recycled today, process limit ${pct1(r.limit)}`}>
        <span className="room-label">{r.label}</span>
        <span className="room-track" aria-hidden="true">
          <span className="room-now" style={{ width: `${r.now}%` }} />
          <span className="room-gap" style={{ left: `${r.now}%`, width: `${Math.max(0, room)}%` }} />
          <span className="room-limit" style={{ left: `${r.limit}%` }} />
        </span>
        <span className={room < 0.5 ? 'room-val full' : 'room-val'}>{room < 0.5 ? 'at limit' : `+${Math.round(room)}`}</span>
      </div>
    );
  };

  return (
    <section className="panel">
      <h2>Room to grow</h2>
      <div className="room" role="list" aria-label="Recycled share today and process limit, by kind of buyer">
        {sme.map(r => <Row key={r.key} r={r} />)}
        <div className="room-divider">Steel mills · already at their limit, so not in the headline</div>
        {mills.map(r => <Row key={r.key} r={r} />)}
      </div>
      <div className="chart-legend" aria-hidden="true">
        <span><i className="swatch recycled" /> Recycled today</span>
        <span><i className="swatch room" /> Room to grow</span>
        <span><i className="tick-mark" /> Process limit</span>
      </div>
      <p className="source sources-line">
        Sources: {sources.map((s, i) => (
          <span key={s.url}>{i > 0 && ' · '}<a href={s.url} target="_blank" rel="noreferrer">{s.name}</a></span>
        ))}
      </p>
    </section>
  );
}

function ThisMonth({ data }: { data: ImpactStats }) {
  const kpis: [typeof Recycle, string, string][] = [
    [Recycle, 'Scrap matched', tonnes(data.tonnesRecirculated)],
    [Leaf, 'CO₂e avoided', tonnes(data.co2eAvoidedT)],
    [PiggyBank, 'Saved by buyers', aud(data.moneySavedAud)],
  ];
  return (
    <section>
      <h2 className="section-label">This month · {data.period}</h2>
      <dl className="kpis three">
        {kpis.map(([Icon, label, value]) => (
          <div key={label} className="kpi kpi-icon"><Icon size={20} aria-hidden="true" /><div><dt>{label}</dt><dd>{value}</dd></div></div>
        ))}
      </dl>
    </section>
  );
}

/** Everything a judge might check, folded away so it doesn't crowd the page. */
function Method({ data }: { data: ImpactStats }) {
  const o = data.outlook;
  const last = o.years.length - 1;
  return (
    <details className="panel method-details">
      <summary><h2>How we calculate this</h2><span className="hint">numbers, assumptions and sources</span><ChevronDown size={16} /></summary>
      <div className="method-body">
        <h3 className="sub">2035 projection: {o.buyers} small and medium manufacturers</h3>
        <table className="data-table factors">
          <thead><tr><th>Buyer type</th><th className="num">Share of their metal</th><th className="num">Recycled today</th><th className="num">2035 without</th><th className="num">Process limit</th><th>Source</th></tr></thead>
          <tbody>
            {o.baselines.map(b => (
              <tr key={b.group}>
                <td>{b.group} <span className="muted">· {b.buyers}</span></td>
                <td className="num">{b.mixPct}%</td>
                <td className="num">{b.nowPct}%</td>
                <td className="num">{b.bau2035Pct}%</td>
                <td className="num">{b.ceilingPct}%</td>
                <td><a href={b.url} target="_blank" rel="noreferrer" title={b.source}>{b.sourceName} <ExternalLink size={11} /></a></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>All {o.buyers}</td><td className="num">100%</td><td className="num">{o.businessAsUsualPct[0]}%</td>
              <td className="num">{o.businessAsUsualPct[last]}%</td><td className="num">{o.ceilingPct}%</td><td>weighted</td>
            </tr>
          </tfoot>
        </table>
        <ul className="method">{o.assumptions.map(a => <li key={a}>{a}</li>)}</ul>
        <ul className="method">
          {o.baselines.map(b => (
            <li key={b.group}><b>{b.group}:</b> <a href={b.url} target="_blank" rel="noreferrer">{b.source} <ExternalLink size={11} /></a></li>
          ))}
          {o.mills.buyers.map(m => (
            <li key={m.name}><b>{m.name}</b> ({tonnes(m.metalUseTonnesPerMonth)} a month; {tonnes(m.matchedTonnesPerMonth)} from ResourceX this month): <a href={m.url} target="_blank" rel="noreferrer">{m.source} <ExternalLink size={11} /></a></li>
          ))}
        </ul>
        <h3 className="sub">This month</h3>
        <ul className="method">{data.assumptions.map(a => <li key={a}>{a}</li>)}</ul>
        {data.factors.length > 0 && (
          <table className="data-table factors">
            <thead><tr><th>Material</th><th className="num">t CO₂e saved per t</th><th>Source</th></tr></thead>
            <tbody>
              {data.factors.map(f => (
                <tr key={f.material}>
                  <td>{MATERIALS[f.material].label}</td>
                  <td className="num">{f.tco2ePerT}</td>
                  <td>{f.url ? <a href={f.url} target="_blank" rel="noreferrer">{f.source} <ExternalLink size={11} /></a> : f.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h3 className="sub">Context: all materials, whole world</h3>
        <p className="source">COP31's 15% goal covers every material the world uses (sand, fuels, food, metals…), currently {data.circularity.globalRatePct}% ({data.circularity.globalSource}). It is not used in the numbers above, which are for this dataset's metals only.</p>
        <CircularityChart />
      </div>
    </details>
  );
}
