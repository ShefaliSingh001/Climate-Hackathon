import { useState } from 'react';
import { Truck as TruckIcon } from 'lucide-react';
import type { Listing } from '../../api/types';
import { PRICE_NOTE, aud, co2e, fmtInt } from '../../lib/format';
import { NumberField } from '../ui/NumberField';
import { Select } from '../ui/Select';
import { FEE_PER_TRIP, KG_CO2E_PER_TKM, TRUCKS, TRUCK_KEYS, cheapestFreight, estimateFreight, type TruckKey } from '../../lib/logistics';

interface Props {
  listing: Listing;
  distanceKm: number;
  defaultTonnes: number;
}

/** Interactive freight estimate between your site and a listing, with landed cost per tonne. */
export function LogisticsEstimate({ listing: l, distanceKm, defaultTonnes }: Props) {
  const [tonnesIn, setTonnesIn] = useState<number | null>(defaultTonnes);
  const tonnes = tonnesIn ?? 0;
  const [truck, setTruck] = useState<TruckKey | 'auto'>('auto');
  const [emptyReturn, setEmptyReturn] = useState(true);

  const est = truck === 'auto' ? cheapestFreight(tonnes, distanceKm, emptyReturn) : estimateFreight(tonnes, distanceKm, truck, emptyReturn);
  const landed = l.priceAud + est.perTonne;
  const pctOfPrice = l.priceAud ? (est.perTonne / l.priceAud) * 100 : 0;
  const vsNew = l.virginPriceAud ? Math.round((1 - landed / l.virginPriceAud) * 100) : null;

  return (
    <section className="panel">
      <h2 className="with-icon"><TruckIcon size={16} />Logistics cost estimate</h2>
      <div className="form-row three">
        <label className="field" htmlFor="lg-tonnes">Tonnes per month
          <NumberField id="lg-tonnes" min={1} value={tonnesIn} onChange={setTonnesIn} suffix="tonnes" />
        </label>
        <div className="field"><label htmlFor="lg-truck">Truck</label>
          <Select<TruckKey | 'auto'> id="lg-truck" value={truck} onChange={setTruck} options={[
            { value: 'auto', label: 'Cheapest option', hint: TRUCKS[cheapestFreight(tonnes, distanceKm, emptyReturn).truck].label },
            ...TRUCK_KEYS.map(k => ({ value: k, label: TRUCKS[k].label, hint: `Carries up to ${TRUCKS[k].payloadT} tonnes` })),
          ]} />
        </div>
        <div className="field"><label htmlFor="lg-return">Return trip</label>
          <Select id="lg-return" value={emptyReturn ? 'empty' : 'backload'} onChange={v => setEmptyReturn(v === 'empty')} options={[
            { value: 'empty', label: 'Truck returns empty' },
            { value: 'backload', label: 'Truck carries a load back', hint: 'Halves the distance charged' },
          ]} />
        </div>
      </div>

      <dl className="stat-grid">
        <div><dt>Road distance</dt><dd className="num">{fmtInt(distanceKm)} km</dd></div>
        <div><dt>Trips per month</dt><dd className="num">{est.trips}</dd></div>
        <div><dt>Freight per month</dt><dd className="num">{aud(est.cost)}</dd></div>
        <div><dt>Freight per tonne</dt><dd className="num">{aud(est.perTonne)}<small>{pctOfPrice.toFixed(1)}% of the material price</small></dd></div>
      </dl>

      <div className="landed">
        <div>
          <span>Delivered cost at your site</span>
          <b className="num">{aud(landed)} per tonne</b>
        </div>
        <div className="landed-split">
          <span className="num">{aud(l.priceAud)} material</span> + <span className="num">{aud(est.perTonne)} freight</span>
          {vsNew != null && <> · <span className={vsNew >= 0 ? 'good' : 'bad'}>{vsNew >= 0 ? `${vsNew}% cheaper` : `${-vsNew}% dearer`} than newly sourced</span></>}
        </div>
        <div className="landed-split">Truck emissions: about <span className="num">{co2e(est.co2eT)}</span> of <abbr title="carbon dioxide equivalent">CO₂e</abbr> per month</div>
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        How this is worked out: {TRUCK_KEYS.map(k => `${TRUCKS[k].label} $${TRUCKS[k].ratePerKm.toFixed(2)} per kilometre`).join(', ')}; ${FEE_PER_TRIP} per trip for loading and the weighbridge;
        distance follows the road route where available; {KG_CO2E_PER_TKM} kg of CO₂e per tonne carried per kilometre. An estimate, not a carrier quote. {PRICE_NOTE}
      </p>
    </section>
  );
}
