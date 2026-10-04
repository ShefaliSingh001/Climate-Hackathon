// Demo seller collaborations, kept in this browser. The demo seller starts with two invites from other
// recyclers. Partners invited from this browser "reply" (accept) after a few seconds so the flow can be shown.
import type { Account } from '../../auth/types';
import type { Collaboration, CollaborationMember, Listing, NewCollaboration } from '../types';
import { roadKm } from '../../lib/geo';
import { addPendingOrder } from './orders';

const KEY = 'resourcex.collaborations';
const REPLY_AFTER_MS = 8000;

function load(): Collaboration[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Collaboration[]; } catch { return []; }
}
const stored: Collaboration[] = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(stored)); } catch { /* storage blocked: keep for this visit */ }
}

const member = (l: Listing, request: Listing, tonnes: number, status: CollaborationMember['status']): CollaborationMember => ({
  company: l.company, suburb: l.suburb, state: l.state, abn: l.abn ?? null, listingId: l.id,
  tonnes, priceAud: l.priceAud, distanceKm: Math.round(roadKm(l, request)), status,
});

const isMe = (m: CollaborationMember, a: Account) => (m.abn ? m.abn === a.abn : m.company === a.company);

/** Invites other recyclers sent to the demo seller (Hunter Copper Reclaim). */
function seeded(a: Account, byId: Map<string, Listing>): Collaboration[] {
  if (a.id !== 'demo-seller') return [];
  const get = (id: string) => byId.get(id)!;
  const daysAgo = (d: number) => new Date(Date.now() - d * 864e5).toISOString();
  const d07 = get('d07'), d06 = get('d06');
  return [
    {
      id: 'c-seed-1', requestId: 'd07', buyer: { company: d07.company, suburb: d07.suburb, state: d07.state },
      material: 'copper', tonnesNeeded: 25, maxPriceAud: d07.priceAud, status: 'forming', createdAt: daysAgo(1),
      message: 'Tottenham need 25 tonnes a month and we can only do 15. Can you cover the other 10 from Kooragang?',
      members: [member(get('s02'), d07, 15, 'lead'), member(get('s01'), d07, 10, 'invited')],
    },
    {
      id: 'c-seed-2', requestId: 'd06', buyer: { company: d06.company, suburb: d06.suburb, state: d06.state },
      material: 'copper', tonnesNeeded: 20, maxPriceAud: d06.priceAud, status: 'forming', createdAt: daysAgo(3),
      message: 'Splitting the Lake Macquarie tender three ways keeps each of us under capacity.',
      members: [member(get('s04'), d06, 8, 'lead'), member(get('s03'), d06, 4, 'accepted'), member(get('s01'), d06, 8, 'invited')],
    },
  ];
}

/** Applies stored responses on top of the seeded invites, and simulates partners replying. */
export function collaborationsFor(a: Account | null, listings: Listing[]): Collaboration[] {
  if (!a) return [];
  const byId = new Map(listings.map(l => [l.id, l]));
  const all = [...seeded(a, byId).filter(c => !stored.some(s => s.id === c.id)), ...stored];
  let changed = false;
  for (const c of stored) {
    if (c.status !== 'forming' || Date.now() - Date.parse(c.createdAt) < REPLY_AFTER_MS) continue;
    for (const m of c.members) {
      if (m.status === 'invited' && !isMe(m, a)) { m.status = 'accepted'; changed = true; }
    }
  }
  if (changed) save();
  return all
    .filter(c => c.members.some(m => isMe(m, a)))
    .sort((x, y) => y.createdAt.localeCompare(x.createdAt));
}

function upsert(c: Collaboration) {
  const i = stored.findIndex(s => s.id === c.id);
  if (i >= 0) stored[i] = c; else stored.push(c);
  save();
}

export function createCollaboration(a: Account, input: NewCollaboration, listings: Listing[]): Collaboration {
  const byId = new Map(listings.map(l => [l.id, l]));
  const request = byId.get(input.requestId);
  if (!request || request.kind !== 'demand') throw new Error('That buyer request no longer exists.');
  const members = input.members
    .filter(m => m.tonnes > 0 && byId.has(m.listingId))
    .map(m => {
      const l = byId.get(m.listingId)!;
      return member(l, request, m.tonnes, l.abn === a.abn ? 'lead' : 'invited');
    });
  if (!members.some(m => m.status === 'lead')) {
    members.unshift({ company: a.company, suburb: a.site.suburb, state: a.site.state, abn: a.abn, listingId: null, tonnes: 0, priceAud: 0, distanceKm: Math.round(roadKm(a.site, request)), status: 'lead' });
  }
  const c: Collaboration = {
    id: `c-${Date.now()}`, requestId: request.id, buyer: { company: request.company, suburb: request.suburb, state: request.state },
    material: request.material, tonnesNeeded: Math.round(request.tonnes * (request.frequency === 'Weekly' ? 52 / 12 : request.frequency === 'Fortnightly' ? 26 / 12 : 1)),
    maxPriceAud: request.priceAud, members, status: 'forming', message: input.message, createdAt: new Date().toISOString(),
  };
  upsert(c);
  return c;
}

export function respond(a: Account, all: Collaboration[], id: string, accept: boolean) {
  const c = structuredClone(all.find(x => x.id === id));
  if (!c) throw new Error('Collaboration not found.');
  for (const m of c.members) if (isMe(m, a) && m.status === 'invited') m.status = accept ? 'accepted' : 'declined';
  upsert(c);
  return c;
}

export function withdraw(all: Collaboration[], id: string) {
  const c = structuredClone(all.find(x => x.id === id));
  if (!c) throw new Error('Collaboration not found.');
  c.status = 'withdrawn';
  upsert(c);
  return c;
}

/** The lead sends the team's offer to the buyer; it shows up in Orders as a pending joint order. */
export function sendOffer(a: Account, all: Collaboration[], id: string, listings: Listing[]) {
  const c = structuredClone(all.find(x => x.id === id));
  if (!c) throw new Error('Collaboration not found.');
  const active = c.members.filter(m => m.status === 'lead' || m.status === 'accepted');
  const tonnes = active.reduce((s, m) => s + m.tonnes, 0);
  const request = listings.find(l => l.id === c.requestId);
  if (request) {
    const price = tonnes ? active.reduce((s, m) => s + m.tonnes * m.priceAud, 0) / tonnes : request.priceAud;
    addPendingOrder(a, { ...request, priceAud: Math.round(price) }, tonnes, {
      collaborationId: c.id, partners: active.filter(m => !isMe(m, a)).map(m => m.company),
    });
  }
  c.status = 'offer_sent';
  upsert(c);
  return c;
}
