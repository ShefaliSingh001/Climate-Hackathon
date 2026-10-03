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

const CARTO_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

// Free tile sources, no API key needed. Add Mapbox/Google here later as another entry.
export const LAYERS: Record<MapLayerKey, LayerDef> = {
  map: {
    label: 'Map',
    base: { url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', attribution: CARTO_ATTR, maxZoom: 19, subdomains: 'abcd' },
    swatch: { water: '#C6DCE8', land: '#F3F5F1' },
  },
  satellite: {
    label: 'Satellite',
    base: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
      maxZoom: 19,
    },
    overlay: { url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', attribution: CARTO_ATTR, maxZoom: 19, subdomains: 'abcd' },
    swatch: { water: '#14273B', land: '#3E4A33' },
  },
  terrain: {
    label: 'Terrain',
    base: {
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attribution: 'Map data &copy; OpenStreetMap contributors, SRTM | Style &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
      maxZoom: 17,
      subdomains: 'abc',
    },
    swatch: { water: '#AFCFDF', land: '#DCE5CC' },
  },
  dark: {
    label: 'Dark',
    base: { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: CARTO_ATTR, maxZoom: 19, subdomains: 'abcd' },
    swatch: { water: '#0F1A20', land: '#1E2925' },
  },
};

export const LAYER_KEYS = Object.keys(LAYERS) as MapLayerKey[];
