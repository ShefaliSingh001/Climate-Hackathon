import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BadgeCheck, Check, Factory, Layers3, Map as MapIcon, Recycle, Truck } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { DotField } from '../components/brand/DotField';
import { Logo } from '../components/brand/Logo';
import { ACT_PATH, HOME_XY, NSW_PATH, PINS } from '../components/home/nswMap';
import { PartnerStrip } from '../components/home/PartnerStrip';
import { MATERIALS } from '../lib/materials';
import type { MaterialKey } from '../api/types';
import '../styles/home.css';

// Photos are in public/images/ (see CREDITS.md there).
const PHOTOS = {
  scrapYard: { src: '/images/scrap-yard.webp', w: 1280, h: 853, alt: 'Piles of mixed scrap metal waiting to be sorted at a recovery yard' },
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

/** Slides a block up slightly as it scrolls into view. Content is visible at rest. */
function Reveal({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.classList.add('pending');
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { el.classList.remove('pending'); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(el);
    const fallback = setTimeout(() => el.classList.remove('pending'), 2500);
    return () => { io.disconnect(); clearTimeout(fallback); };
  }, []);
  return <div ref={ref} id={id} className={`reveal ${className}`}>{children}</div>;
}

const ROUTES = ['s02', 's01'];
const CITY_LABELS: [string, number, number][] = [
  ['Sydney', 151.21, -33.87], ['Newcastle', 151.78, -32.93], ['Wollongong', 150.89, -34.42],
  ['Dubbo', 148.6, -32.25], ['Wagga Wagga', 147.37, -35.12], ['Broken Hill', 141.45, -31.95],
];
const project = (lon: number, lat: number) => [(lon - 140.8) * 46 * Math.cos((33 * Math.PI) / 180), (-27.9 - lat) * 46];

function NswMap() {
  const byId = Object.fromEntries(PINS.map(p => [p.id, p]));
  return (
    <svg viewBox="-10 -10 520 470" role="img" aria-label="Map of NSW with recycled material suppliers and two delivery routes to Western Sydney">
      <path d={NSW_PATH} fill="#1A3A26" stroke="#4C7046" strokeWidth={1.2} />
      <path d={ACT_PATH} fill="#20442D" stroke="#4C7046" />
      {ROUTES.map(id => (
        <path key={id} className="route" d={`M${byId[id].x},${byId[id].y} L${HOME_XY[0]},${HOME_XY[1]}`} stroke="#A8CF6A" strokeWidth={2} fill="none" />
      ))}
      {PINS.map((p, i) => {
        const on = ROUTES.includes(p.id);
        const color = MATERIALS[p.m as MaterialKey].color;
        return (
          <g key={p.id} transform={`translate(${p.x},${p.y})`}>
            {on && <circle r={9} fill={color} className="pin-pulse" style={{ animationDelay: `${i * 0.2}s` }} />}
            <circle r={on ? 9 : 6.5} fill={color} stroke="#fff" strokeWidth={on ? 2 : 1.4} opacity={on ? 1 : 0.85}><title>{p.name}</title></circle>
          </g>
        );
      })}
      <g transform={`translate(${HOME_XY[0]},${HOME_XY[1]})`}>
        <circle r={14} fill="#1A73E8" opacity={0.25} className="pin-pulse" />
        <circle r={7} fill="#1A73E8" stroke="#fff" strokeWidth={2.5} />
      </g>
      {CITY_LABELS.map(([n, lon, lat]) => {
        const [x, y] = project(lon, lat);
        return <text key={n} x={x + (n === 'Sydney' ? 12 : 9)} y={y + 4} fill="#B6CBB0" fontSize={12} fontFamily="IBM Plex Sans, sans-serif">{n}</text>;
      })}
    </svg>
  );
}

export function Home() {
  const { account } = useAuth();
  const buyerCta = account ? '/marketplace' : '/signup?role=buyer';
  const sellerCta = account ? (account.role === 'seller' ? '/sell/new' : '/marketplace') : '/signup?role=seller';

  return (
    <div className="home">
      <header className="home-nav">
        <div className="wrap nav-inner">
          <Logo to="/" size={26} />
          <nav className="pill-links" aria-label="Sections">
            <a href="#how">How it works</a>
            <a href="#platform">Platform</a>
            <a href="#who">Who it's for</a>
            <a href="#impact">Impact</a>
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
      </header>

      <section className="hero">
        <DotField className="hero-dots" />
        <div className="wrap hero-body">
          <span className="eyebrow">Materials in motion · New South Wales</span>
          <h1>Turn recovered material into tomorrow's feedstock</h1>
          <p className="lede">ResourceX connects recyclers with the manufacturers who need their material. Verified supply, freight-inclusive prices and orders split across partners, so buying recycled is as easy as buying new.</p>
          <div className="hero-cta">
            <Link className="h-btn h-primary" to={buyerCta}>Find recycled supply <ArrowRight size={16} /></Link>
            <Link className="h-btn h-outline-light" to={sellerCta}>List your material</Link>
          </div>
        </div>
        <div className="hero-facts">
          <div className="wrap">
            <div className="fact"><b>6.9%</b><span>of materials used worldwide are recycled</span></div>
            <div className="fact"><b>15%</b><span>COP31 circular-use goal for 2035</span></div>
            <div className="fact"><b>80%</b><span>NSW resource recovery target by 2030</span></div>
          </div>
        </div>
      </section>

      <PartnerStrip />

      <section className="band" id="problem">
        <div className="wrap problem-grid">
          <Reveal><Photo className="problem-photo" name="scrapYard" /></Reveal>
          <Reveal>
            <span className="eyebrow">The problem</span>
            <h2 className="h2-left">The material exists. Buyers can't find it.</h2>
            <ul className="problem-list">
              <li><b>6.9%</b><p><strong>The world is going backwards</strong>Global circular material use fell from 9.1% in 2018 to 6.9% in 2025.</p></li>
              <li><b>80%</b><p><strong>Recovered material needs buyers</strong>NSW aims to recover 80% of waste by 2030, yet recyclers still sell through phone calls and brokers. Manufacturers can't see grade, volume or distance before they ask.</p></li>
              <li><b>A$/t</b><p><strong>Freight decides the deal</strong>A cheaper tonne 600 km away can land dearer than virgin. Without a landed price, buyers default to what they know.</p></li>
            </ul>
            <p className="src">Sources: Circularity Gap Report 2018–2025 (Circle Economy); NSW Waste and Sustainable Materials Strategy 2041.</p>
          </Reveal>
        </div>
      </section>

      <section className="band" id="how" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <Reveal className="center-head">
            <span className="eyebrow">How it works</span>
            <h2>From scrap yard to production line in three steps</h2>
            <p>Producers list what they recover. Manufacturers say what they need. ResourceX handles the matching, the maths and the paperwork trail.</p>
          </Reveal>
          <div className="steps">
            {[
              { n: 1, t: 'List', photo: 'sortingLine' as PhotoKey, p: 'Recyclers publish material, grade, monthly volume, price and yard location in a few minutes.', li: ['ABN and EPA licence checked', 'Pinned on the map by suburb'] },
              { n: 2, t: 'Match', photo: 'copper' as PhotoKey, p: "Manufacturers enter demand and budget. The matching model ranks suppliers on grade, certification, delivery window and price.", li: ['Grade and certification filters', 'Filter by state, starting with NSW'] },
              { n: 3, t: 'Deliver', photo: 'truck' as PhotoKey, p: 'See the landed cost with freight included, then split one order across several partners to hit your volume within budget.', li: ['Truck type, trips and freight per tonne', 'Quote requests to every partner at once'] },
            ].map(s => (
              <Reveal key={s.n} className="step">
                <Photo name={s.photo} />
                <div><span className="step-num">Step {s.n}</span><h3>{s.t}</h3></div>
                <p>{s.p}</p>
                <ul>{s.li.map(x => <li key={x}>{x}</li>)}</ul>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="band product" id="platform">
        <div className="wrap product-grid">
          <Reveal className="product-copy">
            <span className="eyebrow">The platform</span>
            <h2 className="h2-left">One map of recycled supply, priced to your door</h2>
            <p>Every listing shows what it costs once it reaches your site. When no single yard has enough, ResourceX combines several.</p>
            <ul className="feat">
              <li><span className="ic"><MapIcon size={18} /></span><div><b>Live supply map</b><span>Street, satellite, terrain and dark views, filtered by state, material and distance.</span></div></li>
              <li><span className="ic"><Truck size={18} /></span><div><b>Landed cost, not just price</b><span>Rigid, semi-trailer or B-double freight estimated for every route.</span></div></li>
              <li><span className="ic"><Layers3 size={18} /></span><div><b>Combined orders</b><span>Meet a monthly tonnage from several verified partners, optimised for cost or fewest partners.</span></div></li>
              <li><span className="ic"><BadgeCheck size={18} /></span><div><b>Verified businesses</b><span>ABN, licences and certifications shown on every listing.</span></div></li>
            </ul>
          </Reveal>
          <Reveal className="map-card">
            <div className="map-head"><b>Copper · 60 t/month to Wetherill Park</b><span>Sample data</span></div>
            <NswMap />
            <div className="order">
              <h4>Combined order <span>Within budget</span></h4>
              <div className="order-row"><span>Smithfield Cable Recovery</span><span className="num">39 t</span></div>
              <div className="order-row"><span>Hunter Copper Reclaim</span><span className="num">21 t</span></div>
              <div className="bar"><i /></div>
              <div className="order-row"><span>Landed cost</span><span className="num">A$12,852/t</span></div>
              <div className="order-row"><span>vs virgin cathode</span><span className="num good">−15%</span></div>
            </div>
          </Reveal>
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
            <Reveal className="aud">
              <div className="aud-body">
                <span className="aud-icon"><Factory size={22} /></span>
                <span className="eyebrow">Manufacturers</span>
                <h3>Buy recycled with the numbers in front of you</h3>
                <p>Compare grade, certification and landed cost against virgin before you call anyone.</p>
                <ul>
                  {['Set demand and budget once', 'Split orders across verified partners', 'Report CO₂e avoided for every tonne'].map(x => <li key={x}><Check size={16} />{x}</li>)}
                </ul>
                <Link className="h-btn h-outline h-sm" to={buyerCta}>Buy on ResourceX <ArrowRight size={15} /></Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="band impact" id="impact">
        <div className="wrap">
          <Reveal className="center-head">
            <span className="eyebrow">Impact</span>
            <h2>Every tonne traded is a tonne not mined</h2>
            <p>ResourceX counts what is delivered and what it avoids, so councils, buyers and investors can see progress toward the COP31 goal.</p>
          </Reveal>
          <Reveal className="impact-grid">
            <div><b>9.0 t</b><span>CO₂e avoided per tonne of recycled aluminium</span></div>
            <div><b>3.0 t</b><span>CO₂e avoided per tonne of recycled copper</span></div>
            <div><b>1.4 t</b><span>CO₂e avoided per tonne of recycled steel</span></div>
            <div><b>A$/t</b><span>landed cost shown for every route</span></div>
          </Reveal>
          <p className="src">Indicative emissions factors used in the ResourceX prototype. Replace with audited factors before reporting.</p>
        </div>
      </section>

      <section className="band closing">
        <div className="wrap">
          <span className="eyebrow">Get started</span>
          <h2>Make recycled the default choice</h2>
          <p>Create a free account as a buyer or a seller, or explore with a demo account.</p>
          <div className="row">
            <Link className="h-btn h-primary" to={account ? '/marketplace' : '/signup'}>{account ? 'Go to dashboard' : 'Create an account'} <ArrowRight size={16} /></Link>
            {!account && <Link className="h-btn h-outline" to="/login">Try a demo account</Link>}
          </div>
        </div>
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
