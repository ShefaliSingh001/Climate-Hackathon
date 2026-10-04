// Demo order history. Demo accounts get 24 months of sample orders (stable for the same account);
// quote requests, offers and joint offers made in this browser are added on top.
import type { Account } from '../../auth/types';
import type { Listing, Order, OrderParty, OrderStatus } from '../types';
import { MATERIALS } from '../../lib/materials';
import { roadKm } from '../../lib/geo';
import { cheapestFreight, KG_CO2E_PER_TKM } from '../../lib/logistics';
import { monthlyTonnes } from '../../lib/format';

const ORDERS_KEY = 'resourcex.orders';

function loadStored(): Order[] {
  try { return JSON.parse(localStorage.getItem(ORDERS_KEY) ?? '[]') as Order[]; } catch { return []; }
}
const stored: Order[] = loadStored();
function save() {
  try { localStorage.setItem(ORDERS_KEY, JSON.stringify(stored)); } catch { /* storage blocked: keep for this visit */ }
}

/** Small seeded generator so the sample history is the same on every load. */
function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353), h = (h << 13) | (h >>> 19);
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const party = (l: Pick<Listing, 'company' | 'suburb' | 'state'>): OrderParty => ({ company: l.company, suburb: l.suburb, state: l.state });
const accountParty = (a: Account): OrderParty => ({ company: a.company, suburb: a.site.suburb, state: a.site.state });

function makeOrder(id: string, ref: string, a: Account, counterpart: Listing, tonnes: number, priceAud: number, placed: Date, status: OrderStatus): Order {
  const km = roadKm(a.site, counterpart);
  const freight = cheapestFreight(tonnes, km);
  const delivery = new Date(placed);
  delivery.setDate(delivery.getDate() + 9 + Math.round(km / 120));
  const avoided = tonnes * MATERIALS[counterpart.material].co2PerTonne - (tonnes * km * KG_CO2E_PER_TKM) / 1000;
  const me = accountParty(a);
  return {
    id, ref, listingId: counterpart.id, material: counterpart.material, grade: counterpart.grade,
    buyer: a.role === 'buyer' ? me : party(counterpart),
    seller: a.role === 'buyer' ? party(counterpart) : me,
    tonnes, priceAud: Math.round(priceAud), freightAud: Math.round(freight.perTonne), distanceKm: Math.round(km),
    status, placedAt: placed.toISOString(), deliveryDate: delivery.toISOString(), co2eAvoidedT: Math.max(0, avoided),
  };
}

// Who each demo account trades with (listing ids in listings.json). The demo seller also sells to the demo buyer.
const COUNTERPARTS: Record<string, string[]> = {
  'demo-buyer': ['s01', 's02', 's03', 's06', 's07'],
  'demo-seller': ['d06', 'd07', 'd09'],
};

function sampleOrders(a: Account, listings: Listing[]): Order[] {
  const ids = COUNTERPARTS[a.id];
  if (!ids) return [];
  const byId = new Map(listings.map(l => [l.id, l]));
  const pool = ids.map(id => byId.get(id)).filter(Boolean) as Listing[];
  const rand = rng(a.id);
  const now = new Date();
  const out: Order[] = [];
  let ref = 10230;

  for (let monthsAgo = 23; monthsAgo >= 0; monthsAgo--) {
    // Volume grows slowly over time.
    const count = 2 + Math.floor(rand() * 2) + (monthsAgo < 9 && rand() < 0.5 ? 1 : 0);
    for (let k = 0; k < count; k++) {
      const cp = pool[Math.floor(rand() * pool.length)];
      const placed = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1 + Math.floor(rand() * 26), 9 + Math.floor(rand() * 8));
      if (placed > now) placed.setTime(now.getTime() - (k + 1) * 36e5 * 20);
      // A seller can only ship what its yard produces (the demo seller lists 25 tonnes a month); the demo buyer orders up to 45.
      const cap = Math.max(4, Math.min(monthlyTonnes(cp.tonnes, cp.frequency), a.role === 'seller' ? 25 : 45));
      const tonnes = Math.max(2, Math.round(cap * (0.35 + rand() * 0.6)));
      const price = cp.priceAud * (0.96 + rand() * 0.07) * (1 - monthsAgo * 0.002);
      const age = (now.getTime() - placed.getTime()) / 864e5;
      const status: OrderStatus = age > 24 ? (rand() < 0.06 ? 'cancelled' : 'delivered')
        : age > 12 ? 'in_transit' : age > 4 ? 'confirmed' : 'pending';
      out.push(makeOrder('', '', a, cp, tonnes, price, placed, status));
    }
  }
  // References go up with the order date.
  out.sort((x, y) => x.placedAt.localeCompare(y.placedAt));
  for (const o of out) {
    ref += 1 + Math.floor(rand() * 9);
    o.id = `o-${a.id}-${ref}`;
    o.ref = `RX-${ref}`;
  }
  return out;
}

export function ordersFor(a: Account | null, listings: Listing[]): Order[] {
  if (!a) return [];
  const mine = stored.filter(o => (a.role === 'buyer' ? o.buyer.company : o.seller.company) === a.company);
  return [...sampleOrders(a, listings), ...mine].sort((x, y) => y.placedAt.localeCompare(x.placedAt));
}

/** Records a quote request (buyer) or an offer (seller) as a pending order. */
export function addPendingOrder(a: Account, counterpart: Listing, tonnes: number, extra: Partial<Order> = {}) {
  const ref = 20000 + stored.length * 7 + Math.floor(Math.random() * 6);
  const order = { ...makeOrder(`o-new-${Date.now()}`, `RX-${ref}`, a, counterpart, tonnes, counterpart.priceAud, new Date(), 'pending'), ...extra };
  stored.push(order);
  save();
  return order;
}
