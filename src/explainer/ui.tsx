import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';

export const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

export function useInView<T extends Element>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, inView] as const;
}

const easeOut = (p: number) => 1 - (1 - p) ** 3;

/** Eases toward `target` whenever it changes. */
export function useTween(target: number, ms = 450) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    if (reduced || current.current === target) {
      current.current = target;
      setValue(target);
      return;
    }
    const from = current.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      current.current = from + (target - from) * easeOut(p);
      setValue(current.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduced]);
  return value;
}

/** Runs `progress` from 0 to 1 over `ms` when `play` is called; null when idle. */
export function usePlayback(ms: number) {
  const [progress, setProgress] = useState<number | null>(null);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const play = () => {
    cancelAnimationFrame(raf.current);
    if (prefersReducedMotion()) return setProgress(null);
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setProgress(p < 1 ? p : null);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    setProgress(0);
    raf.current = requestAnimationFrame(tick);
  };
  return [progress, play] as const;
}

/** Number that counts toward new values instead of jumping. */
export function Num({ value, digits = 0 }: { value: number; digits?: number }) {
  return <>{fmt(useTween(value), digits)}</>;
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  tone?: 'front' | 'side' | 'alt';
  onChange: (value: number) => void;
}

export function Slider({ label, value, min, max, step = 1, unit, tone = 'alt', onChange }: SliderProps) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <label className={`slider tone-${tone}`} style={{ '--fill': `${fill}%` } as CSSProperties}>
      <span className="slider-head">
        <span>{label}</span>
        <output>
          {value}
          <small>{unit}</small>
        </output>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function Stat({ label, value, unit, note }: { label: string; value: ReactNode; unit?: string; note?: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value}
        {unit && <small>{unit}</small>}
      </span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}

export function Figure({ id, n, title, children, caption }: { id?: string; n: number; title: string; children: ReactNode; caption?: ReactNode }) {
  return (
    <figure className="figure" id={id}>
      <header className="figure-head">
        <span className="figure-n">Fig. {n}</span>
        <span className="figure-title">{title}</span>
      </header>
      {children}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

// toLocaleString with options builds a new formatter per call, which is slow inside per-frame tweens.
const formatters = new Map<number, Intl.NumberFormat>();
export const fmt = (v: number, digits = 0) => {
  let f = formatters.get(digits);
  if (!f) formatters.set(digits, (f = new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })));
  return f.format(v);
};
