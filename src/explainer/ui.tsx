import type { CSSProperties, ReactNode } from 'react';

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

export const fmt = (v: number, digits = 0) => v.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
