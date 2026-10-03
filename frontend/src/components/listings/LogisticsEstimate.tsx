import { useState } from 'react';
import { Truck as TruckIcon } from 'lucide-react';
import type { Listing } from '../../api/types';
import { aud, co2e, fmtInt } from '../../lib/format';
import { FEE_PER_TRIP, KG_CO2E_PER_TKM, TRUCKS, TRUCK_KEYS, cheapestFreight, estimateFreight, type TruckKey } from '../../lib/logistics';

interface Props {
  listing: Listing;
  distanceKm: number;
  defaultTonnes: number;
}

/** Interactive freight estimate between your site and a listing, with landed cost per tonne. */
export function LogisticsEstimate({ listing: l, distanceKm, defaultTonnes }: Props) {
  const [tonnes, setTonnes] = useState(defaultTonnes);
  const [truck, setTruck] = useState<TruckKey | 'auto'>('auto');
  const [emptyReturn, setEmptyReturn] = useState(true);

  const est = truck === 'auto' ? cheapestFreight(tonnes, distanceKm, emptyReturn) : estimateFreight(tonnes, distanceKm, truck, emptyReturn);
  const landed = l.priceAud + est.perTonne;
  const pctOfPrice = l.priceAud ? (est.perTonne / l.priceAud) * 100 : 0;
  const vsVirgin = l.virginPriceAud ? Math.round((1 - landed / l.virginPriceAud) * 100) : null;

  return (
    <section className="panel">
      <h2 className="with-icon"><TruckIcon size={16} />Logistics cost estimate</h2>
      <div className="form-row three">
        <label className="field">Tonnes per month
          <input id="lg-tonnes" type="number" min={1} value={tonnes} onChange={e => setTonnes(Math.max(0, Number(e.target.value)))} />
        </label>
        <label className="field">Truck
          <select id="lg-truck" value={truck} onChange={e => setTruck(e.target.value as TruckKey | 'auto')}>
            <option value="auto">Cheapest ({TRUCKS[cheapestFreight(tonnes, distanceKm, emptyReturn).truck].label})</option>
            {TRUCK_KEYS.map(k => <option key={k} value={k}>{TRUCKS[k].label} · {TRUCKS[k].payloadT} t</option>)}
          </select>
        </label>
        <label className="field">Return leg
          <select id="lg-return" value={emptyReturn ? 'empty' : 'backload'} onChange={e => setEmptyReturn(e.target.value === 'empty')}>
            <option value="empty">Returns empty</option>
            <option value="backload">Backload found</option>
          </select>
        </label>
      </div>

      <dl className="stat-grid">
        <div><dt>Road distance</dt><dd className="num">{fmtInt(distanceKm)} km</dd></div>
        <div><dt>Trips per month</dt><dd className="num">{est.trips}</dd></div>
        <div><dt>Freight per month</dt><dd className="num">{aud(est.cost)}</dd></div>
        <div><dt>Freight per tonne</dt><dd className="num">{aud(est.perTonne)}<small>{pctOfPrice.toFixed(1)}% of price</small></dd></div>
      </dl>

      <div className="landed">
        <div>
          <span>Landed cost at your site</span>
          <b className="num">{aud(landed)}/t</b>
        </div>
        <div className="landed-split">
          <span className="num">{aud(l.priceAud)} material</span> + <span className="num">{aud(est.perTonne)} freight</span>
          {vsVirgin != null && <> · <span className={vsVirgin >= 0 ? 'good' : 'bad'}>{vsVirgin >= 0 ? `${vsVirgin}% below` : `${-vsVirgin}% above`} virgin</span></>}
        </div>
        <div className="landed-split">Freight emissions ≈ <span className="num">{co2e(est.co2eT)}</span> CO₂e/month</div>
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        Assumptions: {TRUCK_KEYS.map(k => `${TRUCKS[k].label} A$${TRUCKS[k].ratePerKm.toFixed(2)}/km`).join(', ')}; A${FEE_PER_TRIP} per trip for loading and weighbridge;
        road distance = straight line × 1.25; {KG_CO2E_PER_TKM} kg CO₂e per tonne-km. Indicative only, not a carrier quote.
      </p>
    </section>
  );
}
