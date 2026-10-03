import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import type { Listing, Site } from '../../api/types';
import { useRoute } from '../../hooks/useRoute';
import { MATERIALS } from '../../lib/materials';
import { driveTime, fmtInt } from '../../lib/format';
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
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 11 });
  }, [map, key]);
  return null;
}

/** One partner's road route. While loading, or if routing fails, a faint dashed straight line stands in. */
function RouteLine({ site, listing, onlyOne }: { site: Site; listing: Listing; onlyOne: boolean }) {
  const { route, status } = useRoute(site, listing);
  const map = useMap();
  const color = onlyOne ? '#7FAE45' : MATERIALS[listing.material].color;

  // Roads can bulge outside the straight-line box, so refit once a single route arrives.
  useEffect(() => {
    if (route && onlyOne) map.fitBounds(L.latLngBounds(route.coords), { padding: [40, 40], maxZoom: 12 });
  }, [route, onlyOne, map]);

  if (!route) {
    return <Polyline positions={[[site.lat, site.lng], [listing.lat, listing.lng]]} pathOptions={{ color: '#5B6B63', weight: 2, dashArray: '5 7', opacity: status === 'failed' ? 0.8 : 0.4 }} />;
  }
  return (
    <>
      <Polyline positions={route.coords} pathOptions={{ color: '#10251A', weight: 7, opacity: 0.35, lineCap: 'round', lineJoin: 'round' }} />
      <Polyline positions={route.coords} pathOptions={{ color, weight: 4, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }}>
        <Tooltip className="tip" sticky>
          <b>{listing.company}</b>{fmtInt(route.distanceKm)} km by road · {driveTime(route.durationMin)}
        </Tooltip>
      </Polyline>
    </>
  );
}

/** Your site plus one or more partners, joined by driving routes. */
export function RouteMap({ site, listings, height = 280 }: { site: Site; listings: Listing[]; height?: number }) {
  const home: [number, number] = [site.lat, site.lng];
  const points = [home, ...listings.map(l => [l.lat, l.lng] as [number, number])];
  const def = LAYERS.map.base;

  return (
    <div className="route-map" style={{ height }}>
      <MapContainer center={home} zoom={8} style={{ height: '100%' }} zoomControl scrollWheelZoom={false} attributionControl={false}>
        <TileLayer url={def.url} maxZoom={def.maxZoom} />
        {listings.map(l => <RouteLine key={`route-${l.id}`} site={site} listing={l} onlyOne={listings.length === 1} />)}
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
