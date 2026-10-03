import { useEffect, useRef } from 'react';

/** Animated grid of dots lifted by slow, overlapping sine waves. Pauses offscreen; static with reduced motion. */
export function DotField({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const GAP = 22;
    const start = performance.now();
    let w = 0, h = 0, raf = 0, visible = true;

    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = (now: number) => {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, w, h);
      for (let y = GAP / 2; y < h + GAP; y += GAP) {
        for (let x = GAP / 2; x < w + GAP; x += GAP) {
          const wave = Math.sin(x * 0.011 + t * 0.55) + Math.sin(y * 0.017 - t * 0.4) + Math.sin((x + y) * 0.007 + t * 0.25);
          const k = (wave + 3) / 6;
          ctx.globalAlpha = 0.06 + k * k * 0.5;
          ctx.fillStyle = k > 0.6 ? '#A8CF6A' : '#E8F0E2';
          ctx.beginPath();
          ctx.arc(x, y + Math.sin(x * 0.009 + t * 0.7) * 5 * k, 0.7 + k * 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      if (!still && visible) raf = requestAnimationFrame(draw);
    };

    size();
    draw(performance.now());
    const onResize = () => { size(); if (still) draw(performance.now()); };
    window.addEventListener('resize', onResize);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible && !still) raf = requestAnimationFrame(draw);
    });
    io.observe(canvas);
    return () => { cancelAnimationFrame(raf); io.disconnect(); window.removeEventListener('resize', onResize); };
  }, []);

  return <canvas ref={ref} className={`dot-field ${className}`} aria-hidden="true" />;
}
