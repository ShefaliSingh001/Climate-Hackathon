import { useCallback, useEffect, useState } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { Loader2, Navigation, Route as RouteIcon, TriangleAlert } from 'lucide-react';
import type { Listing, Site } from '../../api/types';
import { useRoute } from '../../hooks/useRoute';
import { MATERIALS } from '../../lib/materials';
import { driveTime, fmtInt } from '../../lib/format';
import { useSettings } from '../../state/settings';
import { LAYERS } from './layers';

const youIcon = L.divIcon({ className: '', html: '<div class="you-dot pulse"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
const pin = (l: Listing) => L.divIcon({
  className: '',
  html: `<div class="pin route-end${l.kind === 'demand' ? ' square' : ''}" style="--c:${MATERIALS[l.material].color}">${MATERIALS[l.material].code}</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

// Dash maths uses a normalised path length, so the draw-in and pulse look the same at every zoom.
const PATH_LENGTH = '1000';

type RouteInfo = { status: 'loading' | 'ok' | 'failed'; km?: number; min?: number };

function FitAll({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map(p => p.join()).join('|');
  useEffect(() => {
    map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 11 });
  }, [map, key]);
  return null;
}

/**
 * One partner's road route: halo, casing, the line itself (drawn in on arrival) and a small pulse
 * that runs from the supplier to your site. While loading, or if routing fails, a dashed straight line stands in.
 */
function RouteLine({ site, listing, onlyOne, onInfo }: { site: Site; listing: Listing; onlyOne: boolean; onInfo: (id: string, info: RouteInfo) => void }) {
  const { route, status } = useRoute(site, listing);
  const map = useMap();
  const color = onlyOne ? '#8BC34A' : MATERIALS[listing.material].color;

  useEffect(() => {
    onInfo(listing.id, { status, km: route?.distanceKm, min: route?.durationMin });
  }, [status, route, listing.id, onInfo]);

  useEffect(() => {
    if (!route) return;
    // Child polylines are on the map by now (their effects run first).
    map.getContainer().querySelectorAll('path.route-anim').forEach(p => p.setAttribute('pathLength', PATH_LENGTH));
    // Roads can bulge outside the straight-line box, so refit once a single route arrives.
    if (onlyOne) map.fitBounds(L.latLngBounds(route.coords), { padding: [48, 48], maxZoom: 12 });
  }, [route, onlyOne, map]);

  if (!route) {
    return (
      <Polyline key={status} className={status === 'loading' ? 'route-waiting' : ''}
        positions={[[site.lat, site.lng], [listing.lat, listing.lng]]}
        pathOptions={{ color: '#7C8D84', weight: 2.5, dashArray: '1 8', lineCap: 'round', opacity: status === 'failed' ? 0.9 : 0.5 }}
      />
    );
  }

  // OSRM returns site → supplier; reverse so the pulse travels supplier → site.
  const coords = [...route.coords].reverse();
  return (
    <>
      <Polyline className="route-anim route-halo" positions={coords} interactive={false} pathOptions={{ color, weight: 14, opacity: 0.18, lineCap: 'round', lineJoin: 'round' }} />
      <Polyline className="route-anim route-draw" positions={coords} interactive={false} pathOptions={{ color: '#10251A', weight: 7.5, opacity: 0.55, lineCap: 'round', lineJoin: 'round' }} />
      <Polyline className="route-anim route-draw" positions={coords} pathOptions={{ color, weight: 4.5, opacity: 1, lineCap: 'round', lineJoin: 'round' }}>
        <Tooltip className="tip" sticky>
          <b>{listing.company}</b>{fmtInt(route.distanceKm)} km by road · {driveTime(route.durationMin)}
        </Tooltip>
      </Polyline>
      <Polyline className="route-anim route-pulse" positions={coords} interactive={false} pathOptions={{ color: '#F4FBE8', weight: 4.5, opacity: 1, lineCap: 'round' }} />
    </>
  );
}

function RouteChip({ info, count }: { info: Record<string, RouteInfo>; count: number }) {
  const all = Object.values(info);
  if (!all.length) return null;
  if (all.some(i => i.status === 'loading')) {
    return <div className="route-chip"><Loader2 size={14} className="spin" />Finding the road route…</div>;
  }
  const ok = all.filter(i => i.status === 'ok');
  if (!ok.length) {
    return <div className="route-chip muted"><TriangleAlert size={14} />Road route unavailable, showing a direct line</div>;
  }
  if (count === 1) {
    const r = ok[0];
    return <div className="route-chip"><RouteIcon size={14} /><b>{fmtInt(r.km!)} km</b><span>{driveTime(r.min!)} by road</span></div>;
  }
  const km = ok.reduce((s, r) => s + (r.km ?? 0), 0);
  return <div className="route-chip"><RouteIcon size={14} /><b>{count} routes</b><span>{fmtInt(km)} km in total</span></div>;
}

/** Your site plus one or more partners, joined by animated driving routes. */
export function RouteMap({ site, listings, height = 280 }: { site: Site; listings: Listing[]; height?: number }) {
  const home: [number, number] = [site.lat, site.lng];
  const points = [home, ...listings.map(l => [l.lat, l.lng] as [number, number])];
  const def = LAYERS[useSettings(s => s.mapLayer)];
  const [info, setInfo] = useState<Record<string, RouteInfo>>({});
  const onInfo = useCallback((id: string, i: RouteInfo) => setInfo(prev => ({ ...prev, [id]: i })), []);
  const ids = listings.map(l => l.id).join();
  const shown = Object.fromEntries(Object.entries(info).filter(([id]) => ids.split(',').includes(id)));

  return (
    <div className="route-map" style={{ height }}>
      <MapContainer center={home} zoom={8} style={{ height: '100%' }} zoomControl scrollWheelZoom={false} attributionControl={false}>
        <TileLayer url={def.base.url} maxZoom={def.base.maxZoom} subdomains={def.base.subdomains ?? 'abc'} />
        {def.overlay && <TileLayer url={def.overlay.url} maxZoom={def.overlay.maxZoom} />}
        {listings.map(l => <RouteLine key={`route-${l.id}`} site={site} listing={l} onlyOne={listings.length === 1} onInfo={onInfo} />)}
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
      <RouteChip info={shown} count={listings.length} />
      {listings.length > 0 && <div className="route-legend" aria-hidden="true"><Navigation size={11} />Pulse shows delivery direction</div>}
    </div>
  );
}
