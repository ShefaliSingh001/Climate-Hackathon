// Organisations whose data or guidance ResourceX uses. Shown for reference only: no endorsement is implied, and
// the Commonwealth Coat of Arms needs permission before any public use (see public/partners/README.md).
const PARTNERS = [
  { src: '/partners/abn-lookup.webp', w: 1106, h: 190, alt: 'ABN Lookup, Australian Business Register', note: 'Business verification' },
  { src: '/partners/accc.webp', w: 494, h: 168, alt: 'Australian Competition and Consumer Commission', note: 'Consumer law guidance' },
  { src: '/partners/dcceew.webp', w: 834, h: 242, alt: 'Department of Climate Change, Energy, the Environment and Water', note: 'National Waste Policy' },
];

function Row({ hidden }: { hidden?: boolean }) {
  return (
    <ul className="partner-row" aria-hidden={hidden || undefined}>
      {PARTNERS.map(p => (
        <li key={p.src} className="partner">
          <img src={p.src} width={p.w} height={p.h} alt={hidden ? '' : p.alt} loading="lazy" decoding="async" />
          <span>{p.note}</span>
        </li>
      ))}
    </ul>
  );
}

/** Slowly scrolling logo strip. Pauses on hover; static under reduced motion. */
export function PartnerStrip() {
  return (
    <section className="partners" aria-label="Data and guidance sources">
      <div className="wrap partners-head">
        <span className="eyebrow">Data and guidance from</span>
      </div>
      <div className="marquee">
        <div className="marquee-track">
          <Row />
          <Row hidden />
          <Row hidden />
          <Row hidden />
        </div>
      </div>
      <p className="wrap partners-note">Logos identify the public data and guidance ResourceX draws on. They do not imply endorsement by these organisations.</p>
    </section>
  );
}
