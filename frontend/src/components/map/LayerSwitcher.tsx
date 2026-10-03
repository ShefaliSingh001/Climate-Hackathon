import type { CSSProperties } from 'react';
import { Layers } from 'lucide-react';
import { useMarket } from '../../state/store';
import { LAYERS, LAYER_KEYS } from './layers';

const swatchStyle = (key: keyof typeof LAYERS) =>
  ({ '--sw-water': LAYERS[key].swatch.water, '--sw-land': LAYERS[key].swatch.land }) as CSSProperties;

/** Google-Maps-style switcher: the thumbnail flips between Map and Satellite; hover shows all layers. */
export function LayerSwitcher() {
  const layer = useMarket(s => s.layer);
  const set = useMarket(s => s.set);
  const next = layer === 'satellite' ? 'map' : 'satellite';

  return (
    <div className="map-chrome layers">
      <button className="layer-main" style={swatchStyle(next)} onClick={() => set({ layer: next })} aria-label={`Switch to ${LAYERS[next].label} view`}>
        <span className="sw-land" />
        <span className="label"><Layers size={13} />{LAYERS[next].label}</span>
      </button>
      <div className="layer-opts" role="group" aria-label="Map type">
        {LAYER_KEYS.map(k => (
          <button key={k} className="layer-opt" aria-pressed={k === layer} onClick={() => set({ layer: k })}>
            <i style={swatchStyle(k)}><span className="sw-land" /></i>
            {LAYERS[k].label}
          </button>
        ))}
      </div>
    </div>
  );
}
