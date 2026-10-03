// Scroll motion for the homepage: reveals, count-ups, a light parallax and the nav's scroll state.
// Everything is transform/opacity only, runs once, and is skipped when motion is reduced
// (device setting or Settings → Reduce animations). Content is always visible without JS.
import { createElement, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { prefersReducedMotion } from '../../state/settings';

type Variant = 'up' | 'left' | 'right' | 'fade';

/** Calls `onEnter` once when the element scrolls into view (or straight away if it already is). */
function useEnter<T extends HTMLElement>(onEnter: (el: T) => void, onHide: (el: T) => void, threshold = 0.15) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) { onEnter(el); return; }
    onHide(el);
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { onEnter(el); io.disconnect(); } }, { threshold });
    io.observe(el);
    // Safety net: never leave content hidden (e.g. full-page screenshots that don't scroll).
    const fallback = setTimeout(() => { onEnter(el); io.disconnect(); }, 4000);
    return () => { io.disconnect(); clearTimeout(fallback); };
  }, []);
  return ref;
}

interface RevealProps {
  children: ReactNode;
  className?: string;
  id?: string;
  as?: 'div' | 'ul';
  variant?: Variant;
  /** ms before this block starts. */
  delay?: number;
  /** Reveal direct children one after another. */
  stagger?: boolean;
}

/** Fades and slides a block in as it scrolls into view. */
export function Reveal({ children, className = '', id, as = 'div', variant = 'up', delay = 0, stagger }: RevealProps) {
  const ref = useEnter<HTMLElement>(
    el => el.classList.remove('pending'),
    el => {
      if (stagger) Array.from(el.children).forEach((c, i) => (c as HTMLElement).style.setProperty('--i', String(i)));
      el.classList.add('pending');
    },
  );
  return createElement(as, {
    ref, id,
    className: `reveal r-${variant}${stagger ? ' stagger' : ''} ${className}`,
    style: delay ? ({ '--d': `${delay}ms` } as CSSProperties) : undefined,
  }, children);
}

/** Counts up to `value` once it scrolls into view. Renders the final value until then, so nothing is wrong without JS. */
export function CountUp({ value, decimals = 0, prefix = '', suffix = '', duration = 1300 }: { value: number; decimals?: number; prefix?: string; suffix?: string; duration?: number }) {
  const [shown, setShown] = useState(value);
  const raf = useRef(0);
  const ref = useEnter<HTMLSpanElement>(
    () => {
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        setShown(value * (1 - Math.pow(1 - t, 3)));
        if (t < 1) raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    },
    () => setShown(0),
    0.4,
  );
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return <span ref={ref} className="count-up" aria-label={`${prefix}${value.toFixed(decimals)}${suffix}`}><span aria-hidden="true">{prefix}{shown.toFixed(decimals)}{suffix}</span></span>;
}

/**
 * Page-level scroll effects, one rAF-throttled listener:
 * - `scrolled` once the page moves (nav turns solid),
 * - `--progress` (0–1) on the nav for the reading bar,
 * - `--py` on [data-parallax] elements (a few px of drift),
 * - the id of the section in view, for the nav's active link.
 */
export function useScrollFx(navRef: React.RefObject<HTMLElement | null>, sectionIds: string[]) {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    let frame = 0;
    const reduced = prefersReducedMotion();
    const parallax = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]'));
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setScrolled(y > 24);
      navRef.current?.style.setProperty('--progress', String(max > 0 ? Math.min(1, y / max) : 0));
      if (!reduced) {
        for (const el of parallax) {
          const r = el.getBoundingClientRect();
          const centre = Math.max(-1, Math.min(1, (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight)); // -1…1 around the viewport centre
          el.style.setProperty('--py', `${(centre * -Number(el.dataset.parallax || 24)).toFixed(1)}px`);
        }
      }
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(frame); };
  }, []);

  useEffect(() => {
    const els = sectionIds.map(id => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (!els.length || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
    }, { rootMargin: '-45% 0px -50% 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [sectionIds.join()]);

  return { scrolled, active };
}
