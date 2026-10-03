import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import type { Listing, Site } from '../../api/types';
import { MATERIALS } from '../../lib/materials';
import { LAYERS } from './layers';

const youIcon = L.divIcon({ className: '', html: '<div class="you-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
const pin = (l: Listing) => L.divIcon({
  className: '',
  html: `<div class="pin${l.kind === 'demand' ? ' square' : ''}" style="--c:${MATERIALS[l.material].color}">${MATERIALS[l.material].code}</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

function FitAll({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map(p => p.join()).join('|');
  useEffect(() => {
    map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 11 });
  }, [map, key]);
  return null;
}

/** Your site plus one or more partners, joined by straight dashed lines (road distance is estimated). */
export function RouteMap({ site, listings, height = 280 }: { site: Site; listings: Listing[]; height?: number }) {
  const home: [number, number] = [site.lat, site.lng];
  const points = [home, ...listings.map(l => [l.lat, l.lng] as [number, number])];
  const def = LAYERS.map.base;

  return (
    <div className="route-map" style={{ height }}>
      <MapContainer center={home} zoom={8} style={{ height: '100%' }} zoomControl scrollWheelZoom={false} attributionControl={false}>
        <TileLayer url={def.url} maxZoom={def.maxZoom} />
        {listings.map(l => (
          <Polyline key={`line-${l.id}`} positions={[home, [l.lat, l.lng]]} pathOptions={{ color: MATERIALS[l.material].color, weight: 2.5, dashArray: '6 6', opacity: 0.9 }} />
        ))}
        <Marker position={home} icon={youIcon} zIndexOffset={1000}>
          <Tooltip className="tip" direction="top" offset={[0, -10]}><b>Your site</b>{site.name}, {site.suburb}</Tooltip>
        </Marker>
        {listings.map(l => (
          <Marker key={l.id} position={[l.lat, l.lng]} icon={pin(l)}>
            <Tooltip className="tip" direction="top" offset={[0, -16]}><b>{l.company}</b>{l.suburb}, {l.state}</Tooltip>
          </Marker>
        ))}
        <FitAll points={points} />
      </MapContainer>
    </div>
  );
}
