// Shapes the UI expects from the backend. Keep in sync with API_CONTRACT.md.

export type MaterialKey = 'copper' | 'aluminium' | 'paper' | 'steel' | 'plastics' | 'ewaste' | 'glass' | 'brass' | 'alloys';

/** Quality grade used by the backend dataset and matching model, lowest to highest. */
export type GradeKey = 'short_use' | 'medium' | 'high';

export type StateCode = 'NSW' | 'VIC' | 'QLD' | 'SA' | 'WA' | 'TAS' | 'ACT' | 'NT';

export type Frequency = 'Weekly' | 'Fortnightly' | 'Monthly';

/** 'supply' = a seller offering material, 'demand' = a buyer requesting material. */
export type ListingKind = 'supply' | 'demand';

export interface Listing {
  id: string;
  kind: ListingKind;
  company: string;
  suburb: string;
  state: StateCode;
  lat: number;
  lng: number;
  material: MaterialKey;
  grade: string;
  form: string;
  /** Tonnes per delivery period (see `frequency`). */
  tonnes: number;
  frequency: Frequency;
  /** AUD per tonne. For demand listings this is the most the buyer will pay. */
  priceAud: number;
  /** Indicative AUD/t for the equivalent virgin material, or null if not comparable. */
  virginPriceAud: number | null;
  /** Purity in percent, or null when assay is on request. */
  purity: number | null;
  certifications: string[];
  verified: boolean;
  monthsOnPlatform: number;
  /** 0–100 fit for the signed-in user's site, computed by the matching service. Optional. */
  matchScore?: number;
  /** Backend extras (absent in the mock). */
  gradeKey?: GradeKey;
  abn?: string;
  website?: string | null;
  /** True when lat/lng is the suburb centre rather than the yard itself. */
  locationApprox?: boolean;
}

export interface Site {
  name: string;
  suburb: string;
  state: StateCode;
  lat: number;
  lng: number;
}

export interface MatchRequest {
  material: MaterialKey;
  minPurity: number;
  tonnesPerMonth: number;
  maxPriceAud: number;
  site: Site;
  /** Exact grade required; omit for any grade. Used by the backend matching model. */
  grade?: GradeKey;
  certifications?: string[];
}

export interface ScoreBreakdown {
  material: number;
  distance: number;
  price: number;
  reliability: number;
  volume: number;
}

export interface MatchResult {
  listing: Listing;
  /** 0–100 overall score. */
  score: number;
  breakdown: ScoreBreakdown;
  /** Road distance estimate in km from the requesting site. */
  distanceKm: number;
  /** Short human-readable reasons, shown under the result. */
  reasons: string[];
  /** False when the matching model rules the supplier out (reasons say why). */
  eligible?: boolean;
  /** Part of the model's cheapest combined order for this requirement. */
  inBestPlan?: boolean;
}

export type Strategy = 'cost' | 'fewest' | 'emissions';

/** Split one monthly demand across several suppliers (POST /orders/plan). */
export interface OrderPlanRequest {
  material: MaterialKey;
  grade?: GradeKey;
  minPurity: number;
  tonnesPerMonth: number;
  /** A$ per month for the material, excluding freight. */
  budgetAud: number;
  site: Site;
  maxPartners: number;
  verifiedOnly: boolean;
  strategy: Strategy;
}

export interface OrderPlanLine {
  listingId: string;
  tonnes: number;
}

export interface OrderPlanResult {
  status: 'feasible' | 'infeasible';
  /** Why no plan was found, when infeasible. */
  reason?: string | null;
  shortfallTonnes?: number | null;
  /** Alternatives, best first; each uses a different set of suppliers. */
  plans: { rank: number; lines: OrderPlanLine[]; supplierCount: number; totalCostAud: number; budgetRemainingAud: number }[];
  notice?: string;
}

export type NewListing = Omit<Listing, 'id' | 'verified' | 'monthsOnPlatform' | 'matchScore' | 'gradeKey' | 'locationApprox'>;

export interface Enquiry {
  tonnesPerMonth: number;
  firstDelivery: string;
  message: string;
}

export interface ImpactStats {
  tonnesRecirculated: number;
  co2eAvoidedT: number;
  activeVerifiedSites: number;
  matchesConverted: number;
  byMaterial: { material: MaterialKey; tonnes: number }[];
  isSample: boolean;
}
