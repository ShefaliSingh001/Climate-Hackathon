import { useRef, useState, type MouseEvent } from 'react';

// Global circular material-use rate, by Circularity Gap Report edition (Circle Economy).
const POINTS: [number, number][] = [[2018, 9.1], [2020, 8.6], [2023, 7.2], [2025, 6.9]];
const GOAL: [number, number] = [2035, 15];

const W = 640, H = 280;
const P = { l: 40, r: 56, t: 16, b: 30 };
const x = (year: number) => P.l + ((year - 2018) / (2035 - 2018)) * (W - P.l - P.r);
const y = (v: number) => P.t + (1 - v / 16) * (H - P.t - P.b);
const mono = 'IBM Plex Mono, monospace';

/** Single-series line of the global circularity rate with the dashed path to the COP31 goal. */
export function CircularityChart() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const last = POINTS[POINTS.length - 1];
  const line = POINTS.map((p, i) => `${i ? 'L' : 'M'}${x(p[0])},${y(p[1])}`).join('');
  const area = `${line}L${x(last[0])},${y(0)}L${x(POINTS[0][0])},${y(0)}Z`;
  const all = [...POINTS, GOAL];

  const onMove = (e: MouseEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const sx = ((e.clientX - r.left) * W) / r.width;
    setHover(all.reduce((a, b) => (Math.abs(x(b[0]) - sx) < Math.abs(x(a[0]) - sx) ? b : a)));
  };

  const rect = svgRef.current?.getBoundingClientRect();
  const scale = rect ? rect.width / W : 1;

  return (
    <div className="chart-wrap">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Global circular material-use rate fell from 9.1% in 2018 to 6.9% in 2025. The COP31 goal is 15% by 2035.">
        {[0, 5, 10, 15].map(v => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="var(--line)" />
            <text x={P.l - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--ink-3)" fontFamily={mono}>{v}%</text>
          </g>
        ))}
        {[2018, 2020, 2025, 2030, 2035].map(t => (
          <text key={t} x={x(t)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--ink-3)" fontFamily={mono}>{t}</text>
        ))}
        <path d={area} fill="var(--accent)" fillOpacity={0.12} />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
        <path d={`M${x(last[0])},${y(last[1])}L${x(GOAL[0])},${y(GOAL[1])}`} fill="none" stroke="var(--ink-2)" strokeWidth={1.5} strokeDasharray="5 4" />
        <circle cx={x(GOAL[0])} cy={y(GOAL[1])} r={5} fill="var(--surface)" stroke="var(--ink)" strokeWidth={2} />
        <text x={x(GOAL[0]) - 8} y={y(GOAL[1]) - 10} textAnchor="end" fontSize={12} fontWeight={600} fill="var(--ink)">COP31 goal 15%</text>
        {POINTS.map(p => (
          <circle key={p[0]} cx={x(p[0])} cy={y(p[1])} r={p === last ? 5 : 3.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
        ))}
        <text x={x(last[0]) + 8} y={y(last[1]) + 18} fontSize={12} fill="var(--ink)"><tspan fontWeight={600}>6.9%</tspan> today</text>
        {hover && <line x1={x(hover[0])} x2={x(hover[0])} y1={y(16)} y2={y(0)} stroke="var(--ink-3)" opacity={0.6} />}
        <rect x={P.l} y={P.t} width={W - P.l - P.r + 20} height={H - P.t - P.b} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {hover && (
        <div className="ctip" style={{ left: x(hover[0]) * scale, top: y(hover[1]) * scale - 6 }}>
          {hover[0] === GOAL[0] ? <>2035 goal · <b>15%</b></> : <>{hover[0]} report · <b>{hover[1]}%</b></>}
        </div>
      )}
    </div>
  );
}
