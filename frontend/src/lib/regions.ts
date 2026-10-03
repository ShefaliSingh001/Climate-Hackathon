import type { LatLngBoundsExpression } from 'leaflet';
import type { Site, StateCode } from '../api/types';

export type RegionCode = StateCode | 'AU';

export interface Region {
  code: RegionCode;
  name: string;
  bounds: LatLngBoundsExpression;
}

// Listed in the order shown in the state picker. NSW is the default focus.
export const REGIONS: Region[] = [
  { code: 'NSW', name: 'New South Wales', bounds: [[-37.6, 140.9], [-28.1, 153.7]] },
  { code: 'VIC', name: 'Victoria', bounds: [[-39.2, 140.9], [-33.9, 150.0]] },
  { code: 'QLD', name: 'Queensland', bounds: [[-29.2, 137.9], [-10.6, 153.6]] },
  { code: 'SA', name: 'South Australia', bounds: [[-38.1, 129.0], [-25.9, 141.0]] },
  { code: 'WA', name: 'Western Australia', bounds: [[-35.2, 112.9], [-13.6, 129.0]] },
  { code: 'TAS', name: 'Tasmania', bounds: [[-43.7, 143.8], [-39.5, 148.5]] },
  { code: 'ACT', name: 'Australian Capital Territory', bounds: [[-35.95, 148.75], [-35.1, 149.4]] },
  { code: 'NT', name: 'Northern Territory', bounds: [[-26.0, 129.0], [-10.9, 138.0]] },
  { code: 'AU', name: 'All of Australia', bounds: [[-44.0, 112.5], [-10.0, 154.0]] },
];

export const regionByCode = (code: RegionCode) => REGIONS.find(r => r.code === code)!;

/** The signed-in buyer's site. Comes from the user profile once auth exists. */
export const HOME_SITE: Site = {
  name: 'Westlink Cable Co.',
  suburb: 'Wetherill Park',
  state: 'NSW',
  lat: -33.847,
  lng: 150.9,
};
