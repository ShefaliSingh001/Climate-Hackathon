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
  /** Street address and postcode of the yard or delivery site, when given. */
  address?: string;
  postcode?: string;
  /** True when lat/lng is the suburb centre rather than the yard itself. */
  locationApprox?: boolean;
  /** Supply: period the tonnes are available (ISO dates). Demand: purchase window. */
  availableFrom?: string | null;
  availableTo?: string | null;
  /** Demand only: total tender budget in A$ (priceAud = budget / tonnes) and timeframe (ISO dates). */
  budgetAud?: number;
  orderBy?: string;
  deliverBy?: string;
}

export interface Site {
  name: string;
  suburb: string;
  state: StateCode;
  lat: number;
  lng: number;
  /** Street address and postcode, when the account gave one. */
  address?: string;
  postcode?: string;
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

export interface MaterialImpact {
  material: MaterialKey;
  /** Tonnes traded. */
  tonnes: number;
  /** Net of trucking emissions. */
  co2eAvoidedT: number;
  offeredT: number;
  requestedT: number;
}

export interface ImpactStats {
  /** e.g. "November 2026". */
  period: string;
  /** True while the figures come from the synthetic demo dataset rather than recorded trades. */
  isSample: boolean;
  tonnesRecirculated: number;
  /** CO2e avoided by replacing virgin material, net of trucking. */
  co2eAvoidedT: number;
  transportCo2eT: number;
  landfillAvoidedT: number;
  /** Buyers' budget per tonne minus the price paid, times tonnes. */
  moneySavedAud: number;
  /** Paid to producers for material that would otherwise be waste. */
  valueRecoveredAud: number;
  tonnesOffered: number;
  tonnesRequested: number;
  trades: number;
  producers: { total: number; matched: number };
  tenders: { total: number; filled: number; partial: number };
  /** Sorted by CO2e avoided, largest first. */
  byMaterial: MaterialImpact[];
  circularity: {
    globalRatePct: number;
    globalSource: string;
    australiaRatePct: number;
    australiaSource: string;
    australiaGoal: string;
    goalPct: number;
    goal: string;
  };
  factors: { material: MaterialKey; tco2ePerT: number; source: string; url: string | null }[];
  assumptions: string[];
  outlook: Outlook;
}

export interface OutlookScenario {
  key: 'conservative' | 'expected' | 'ambitious';
  label: string;
  /** Yearly growth in scrap matched on ResourceX. */
  growthPct: number;
  /** Recycled share of metal input, one value per year in `Outlook.years`. */
  sharePct: number[];
  extraTonnesPerYear2035: number;
  /** Cumulative CO2e avoided by the extra recycled metal, 2026–2035. */
  co2eAvoidedT: number;
}

/** 2035 outlook: recycled share of the metal that SME manufacturers on ResourceX buy, with and without it. */
export interface Outlook {
  metric: string;
  /** Who the share covers, e.g. "SME manufacturers (foundries and fabricators)". */
  segment: string;
  buyers: number;
  years: number[];
  businessAsUsualPct: number[];
  scenarios: OutlookScenario[];
  /** Highest share these buyers' processes can take. */
  ceilingPct: number;
  metalInputTonnesPerMonth: number;
  /** One row per kind of buyer, largest metal use first. Weighting `nowPct` by `mixPct` gives `businessAsUsualPct[0]`. */
  baselines: {
    group: string;
    buyers: number;
    /** Share of the group's metal use. */
    mixPct: number;
    inputTonnesPerMonth: number;
    nowPct: number;
    bau2035Pct: number;
    ceilingPct: number;
    sourceName: string;
    source: string;
    url: string;
  }[];
  /** Steel mills: already at their process limits, so counted in tonnes rather than in the share. */
  mills: {
    buyers: { name: string; process: string; metalUseTonnesPerMonth: number; recycledNowPct: number; limitPct: number;
              matchedTonnesPerMonth: number; sourceName: string; source: string; url: string }[];
    metalUseTonnesPerMonth: number;
    matchedTonnesPerMonth: number;
  };
  assumptions: string[];
}

/** Plain-language monthly report. `source` says whether Claude wrote it or the template did. */
export interface ImpactReport {
  headline: string;
  summary: string[];
  highlights: string[];
  source: 'claude' | 'template';
  model: string | null;
  /** Why the template was used, when it was. */
  note: string | null;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Orders and seller collaborations (GET /orders, /collaborations). See API_CONTRACT.md.
// ---------------------------------------------------------------------------

/** pending = quote or offer sent, waiting for the other side. */
export type OrderStatus = 'pending' | 'confirmed' | 'in_transit' | 'delivered' | 'cancelled';

export interface OrderParty {
  company: string;
  suburb: string;
  state: StateCode;
}

/** One delivery agreement between a buyer and a seller. The signed-in account is one of the two. */
export interface Order {
  id: string;
  /** Short reference shown to people, e.g. "RX-10482". */
  ref: string;
  /** Listing the order came from, when it still exists. */
  listingId: string | null;
  material: MaterialKey;
  grade: string;
  buyer: OrderParty;
  seller: OrderParty;
  tonnes: number;
  /** Material price, A$ per tonne. */
  priceAud: number;
  /** Freight, A$ per tonne. */
  freightAud: number;
  distanceKm: number;
  status: OrderStatus;
  /** ISO dates. */
  placedAt: string;
  deliveryDate: string;
  /** Tonnes CO2e avoided against newly sourced material, net of trucking. */
  co2eAvoidedT: number;
  /** Set when the seller side is a team of sellers (see Collaboration). */
  collaborationId?: string | null;
  partners?: string[];
}

export type MemberStatus = 'lead' | 'invited' | 'accepted' | 'declined';

export interface CollaborationMember {
  company: string;
  suburb: string;
  state: StateCode;
  abn: string | null;
  listingId: string | null;
  /** Tonnes a month this member supplies. */
  tonnes: number;
  /** Member's material price, A$ per tonne. */
  priceAud: number;
  /** Road km from the member's yard to the buyer. */
  distanceKm: number;
  status: MemberStatus;
}

/** forming = invites out; offer_sent = joint offer sent to the buyer; withdrawn = the lead cancelled it. */
export type CollaborationStatus = 'forming' | 'offer_sent' | 'withdrawn';

/** Several sellers teaming up to fill one buyer request that is too big for any one of them. */
export interface Collaboration {
  id: string;
  requestId: string;
  buyer: OrderParty;
  material: MaterialKey;
  /** Tonnes a month the buyer wants, and the most they pay per tonne. */
  tonnesNeeded: number;
  maxPriceAud: number;
  members: CollaborationMember[];
  status: CollaborationStatus;
  message: string;
  createdAt: string;
}

export interface NewCollaboration {
  requestId: string;
  members: { listingId: string; tonnes: number }[];
  message: string;
}
