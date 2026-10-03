import type { MapLayerKey } from '../../state/store';

interface TileDef {
  url: string;
  attribution: string;
  maxZoom: number;
  subdomains?: string;
}

export interface LayerDef {
  label: string;
  base: TileDef;
  /** Optional labels drawn on top (used for satellite imagery). */
  overlay?: TileDef;
  /** Colours for the switcher thumbnail. */
  swatch: { water: string; land: string };
}

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const esri = (service: string, attribution: string, maxZoom = 19): TileDef => ({
  url: `${ESRI}/${service}/MapServer/tile/{z}/{y}/{x}`,
  attribution,
  maxZoom,
});
const ESRI_ATTR = 'Tiles &copy; Esri';

// Keyless tile sources. CARTO (basemaps.cartocdn.com) started watermarking keyless tiles with
// "API KEY REQUIRED" in Aug 2026, so it is not used. To add a keyed provider (CARTO, Mapbox,
// MapTiler), read the key from an env var such as VITE_MAP_TILES_KEY and add an entry here.
export const LAYERS: Record<MapLayerKey, LayerDef> = {
  map: {
    label: 'Map',
    base: esri('World_Street_Map', `${ESRI_ATTR} &mdash; Esri, HERE, Garmin, USGS, NGA, EPA, NPS`),
    swatch: { water: '#C6DCE8', land: '#F3F5F1' },
  },
  satellite: {
    label: 'Satellite',
    base: esri('World_Imagery', `${ESRI_ATTR} &mdash; Esri, Maxar, Earthstar Geographics`),
    overlay: esri('Reference/World_Boundaries_and_Places', ESRI_ATTR),
    swatch: { water: '#14273B', land: '#3E4A33' },
  },
  terrain: {
    label: 'Terrain',
    base: {
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Style &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
      maxZoom: 17,
      subdomains: 'abc',
    },
    swatch: { water: '#AFCFDF', land: '#DCE5CC' },
  },
  dark: {
    label: 'Dark',
    base: esri('Canvas/World_Dark_Gray_Base', `${ESRI_ATTR} &mdash; Esri, HERE, Garmin, OpenStreetMap contributors`, 16),
    overlay: esri('Canvas/World_Dark_Gray_Reference', ESRI_ATTR, 16),
    swatch: { water: '#0F1A20', land: '#1E2925' },
  },
};

export const LAYER_KEYS = Object.keys(LAYERS) as MapLayerKey[];
