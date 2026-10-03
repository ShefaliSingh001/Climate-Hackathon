import type { GradeKey, MaterialKey } from '../api/types';

export interface MaterialInfo {
  label: string;
  /** Short code shown on map pins and list badges. */
  code: string;
  /** Categorical colour. Order and values were checked for colour-blind separation; pins also carry `code`. */
  color: string;
  /** Indicative tCO2e avoided per tonne of recycled input replacing virgin material. Preview values. */
  co2PerTonne: number;
}

export const MATERIALS: Record<MaterialKey, MaterialInfo> = {
  copper:    { label: 'Copper',       code: 'Cu', color: '#C0622B', co2PerTonne: 3.0 },
  aluminium: { label: 'Aluminium',    code: 'Al', color: '#4F86C6', co2PerTonne: 9.0 },
  paper:     { label: 'Paper & card', code: 'Pa', color: '#B08A2E', co2PerTonne: 0.7 },
  steel:     { label: 'Steel',        code: 'Fe', color: '#7A63B8', co2PerTonne: 1.4 },
  plastics:  { label: 'Plastics',     code: 'Pl', color: '#2A9D8F', co2PerTonne: 1.5 },
  ewaste:    { label: 'E-scrap',      code: 'Ew', color: '#C2507A', co2PerTonne: 2.0 },
  glass:     { label: 'Glass',        code: 'Gl', color: '#6B8E23', co2PerTonne: 0.3 },
  brass:     { label: 'Brass',        code: 'Br', color: '#9A7B12', co2PerTonne: 2.5 },
  alloys:    { label: 'Stainless & alloys', code: 'Ss', color: '#5E6B78', co2PerTonne: 2.0 },
};

export const GRADES: Record<GradeKey, string> = { high: 'High quality', medium: 'Medium quality', short_use: 'Short use' };

export const MATERIAL_KEYS = Object.keys(MATERIALS) as MaterialKey[];
