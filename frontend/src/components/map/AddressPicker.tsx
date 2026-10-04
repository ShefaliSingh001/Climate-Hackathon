import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { Loader2, MapPin, MousePointerClick, Search, TriangleAlert } from 'lucide-react';
import type { StateCode } from '../../api/types';
import { geocode, type GeoResult } from '../../lib/geocode';
import { REGIONS } from '../../lib/regions';
import { prefersReducedMotion, useSettings } from '../../state/settings';
import { Select } from '../ui/Select';
import { LAYERS } from './layers';

export interface SiteAddress {
  address: string;
  suburb: string;
  state: StateCode;
  postcode: string;
  lat: number;
  lng: number;
}

const STATES = REGIONS.filter(r => r.code !== 'AU').map(r => r.code as StateCode);
const pinIcon = L.divIcon({ className: '', html: '<div class="pick-pin"><span></span></div>', iconSize: [26, 26], iconAnchor: [13, 31] });

/** Moves the map to the pin whenever it changes from outside (a search result). */
function FollowPin({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const map = useMap();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (prefersReducedMotion()) map.setView([lat, lng], zoom);
    else map.flyTo([lat, lng], zoom, { duration: 0.8 });
  }, [lat, lng, zoom, map]);
  return null;
}

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: e => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

type Status = { kind: 'idle' } | { kind: 'searching' } | { kind: 'found'; label: string } | { kind: 'none' } | { kind: 'manual' };

interface Props {
  value: SiteAddress;
  onChange: (patch: Partial<SiteAddress>) => void;
  /** e.g. "Yard address" or "Delivery address". */
  label?: string;
  suburbError?: string;
  idPrefix?: string;
  mapHeight?: number;
}

/**
 * Address fields plus a map. Typing an address (or changing suburb or state) searches for it and moves
 * the pin automatically; suggestions can be picked, and the pin can be dragged or the map clicked to fine-tune.
 */
export function AddressPicker({ value, onChange, label = 'Street address', suburbError, idPrefix = 'addr', mapHeight = 260 }: Props) {
  const listId = useId();
  const [results, setResults] = useState<GeoResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [zoom, setZoom] = useState(value.address ? 15 : 11);
  const layer = LAYERS[useSettings(s => s.mapLayer)];
  const query = [value.address, value.suburb, value.state, value.postcode].filter(Boolean).join(', ');
  // The query the pin already matches: the saved address on load, or the result just applied.
  // Searching only starts when the fields change from that.
  const skip = useRef<string | null>(query);

  useEffect(() => {
    if (skip.current === query) return;
    if (!value.address.trim() && !value.suburb.trim()) { setResults([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setStatus({ kind: 'searching' });
      try {
        const found = await geocode(query, ctrl.signal);
        setResults(found);
        const best = found[0];
        if (!best) { setStatus({ kind: 'none' }); return; }
        // Auto-update the map with the best match; fill in suburb, state and postcode the user hasn't typed.
        setZoom(best.street ? 16 : 13);
        const fill: Partial<SiteAddress> = {
          ...(!value.suburb && best.suburb ? { suburb: best.suburb } : {}),
          ...(best.state && !value.suburb ? { state: best.state } : {}),
          ...(!value.postcode && best.postcode ? { postcode: best.postcode } : {}),
        };
        const next = { ...value, ...fill };
        skip.current = [next.address, next.suburb, next.state, next.postcode].filter(Boolean).join(', ');
        onChange({ lat: best.lat, lng: best.lng, ...fill });
        setStatus({ kind: 'found', label: best.label });
      } catch { /* aborted by a newer keystroke */ }
    }, 500);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);

  function pick(r: GeoResult) {
    const next = {
      address: r.street || value.address, suburb: r.suburb || value.suburb, state: r.state ?? value.state,
      postcode: r.postcode || value.postcode, lat: r.lat, lng: r.lng,
    };
    skip.current = [next.address, next.suburb, next.state, next.postcode].filter(Boolean).join(', ');
    setZoom(r.street ? 16 : 13);
    onChange(next);
    setStatus({ kind: 'found', label: r.label });
    setOpen(false);
  }

  const placeByHand = (lat: number, lng: number) => { onChange({ lat, lng }); setStatus({ kind: 'manual' }); };

  function onKey(e: KeyboardEvent) {
    if (!open || !results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(results.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[active]); }
    else if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div className="address-picker">
      <div className="field ap-search">
        <label htmlFor={`${idPrefix}-street`}>{label}</label>
        <div className="ap-input">
          <Search size={15} aria-hidden="true" />
          <input
            id={`${idPrefix}-street`}
            role="combobox"
            aria-expanded={open && results.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && results.length ? `${listId}-${active}` : undefined}
            autoComplete="off"
            placeholder="Start typing, e.g. 12 Old Punt Road, Tomago"
            value={value.address}
            onChange={e => { onChange({ address: e.target.value }); setOpen(true); setActive(0); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={onKey}
          />
          {status.kind === 'searching' && <Loader2 size={15} className="spin" aria-hidden="true" />}
        </div>
        {open && results.length > 0 && value.address.trim().length >= 3 && (
          <ul id={listId} role="listbox" className="sel-list ap-list">
            {results.map((r, i) => (
              <li key={`${r.lat},${r.lng},${i}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}
                className={`sel-opt ${i === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(i)} onMouseDown={e => e.preventDefault()} onClick={() => pick(r)}>
                <MapPin size={14} className="ap-ic" />
                <span className="sel-opt-text"><span>{r.street || r.suburb || r.label}</span><small>{r.label}</small></span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="form-row three">
        <label className="field">Suburb
          <input id={`${idPrefix}-suburb`} value={value.suburb} onChange={e => onChange({ suburb: e.target.value })} aria-invalid={!!suburbError} />
          {suburbError && <span className="err">{suburbError}</span>}
        </label>
        <div className="field"><label htmlFor={`${idPrefix}-state`}>State</label>
          <Select<StateCode> id={`${idPrefix}-state`} value={value.state} onChange={st => onChange({ state: st })} options={STATES.map(st => ({ value: st, label: st }))} />
        </div>
        <label className="field">Postcode
          <input id={`${idPrefix}-postcode`} inputMode="numeric" maxLength={4} value={value.postcode} onChange={e => onChange({ postcode: e.target.value.replace(/\D/g, '') })} />
        </label>
      </div>
      <div className="picker-map" style={{ height: mapHeight }}>
        <MapContainer center={[value.lat, value.lng]} zoom={zoom} style={{ height: '100%' }} attributionControl={false} scrollWheelZoom={false}>
          <TileLayer url={layer.base.url} maxZoom={layer.base.maxZoom} subdomains={layer.base.subdomains ?? 'abc'} />
          {layer.overlay && <TileLayer url={layer.overlay.url} maxZoom={layer.overlay.maxZoom} />}
          <Marker position={[value.lat, value.lng]} icon={pinIcon} draggable
            eventHandlers={{ dragend: e => { const p = (e.target as L.Marker).getLatLng(); placeByHand(p.lat, p.lng); } }} />
          <ClickToPlace onPick={placeByHand} />
          <FollowPin lat={value.lat} lng={value.lng} zoom={zoom} />
        </MapContainer>
      </div>
      <p className={`hint ap-status ${status.kind}`} role="status">
        {status.kind === 'searching' && <><Loader2 size={13} className="spin" />Finding the address…</>}
        {status.kind === 'found' && <><MapPin size={13} />Pin placed at {status.label}. Drag it or click the map to fine-tune.</>}
        {status.kind === 'none' && <><TriangleAlert size={13} />No match for that address. Check the spelling, or click the map to place the pin.</>}
        {status.kind === 'manual' && <><MousePointerClick size={13} />Pin placed by hand.</>}
        {status.kind === 'idle' && <><MapPin size={13} />Type the address and the map follows. You can also drag the pin.</>}
        <span className="num ap-coords">{value.lat.toFixed(4)}, {value.lng.toFixed(4)}</span>
      </p>
    </div>
  );
}
