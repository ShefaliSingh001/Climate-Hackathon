import { create } from 'zustand';
import type { RegionCode } from '../lib/regions';
import type { MapLayerKey } from './store';

export type Theme = 'system' | 'light' | 'dark';
export type Motion = 'system' | 'reduced';

export interface Settings {
  theme: Theme;
  motion: Motion;
  mapLayer: MapLayerKey;
  region: RegionCode;
  radiusKm: number;
  notifications: { newMatches: boolean; enquiries: boolean; weeklySummary: boolean };
}

export const SETTINGS_KEY = 'resourcex.settings';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  motion: 'system',
  mapLayer: 'map',
  region: 'NSW',
  radiusKm: 0,
  notifications: { newMatches: true, enquiries: true, weeklySummary: false },
};

function load(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...saved, notifications: { ...DEFAULT_SETTINGS.notifications, ...saved.notifications } };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function save(s: Settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage blocked: keep for this visit */ }
}

/** Puts theme and motion on <html> so tokens.css and the motion rules pick them up. index.html does the same before first paint. */
export function applySettings({ theme, motion }: Pick<Settings, 'theme' | 'motion'>) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  if (motion === 'reduced') root.dataset.motion = 'reduced';
  else delete root.dataset.motion;
}

/** True when animations should be skipped (OS setting or the in-app setting). */
export function prefersReducedMotion() {
  return document.documentElement.dataset.motion === 'reduced'
    || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

interface SettingsState extends Settings {
  update: (patch: Partial<Settings>) => void;
}

const pick = ({ theme, motion, mapLayer, region, radiusKm, notifications }: Settings): Settings =>
  ({ theme, motion, mapLayer, region, radiusKm, notifications });

/** User preferences, saved in this browser. */
export const useSettings = create<SettingsState>((set, get) => ({
  ...load(),
  update: patch => {
    set(patch);
    const next = pick(get());
    save(next);
    applySettings(next);
  },
}));
