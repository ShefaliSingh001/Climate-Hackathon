import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { MATERIALS } from '../lib/materials';
import { fmtInt } from '../lib/format';
import { CircularityChart } from '../components/ui/CircularityChart';

export function Impact() {
  const { data } = useAsync(() => api.getImpact(), []);
  const sample = data?.isSample ? <span className="sample">Sample</span> : null;
  const max = Math.max(1, ...(data?.byMaterial.map(b => b.tonnes) ?? [1]));

  const kpis = data ? [
    ['Tonnes recirculated', fmtInt(data.tonnesRecirculated), 'this quarter'],
    ['CO₂e avoided', `${fmtInt(data.co2eAvoidedT)} t`, 'vs virgin feedstock'],
    ['Active verified sites', fmtInt(data.activeVerifiedSites), 'across Australia'],
    ['Matches converted', fmtInt(data.matchesConverted), 'into supply contracts'],
  ] : [];

  return (
    <main className="page">
      <div className="page-inner">
        <div className="page-head">
          <h1>Circularity impact</h1>
          <p>Every tonne traded here replaces virgin feedstock. This view tracks what the network has recirculated and how it maps to the COP31 Green Industrialisation goal: a 15% global circular material-use rate by 2035.</p>
        </div>

        <dl className="kpis">
          {kpis.map(([label, value, note]) => (
            <div key={label} className="kpi"><dt>{label}{sample}</dt><dd>{value}<small>{note}</small></dd></div>
          ))}
        </dl>

        <div className="impact-grid">
          <section className="panel">
            <h2>Global circular material-use rate vs the 2035 goal</h2>
            <CircularityChart />
            <p className="source">Source: Circularity Gap Report (Circle Economy), by report year. Dashed line shows the path needed to reach 15% by 2035.</p>
          </section>
          <div className="stack">
            <section className="panel">
              <h2>Recirculated this quarter by material{sample}</h2>
              <div className="hbars">
                {data?.byMaterial.map(b => (
                  <div key={b.material} className="hbar">
                    <span>{MATERIALS[b.material].label}</span>
                    <div className="track"><div className="fill" style={{ width: `${Math.max(1.5, (b.tonnes / max) * 100)}%`, background: MATERIALS[b.material].color }} /></div>
                    <span className="num">{fmtInt(b.tonnes)} t</span>
                  </div>
                ))}
              </div>
            </section>
            <section className="panel">
              <h2>How we measure it</h2>
              <ul className="method">
                <li>Tonnes count only on confirmed delivery, checked against the waste transport record.</li>
                <li>CO₂e avoided = tonnes × the material's recycled-vs-primary emissions factor. The factor used is shown on each listing.</li>
                <li>Results roll up by state, so NSW progress can be read against the 80% average resource-recovery target in the National Waste Policy Action Plan.</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
