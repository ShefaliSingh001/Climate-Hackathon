import { useEffect, useRef, type CSSProperties } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, BadgeCheck, Check, CheckCircle2, Combine, Factory, Filter, Layers3, ListOrdered, Map as MapIcon, Recycle, ShieldCheck, Sparkles, Truck } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { DotField } from '../components/brand/DotField';
import { Logo } from '../components/brand/Logo';
import { ACT_PATH, HOME_XY, NSW_PATH, PINS } from '../components/home/nswMap';
import { PartnerStrip } from '../components/home/PartnerStrip';
import { ImpactSection } from '../components/home/ImpactSection';
import { CountUp, Reveal, useScrollFx } from '../components/home/motion';
import { MATERIALS } from '../lib/materials';
import type { MaterialKey } from '../api/types';
import '../styles/home.css';

// Photos are in public/images/ (see CREDITS.md there).
const PHOTOS = {
  sortingLine: { src: '/images/sorting-line.webp', w: 800, h: 533, alt: 'Workers sorting cardboard on a conveyor at a materials recovery facility' },
  copper: { src: '/images/copper-granules.webp', w: 1600, h: 1067, alt: 'Close-up of recycled copper granules' },
  truck: { src: '/images/truck.webp', w: 1439, h: 1079, alt: 'A semi-trailer truck on an open highway' },
};
type PhotoKey = keyof typeof PHOTOS;

function Photo({ name, className = '' }: { name: PhotoKey; className?: string }) {
  const p = PHOTOS[name];
  return (
    <div className={`photo ${className}`}>
      <img src={p.src} width={p.w} height={p.h} alt={p.alt} loading="lazy" decoding="async" />
    </div>
  );
}

const NAV_LINKS: [string, string][] = [['impact', 'Impact'], ['ai', 'AI matching'], ['how', 'How it works'], ['who', "Who it's for"]];
const SECTIONS = NAV_LINKS.map(([id]) => id);

// The homepage map is zoomed into Greater Sydney, the Hunter and the Illawarra, where most sample suppliers are.
// nswMap.ts coordinates are drawn for all of NSW; VIEW crops and scales them.
const VIEW = { x: 346, y: 214, k: 4.9, w: 520, h: 450 };
const toView = (x: number, y: number): [number, number] => [(x - VIEW.x) * VIEW.k, (y - VIEW.y) * VIEW.k];
const inView = ([x, y]: [number, number]) => x > 8 && x < VIEW.w - 8 && y > 8 && y < VIEW.h - 8;
// km per view unit: nswMap.ts uses 46 units per degree of latitude (about 111 km).
const KM_PER_UNIT = 111 / 46 / VIEW.k;

const ROUTES = ['s01', 's02', 's03'];
const CITY_LABELS: [string, number, number, 'l' | 'r'][] = [
  ['Sydney', 151.21, -33.87, 'r'], ['Newcastle', 151.78, -32.93, 'r'], ['Wollongong', 150.89, -34.42, 'r'],
  ['Central Coast', 151.34, -33.43, 'r'], ['Lithgow', 150.16, -33.48, 'r'], ['Maitland', 151.55, -32.73, 'l'],
];
const project = (lon: number, lat: number) => [(lon - 140.8) * 46 * Math.cos((33 * Math.PI) / 180), (-27.9 - lat) * 46];

function NswMap() {
  const pins = PINS.map(p => ({ ...p, xy: toView(p.x, p.y) })).filter(p => inView(p.xy));
  const byId = Object.fromEntries(pins.map(p => [p.id, p]));
  const home = toView(...HOME_XY);
  const scaleKm = 50;
  return (
    <svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} role="img" aria-label="Map of Greater Sydney, the Hunter and the Illawarra with recycled material suppliers and three delivery routes to Wetherill Park">
      <g transform={`scale(${VIEW.k}) translate(${-VIEW.x} ${-VIEW.y})`}>
        <path d={NSW_PATH} fill="#1A3A26" stroke="#4C7046" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        <path d={ACT_PATH} fill="#20442D" stroke="#4C7046" vectorEffect="non-scaling-stroke" />
      </g>
      <text x={VIEW.w - 18} y={VIEW.h - 120} textAnchor="end" className="sea">Tasman Sea</text>
      {ROUTES.filter(id => byId[id]).map(id => {
        const d = `M${byId[id].xy[0]},${byId[id].xy[1]} L${home[0]},${home[1]}`;
        return (
          <g key={id}>
            <path className="route-base" pathLength={1000} d={d} stroke="#A8CF6A" strokeWidth={2.5} strokeLinecap="round" fill="none" />
            <path className="route-pulse" pathLength={1000} d={d} stroke="#F4FBE8" strokeWidth={3} strokeLinecap="round" fill="none" />
          </g>
        );
      })}
      {CITY_LABELS.map(([n, lon, lat, side]) => {
        const [x, y] = toView(...(project(lon, lat) as [number, number]));
        return <text key={n} x={side === 'r' ? x + 14 : x - 14} y={y + 4} textAnchor={side === 'r' ? 'start' : 'end'} className="city">{n}</text>;
      })}
      {pins.map((p, i) => {
        const on = ROUTES.includes(p.id);
        const color = MATERIALS[p.m as MaterialKey].color;
        return (
          <g key={p.id} transform={`translate(${p.xy[0]},${p.xy[1]})`}>
            {on && <circle r={8} fill={color} className="pin-pulse" style={{ animationDelay: `${i * 0.2}s` }} />}
            <circle r={on ? 8 : 5.5} fill={color} stroke="#fff" strokeWidth={on ? 2 : 1.2} opacity={on ? 1 : 0.8}><title>{p.name}</title></circle>
          </g>
        );
      })}
      <g transform={`translate(${home[0]},${home[1]})`}>
        <circle r={14} fill="#1A73E8" opacity={0.25} className="pin-pulse" />
        <circle r={7} fill="#1A73E8" stroke="#fff" strokeWidth={2.5}><title>Your site, Wetherill Park</title></circle>
      </g>
      <g transform={`translate(18 ${VIEW.h - 22})`} className="scale">
        <path d={`M0,-5 V0 H${scaleKm / KM_PER_UNIT} V-5`} fill="none" stroke="#B6CBB0" strokeWidth={1.2} />
        <text x={scaleKm / KM_PER_UNIT + 8} y={0}>{scaleKm} km</text>
      </g>
    </svg>
  );
}

const STEPS: { n: number; t: string; photo: PhotoKey; p: string; feats: [typeof MapIcon, string][] }[] = [
  { n: 1, t: 'List', photo: 'sortingLine', p: 'Recyclers publish material, grade, monthly volume, price and yard location in a few minutes.',
    feats: [[BadgeCheck, 'Verified with the business ABN'], [MapIcon, 'Pinned on the live supply map from the yard address']] },
  { n: 2, t: 'Match', photo: 'copper', p: 'Manufacturers set demand and budget. The AI matching engine checks every listing and ranks the suppliers that can really fill the order.',
    feats: [[Filter, 'Grade, certificates, delivery window and budget checked'], [Layers3, 'Every match explained in plain words']] },
  { n: 3, t: 'Deliver', photo: 'truck', p: 'See the delivered cost with freight included, then split one order across partners to reach your volume within budget.',
    feats: [[Truck, 'Rigid, semi-trailer or B-double freight on the road route'], [Combine, 'Combined orders from several verified suppliers']] },
];

const AI_POINTS: [typeof MapIcon, string, string][] = [
  [ShieldCheck, 'Hard rules first', 'Exact material and grade, certificates, stock in your delivery window and your budget. Anything that fails is ruled out.'],
  [ListOrdered, 'Ranked, with reasons', 'The rest are ranked on quality, distance, price and reliability, and every result says why in plain words.'],
  [Combine, 'Splits big orders', 'When no single yard has enough, it finds the cheapest combination of suppliers to reach your tonnes.'],
  [Truck, 'Priced to your door', 'Road freight on the real route is added to every match, so you compare delivered cost.'],
];

const DEMO_MATCHES = [
  { name: 'Smithfield Cable Recovery', place: 'Smithfield · 5 km', t: 23, price: '$19,310' },
  { name: 'Hunter Copper Reclaim', place: 'Kooragang · 169 km', t: 25, price: '$19,900' },
  { name: 'Illawarra Non-Ferrous', place: 'Port Kembla · 87 km', t: 12, price: '$18,860' },
];

/** Static product vignette of a match: the request, the checks and the ranked result. Animates on reveal. */
function MatchDemo() {
  return (
    <div className="match-demo" aria-label="Example: the AI matching engine ranks three copper suppliers for a 60 tonne monthly order">
      <div className="md-head"><Sparkles size={15} /><b>AI match</b><span>Sample</span></div>
      <div className="md-request">
        {['Copper', '#1 bare bright', '60 tonnes a month', 'Wetherill Park', 'Up to $19,900 per tonne'].map(c => <span key={c}>{c}</span>)}
      </div>
      <div className="md-scan" aria-hidden="true"><i /></div>
      <p className="md-checked">Checked 38 copper listings · 9 met every rule</p>
      <ol className="md-results">
        {DEMO_MATCHES.map((m, i) => (
          <li key={m.name} style={{ '--i': i } as CSSProperties}>
            <span className="md-pos">#{i + 1}</span>
            <div className="md-who"><b>{m.name}</b><small>{m.place}</small>
              <span className="md-checks">{['Grade', 'Certified', 'In window', 'In budget'].map(c => <em key={c}><Check size={11} strokeWidth={3} />{c}</em>)}</span>
            </div>
            <div className="md-num"><b>{m.t} tonnes</b><small>{m.price} delivered</small></div>
          </li>
        ))}
      </ol>
      <div className="md-foot"><CheckCircle2 size={15} /><span><b>60 of 60 tonnes</b> from 3 suppliers · $19,470 per tonne delivered · 5% cheaper than newly sourced</span></div>
    </div>
  );
}

export function Home() {
  const { account } = useAuth();
  const buyerCta = account ? '/marketplace' : '/signup?role=buyer';
  const sellerCta = account ? (account.role === 'seller' ? '/sell/new' : '/marketplace') : '/signup?role=seller';

  const navRef = useRef<HTMLElement>(null);
  const { scrolled, active } = useScrollFx(navRef, SECTIONS);

  // Links like /#impact (the old /impact page redirects there) land on the section, not the top.
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
  }, [hash]);

  return (
    <div className="home">
      <header ref={navRef} className={`home-nav${scrolled ? ' scrolled' : ''}`}>
        <div className="wrap nav-inner">
          <Logo to="/" size={26} />
          <nav className="pill-links" aria-label="Sections">
            {NAV_LINKS.map(([id, label]) => (
              <a key={id} href={`#${id}`} aria-current={active === id ? 'true' : undefined}>{label}</a>
            ))}
          </nav>
          <div className="nav-cta">
            {account ? (
              <Link className="h-btn h-primary h-sm" to="/marketplace">Go to dashboard <ArrowRight size={15} /></Link>
            ) : (
              <>
                <Link className="h-btn h-ghost h-sm" to="/login">Log in</Link>
                <Link className="h-btn h-primary h-sm" to="/signup">Get started</Link>
              </>
            )}
          </div>
        </div>
        <div className="scroll-progress" aria-hidden="true" />
      </header>

      <section className="hero">
        <DotField className="hero-dots" />
        <div className="wrap hero-body">
          <span className="eyebrow"><Sparkles size={14} /> AI matching for recycled materials · NSW</span>
          <h1>Recycled materials, matched by AI</h1>
          <p className="lede">Tell ResourceX what your plant needs. Our matching engine checks every listing for grade, certificates, volume and delivery window, then ranks the suppliers that can really fill the order, priced to your door.</p>
          <div className="hero-cta">
            <Link className="h-btn h-primary" to={buyerCta}>Find recycled supply <ArrowRight size={16} /></Link>
            <Link className="h-btn h-outline-light" to={sellerCta}>List your material</Link>
          </div>
        </div>
        <div className="hero-facts">
          <div className="wrap">
            <div className="fact"><b><CountUp value={6.9} decimals={1} suffix="%" /></b><span>of materials used worldwide are recycled</span></div>
            <div className="fact"><b><CountUp value={15} suffix="%" /></b><span>COP31 circular-use goal for 2035</span></div>
            <div className="fact"><b><CountUp value={80} suffix="%" /></b><span>NSW resource recovery target by 2030</span></div>
          </div>
        </div>
      </section>

      <PartnerStrip />

      <ImpactSection />

      <section className="band problem" id="problem">
        <div className="wrap problem-grid">
          <Reveal className="problem-head" variant="left">
            <span className="eyebrow">The problem</span>
            <h2 className="h2-left">The material exists. Buyers can't find it.</h2>
            <p className="problem-lede">Recyclers recover more every year, but they still sell through phone calls and brokers. Manufacturers can't compare grade, volume, distance or delivered cost, so they keep buying newly sourced material.</p>
            <p className="src">Sources: Circularity Gap Report 2018–2025 (Circle Economy); NSW Waste and Sustainable Materials Strategy 2041.</p>
          </Reveal>
          <Reveal as="ul" className="problem-list" stagger>
            <li><b><CountUp value={6.9} decimals={1} suffix="%" /></b><p><strong>The world is going backwards</strong>Global circular material use fell from 9.1% in 2018 to 6.9% in 2025.</p></li>
            <li><b><CountUp value={80} suffix="%" /></b><p><strong>Recovered material needs buyers</strong>NSW aims to recover 80% of waste by 2030. Every recovered tonne still has to find a manufacturer who can use it.</p></li>
            <li><b><CountUp value={600} suffix=" km" /></b><p><strong>Freight decides the deal</strong>A cheaper tonne 600 km away can end up costing more than newly sourced material. Without a delivered price, buyers default to what they know.</p></li>
          </Reveal>
        </div>
      </section>

      <section className="band ai" id="ai">
        <div className="wrap ai-grid">
          <Reveal className="ai-copy" variant="left">
            <span className="eyebrow">The matching engine</span>
            <h2 className="h2-left">Describe the order. AI finds who can fill it.</h2>
            <p>Instead of calling yards one by one, enter material, grade, tonnes and budget once. ResourceX does the checking, the ranking and the freight maths in seconds.</p>
            <Reveal as="ul" className="ai-points" stagger>
              {AI_POINTS.map(([Icon, title, text]) => (
                <li key={title}><span className="ic"><Icon size={17} /></span><div><b>{title}</b><span>{text}</span></div></li>
              ))}
            </Reveal>
          </Reveal>
          <Reveal className="ai-demo" variant="right" delay={120}>
            <MatchDemo />
          </Reveal>
        </div>
      </section>

      <section className="band how" id="how">
        <div className="wrap">
          <Reveal className="center-head">
            <span className="eyebrow">How it works</span>
            <h2>From scrap yard to production line</h2>
            <p>Producers list what they recover. Manufacturers say what they need. ResourceX ranks the matches, prices the freight and splits orders across partners.</p>
          </Reveal>
          <div className="how-grid">
            <ol className="how-steps">
              {STEPS.map((st, i) => (
                <Reveal as="li" key={st.n} className="how-step" delay={i * 110}>
                  <Photo name={st.photo} className="how-photo" />
                  <div className="how-text">
                    <span className="step-num">0{st.n}</span>
                    <h3>{st.t}</h3>
                    <p>{st.p}</p>
                    <ul className="how-feats">
                      {st.feats.map(([Icon, text]) => <li key={text}><Icon size={15} />{text}</li>)}
                    </ul>
                  </div>
                </Reveal>
              ))}
            </ol>
            <Reveal className="map-card" variant="right" delay={100}>
              <div className="map-head"><b>Copper · 60 tonnes a month to Wetherill Park</b><span>Sample data</span></div>
              <NswMap />
              <div className="order">
                <h4>Combined order <span>Within budget</span></h4>
                <div className="order-row"><span>Hunter Copper Reclaim, Kooragang</span><span className="num">25 tonnes</span></div>
                <div className="order-row"><span>Smithfield Cable Recovery, Smithfield</span><span className="num">23 tonnes</span></div>
                <div className="order-row"><span>Illawarra Non-Ferrous, Port Kembla</span><span className="num">12 tonnes</span></div>
                <div className="bar"><i /></div>
                <div className="order-row order-total"><span>Delivered cost</span><span className="num">$19,470 per tonne</span></div>
                <div className="order-row"><span>Compared with newly sourced copper</span><span className="num good">5% cheaper</span></div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="band" id="who">
        <div className="wrap">
          <Reveal className="center-head">
            <span className="eyebrow">Who it's for</span>
            <h2>Built for both sides of the trade</h2>
          </Reveal>
          <div className="audience">
            <Reveal className="aud">
              <div className="aud-body">
                <span className="aud-icon"><Recycle size={22} /></span>
                <span className="eyebrow">Recyclers and producers</span>
                <h3>Sell recovered material at its real value</h3>
                <p>Reach manufacturers looking for your grade, without brokers.</p>
                <ul>
                  {['List steel, copper, aluminium, brass and alloys', 'See open tenders near your yard', 'Get matched into larger combined orders'].map(x => <li key={x}><Check size={16} />{x}</li>)}
                </ul>
                <Link className="h-btn h-outline h-sm" to={sellerCta}>Sell on ResourceX <ArrowRight size={15} /></Link>
              </div>
            </Reveal>
            <Reveal className="aud" delay={130}>
              <div className="aud-body">
                <span className="aud-icon"><Factory size={22} /></span>
                <span className="eyebrow">Manufacturers</span>
                <h3>Buy recycled with the numbers in front of you</h3>
                <p>Compare grade, certification and delivered cost against newly sourced materials before you call anyone.</p>
                <ul>
                  {['Set demand and budget once, get AI-ranked suppliers', 'Split orders across verified partners', 'Report CO₂e avoided for every tonne'].map(x => <li key={x}><Check size={16} />{x}</li>)}
                </ul>
                <Link className="h-btn h-outline h-sm" to={buyerCta}>Buy on ResourceX <ArrowRight size={15} /></Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="band closing">
        <Reveal className="wrap">
          <span className="eyebrow">Get started</span>
          <h2>Make recycled the default choice</h2>
          <p>Create a free account as a buyer or a seller, or explore with a demo account.</p>
          <div className="row">
            <Link className="h-btn h-primary" to={account ? '/marketplace' : '/signup'}>{account ? 'Go to dashboard' : 'Create an account'} <ArrowRight size={16} /></Link>
            {!account && <Link className="h-btn h-outline" to="/login">Try a demo account</Link>}
          </div>
        </Reveal>
      </section>

      <footer className="home-footer">
        <div className="wrap">
          <Logo size={20} tone="dark" />
          <span>Prototype for the COP31 Green Industrialisation priority · Sample listings are fictional</span>
        </div>
      </footer>
    </div>
  );
}
