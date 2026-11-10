import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { approach, progressAt } from './motion';

export const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function useReducedMotion() {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/** Tracks a media query live, e.g. a light/dark switch while the page is open. */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
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

/**
 * Glides toward `target`, settling in roughly `ms`. One persistent loop chases the latest target rather than
 * restarting an ease on every change: on phones, touch input and animation frames share a frame, and a restarted
 * ease that sees a frame time earlier than its start extrapolates backwards, compounding every frame.
 */
export function useTween(target: number, ms = 450) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(target);
  const s = useRef({ value: target, target, raf: 0, last: -1 });

  useEffect(() => {
    const st = s.current;
    st.target = target;
    if (reduced) {
      cancelAnimationFrame(st.raf);
      st.raf = 0;
      st.value = target;
      setValue(target);
      return;
    }
    if (st.raf || st.value === target) return;
    const tau = ms / 4;
    st.last = -1;
    const tick = (t: number) => {
      // First frame has no previous timestamp; assume one 60 Hz frame.
      const dt = st.last < 0 ? 1000 / 60 : t - st.last;
      st.last = Math.max(st.last, t);
      st.value = approach(st.value, st.target, dt, tau);
      if (Math.abs(st.target - st.value) <= Math.max(1e-3, Math.abs(st.target) * 1e-4)) {
        st.value = st.target;
        st.raf = 0;
      } else {
        st.raf = requestAnimationFrame(tick);
      }
      setValue(st.value);
    };
    st.raf = requestAnimationFrame(tick);
  }, [target, ms, reduced]);

  useEffect(() => () => cancelAnimationFrame(s.current.raf), []);
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
      const p = progressAt(t, t0, ms);
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
