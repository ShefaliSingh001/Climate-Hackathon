import { useEffect, useMemo, type CSSProperties } from 'react';
import L from 'leaflet';
import { Circle, GeoJSON, MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet';
import type { Feature, FeatureCollection } from 'geojson';
import { Crosshair, MapPin, Minus, Plus } from 'lucide-react';
import auStates from '../../data/au-states.json';
import type { ListingView } from '../../hooks/useListings';
import { MATERIALS } from '../../lib/materials';
import { regionByCode } from '../../lib/regions';
import { useSite } from '../../auth/AuthProvider';
import { ROAD_FACTOR } from '../../lib/geo';
import { aud, volume } from '../../lib/format';
import type { Ranking } from '../../lib/ranking';
import { useMarket } from '../../state/store';
import { LAYERS } from './layers';
import { LayerSwitcher } from './LayerSwitcher';

interface Props {
  listings: ListingView[];
  onOpen: (id: string) => void;
  rankings?: Map<string, Ranking>;
}

const youIcon = L.divIcon({ className: '', html: '<div class="you-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });

function pinIcon(l: ListingView, state: 'hover' | '') {
  const m = MATERIALS[l.material];
  return L.divIcon({
    className: '',
    html: `<div class="pin${l.kind === 'demand' ? ' square' : ''} ${state}" style="--c:${m.color}">${m.code}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

/** Re-fits the map when the region changes, and exposes zoom/locate buttons. */
function MapControls() {
  const map = useMap();
  const HOME_SITE = useSite();
  const region = useMarket(s => s.region);
  const fitToken = useMarket(s => s.fitToken);

  useEffect(() => {
    map.flyToBounds(regionByCode(region).bounds, { padding: [24, 24], duration: 0.6 });
  }, [map, region, fitToken]);

  return (
    <div className="map-chrome zoom">
      <div className="ctrl-group">
        <button onClick={() => map.flyTo([HOME_SITE.lat, HOME_SITE.lng], 10, { duration: 0.6 })} aria-label="Centre on my site" title="Centre on my site"><Crosshair size={16} /></button>
      </div>
      <div className="ctrl-group">
        <button onClick={() => map.zoomIn()} aria-label="Zoom in"><Plus size={16} /></button>
        <button onClick={() => map.zoomOut()} aria-label="Zoom out"><Minus size={16} /></button>
      </div>
    </div>
  );
}

export function MarketMap({ listings, onOpen, rankings }: Props) {
  const HOME_SITE = useSite();
  const { layer, hoveredId, region, radiusKm, mode, set } = useMarket();
  const def = LAYERS[layer];

  const usedMaterials = useMemo(() => [...new Set(listings.map(l => l.material))], [listings]);

  const stateStyle = (f?: Feature) => {
    const active = region !== 'AU' && f?.properties?.code === region;
    return {
      color: layer === 'satellite' || layer === 'dark' ? '#A8CF6A' : '#4F7A26',
      weight: active ? 2 : 0,
      dashArray: '6 4',
      fillColor: '#7FAE45',
      fillOpacity: active ? 0.05 : 0,
      interactive: false,
    };
  };

  return (
    <section className="map-wrap" aria-label="Map">
      <MapContainer
        className={`map layer-${layer}`}
        bounds={regionByCode('NSW').bounds}
        zoomControl={false}
        minZoom={4}
        maxBounds={[[-50, 100], [0, 170]]}
        worldCopyJump={false}
      >
        <TileLayer key={layer} url={def.base.url} attribution={def.base.attribution} maxZoom={def.base.maxZoom} subdomains={def.base.subdomains ?? ''} />
        {def.overlay && (
          <TileLayer key={`${layer}-labels`} url={def.overlay.url} attribution={def.overlay.attribution} maxZoom={def.overlay.maxZoom} subdomains={def.overlay.subdomains ?? ''} />
        )}
        <GeoJSON key={`${region}-${layer}`} data={auStates as FeatureCollection} style={stateStyle} />
        {radiusKm > 0 && (
          <Circle
            center={[HOME_SITE.lat, HOME_SITE.lng]}
            radius={(radiusKm / ROAD_FACTOR) * 1000}
            pathOptions={{ color: '#4F7A26', weight: 1.5, dashArray: '4 4', fillColor: '#7FAE45', fillOpacity: 0.06, interactive: false }}
          />
        )}
        <Marker position={[HOME_SITE.lat, HOME_SITE.lng]} icon={youIcon} zIndexOffset={2000}>
          <Tooltip className="tip" direction="top" offset={[0, -10]}><b>Your site</b>{HOME_SITE.name}, {HOME_SITE.suburb}</Tooltip>
        </Marker>
        {listings.map(l => {
          const state = hoveredId === l.id ? 'hover' : '';
          return (
            <Marker
              key={l.id}
              position={[l.lat, l.lng]}
              icon={pinIcon(l, state)}
              zIndexOffset={state ? 1000 : 0}
              title={l.company}
              eventHandlers={{
                click: () => onOpen(l.id),
                mouseover: () => set({ hoveredId: l.id }),
                mouseout: () => set({ hoveredId: null }),
              }}
            >
              <Tooltip className="tip" direction="top" offset={[0, -16]}>
                <b>{l.company}</b>
                {rankings?.get(l.id) && <span className="tip-rank">Ranked #{rankings.get(l.id)!.position} of {rankings.get(l.id)!.of}</span>}
                {MATERIALS[l.material].label} · {volume(l.tonnes, l.frequency)} · {aud(l.priceAud)} per tonne
              </Tooltip>
            </Marker>
          );
        })}
        <MapControls />
      </MapContainer>

      <div className="map-chrome map-top">
        <span className="pill"><MapPin size={15} />{listings.length} {mode === 'supply' ? 'suppliers' : 'buyers'} in {region === 'AU' ? 'Australia' : region}</span>
        {usedMaterials.length > 0 && (
          <div className="legend">
            {usedMaterials.map(k => (
              <div key={k}><span className="dot" style={{ '--c': MATERIALS[k].color } as CSSProperties} />{MATERIALS[k].label}</div>
            ))}
            <div className="sep"><span className={`key${mode === 'demand' ? ' square' : ''}`} />{mode === 'supply' ? 'Supply listing' : 'Buyer request'}</div>
          </div>
        )}
      </div>
      <LayerSwitcher />
    </section>
  );
}
