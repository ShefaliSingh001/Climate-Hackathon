import { useEffect, useMemo, type CSSProperties, type ReactNode } from 'react';
import L from 'leaflet';
import { Circle, GeoJSON, MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet';
import type { Feature, FeatureCollection } from 'geojson';
import { Crosshair, MapPin, Minus, Plus } from 'lucide-react';
import auStates from '../../data/au-states.json';
import type { ListingView } from '../../hooks/useListings';
import { MATERIALS } from '../../lib/materials';
import { HOME_SITE, regionByCode } from '../../lib/regions';
import { ROAD_FACTOR } from '../../lib/geo';
import { aud, fmtInt, per } from '../../lib/format';
import { useMarket } from '../../state/store';
import { LAYERS } from './layers';
import { LayerSwitcher } from './LayerSwitcher';

interface Props {
  listings: ListingView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Rendered over the map, e.g. the listing drawer. */
  children?: ReactNode;
}

const youIcon = L.divIcon({ className: '', html: '<div class="you-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });

function pinIcon(l: ListingView, state: 'hover' | 'selected' | '') {
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

/** Pans so the selected pin is visible beside the drawer. */
function FollowSelection({ listing }: { listing: ListingView | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (!listing) return;
    const zoom = Math.max(map.getZoom(), 8);
    const shift = window.innerWidth > 820 ? 210 : 0;
    const p = map.project([listing.lat, listing.lng], zoom).add([shift, 0]);
    map.flyTo(map.unproject(p, zoom), zoom, { duration: 0.5 });
  }, [map, listing]);
  return null;
}

export function MarketMap({ listings, selectedId, onSelect, children }: Props) {
  const { layer, hoveredId, region, radiusKm, mode, set } = useMarket();
  const def = LAYERS[layer];
  const selected = listings.find(l => l.id === selectedId);

  const usedMaterials = useMemo(() => [...new Set(listings.map(l => l.material))], [listings]);

  const stateStyle = (f?: Feature) => {
    const active = region !== 'AU' && f?.properties?.code === region;
    return {
      color: layer === 'satellite' || layer === 'dark' ? '#8FE0B5' : '#1F6B4F',
      weight: active ? 2 : 0,
      dashArray: '6 4',
      fillColor: '#2FA36B',
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
        <TileLayer key={layer} url={def.base.url} attribution={def.base.attribution} maxZoom={def.base.maxZoom} subdomains={def.base.subdomains ?? 'abc'} />
        {def.overlay && (
          <TileLayer key={`${layer}-labels`} url={def.overlay.url} attribution={def.overlay.attribution} maxZoom={def.overlay.maxZoom} subdomains={def.overlay.subdomains ?? 'abc'} />
        )}
        <GeoJSON key={`${region}-${layer}`} data={auStates as FeatureCollection} style={stateStyle} />
        {radiusKm > 0 && (
          <Circle
            center={[HOME_SITE.lat, HOME_SITE.lng]}
            radius={(radiusKm / ROAD_FACTOR) * 1000}
            pathOptions={{ color: '#1F6B4F', weight: 1.5, dashArray: '4 4', fillColor: '#2FA36B', fillOpacity: 0.06, interactive: false }}
          />
        )}
        <Marker position={[HOME_SITE.lat, HOME_SITE.lng]} icon={youIcon} zIndexOffset={2000}>
          <Tooltip className="tip" direction="top" offset={[0, -10]}><b>Your site</b>{HOME_SITE.name}, {HOME_SITE.suburb}</Tooltip>
        </Marker>
        {listings.map(l => {
          const state = selectedId === l.id ? 'selected' : hoveredId === l.id ? 'hover' : '';
          return (
            <Marker
              key={l.id}
              position={[l.lat, l.lng]}
              icon={pinIcon(l, state)}
              zIndexOffset={state ? 1000 : 0}
              title={l.company}
              eventHandlers={{
                click: () => onSelect(l.id),
                mouseover: () => set({ hoveredId: l.id }),
                mouseout: () => set({ hoveredId: null }),
              }}
            >
              <Tooltip className="tip" direction="top" offset={[0, -16]}>
                <b>{l.company}</b>
                {MATERIALS[l.material].label} · {fmtInt(l.tonnes)} t/{per(l.frequency)} · {aud(l.priceAud)}/t
              </Tooltip>
            </Marker>
          );
        })}
        <MapControls />
        <FollowSelection listing={selected} />
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
      {children}
    </section>
  );
}
