import { useEffect, useMemo, useRef, useState } from 'react';
import { MAVIC3_WIDE, footprint } from '../lib/camera';
import { COVERAGE_BUCKETS, bucketOf, coverage, photoGrid, viewsPerPoint } from './model';
import { Figure, Slider, Stat, fmt } from './ui';

const N = 120;
const WOBBLE = 0.06;

interface Props {
  alt: number;
  front: number;
  side: number;
  wobble: boolean;
  setFront: (v: number) => void;
  setSide: (v: number) => void;
  setWobble: (v: boolean) => void;
}

function cssColor(el: Element, v: string) {
  const name = v.slice(4, -1);
  return getComputedStyle(el).getPropertyValue(name).trim() || '#888';
}

export function CoverageFigure({ alt, front, side, wobble, setFront, setSide, setWobble }: Props) {
  const fp = footprint(MAVIC3_WIDE, alt);
  const view = fp.width * 2.4;
  const { rects, lines } = useMemo(
    () => photoGrid({ W: fp.width, H: fp.height, front: front / 100, side: side / 100, view, wobble: wobble ? WOBBLE : 0 }),
    [fp.width, fp.height, front, side, view, wobble],
  );
  const cov = useMemo(() => coverage(rects, view, N), [rects, view]);
  const [probe, setProbe] = useState({ x: 0.5, y: 0.5 });
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext('2d')!;
    const palette = COVERAGE_BUCKETS.map((b) => cssColor(el, b.color));
    const img = ctx.createImageData(N, N);
    const rgb = palette.map((c) => {
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, 1, 1);
      return ctx.getImageData(0, 0, 1, 1).data;
    });
    for (let i = 0; i < N * N; i++) {
      const c = rgb[bucketOf(cov.counts[i])];
      img.data.set([c[0], c[1], c[2], 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
  }, [cov]);

  const px = probe.x * view;
  const py = probe.y * view;
  const seeing = rects.filter((r) => r.x0 <= px && px <= r.x1 && r.y0 <= py && py <= r.y1);
  const showDots = rects.length < 900;

  const onPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    setProbe({ x: clamp((e.clientX - box.left) / box.width), y: clamp((e.clientY - box.top) / box.height) });
  };

  const theory = viewsPerPoint(front / 100, side / 100);
  const markerSize = view / 70;

  return (
    <Figure
      n={3}
      id="coverage"
      title="Every photo of the survey, seen from above"
      caption={`A ${fmt(view)} m square in the middle of a survey at ${alt} m. Dashed lines are the flight lines. Point anywhere to see the photos that cover it.`}
    >
      <div className="coverage">
        <div className="coverage-map" onPointerMove={onPointer} onPointerDown={onPointer}>
          <canvas ref={canvas} width={N} height={N} />
          <svg viewBox={`0 0 ${view} ${view}`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" className="arrow" />
              </marker>
            </defs>
            {lines.map((x, k) => (
              <line
                key={x}
                x1={x}
                x2={x}
                y1={k % 2 ? 0 : view}
                y2={k % 2 ? view : 0}
                className="flight-line"
                markerEnd="url(#arrow)"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {showDots &&
              rects.map((r, i) => (
                <circle key={i} cx={(r.x0 + r.x1) / 2} cy={(r.y0 + r.y1) / 2} r={markerSize / 4} className="photo-dot" />
              ))}
            {seeing.map((r, i) => (
              <rect key={i} x={r.x0} y={r.y0} width={r.x1 - r.x0} height={r.y1 - r.y0} className="seeing" vectorEffect="non-scaling-stroke" />
            ))}
            <circle cx={px} cy={py} r={markerSize} className="probe" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="probe-tip" style={{ left: `${probe.x * 100}%`, top: `${probe.y * 100}%` }}>
            Seen by <strong>{seeing.length}</strong> {seeing.length === 1 ? 'photo' : 'photos'}
          </div>
        </div>
        <div className="coverage-side">
          <Slider label="Front overlap" value={front} min={0} max={90} unit="%" tone="front" onChange={setFront} />
          <Slider label="Side overlap" value={side} min={0} max={90} unit="%" tone="side" onChange={setSide} />
          <label className="toggle">
            <input type="checkbox" checked={wobble} onChange={(e) => setWobble(e.target.checked)} />
            <span>
              Real-world wobble
              <small>Shift each photo by up to {WOBBLE * 100}% of its footprint (wind, GPS error, timing)</small>
            </span>
          </label>
          <div className="stats stack">
            <Stat label="Photos per spot, average" value={fmt(cov.mean, 1)} note={`formula: 1 ÷ ((1 − ${front}%) × (1 − ${side}%)) = ${fmt(theory, 1)}`} />
            <Stat label="Fewest photos on any spot" value={cov.min} />
            <Stat label="Area seen by fewer than 2" value={fmt(cov.weak * 100, cov.weak > 0 && cov.weak < 0.01 ? 1 : 0)} unit="%" />
          </div>
          <ul className="legend" aria-label="Photos per spot">
            {COVERAGE_BUCKETS.map((b) => (
              <li key={b.label}>
                <span style={{ background: b.color }} />
                {b.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Figure>
  );
}
