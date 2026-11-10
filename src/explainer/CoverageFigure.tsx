import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { MAVIC3_WIDE, footprint } from '../lib/camera';
import { COVERAGE_BUCKETS, type Rect, bucketOf, coverage, flightOrder, photoGrid, viewsPerPoint } from './model';
import { Figure, Num, Slider, Stat, fmt, useInView, useMediaQuery, usePlayback } from './ui';

const N = 120;
const WOBBLE = 0.06;
const SWEEP_MS = 5200;

interface Props {
  alt: number;
  front: number;
  side: number;
  wobble: boolean;
  setFront: (v: number) => void;
  setSide: (v: number) => void;
  setWobble: (v: boolean) => void;
}

function parseColors(el: HTMLCanvasElement, ctx: CanvasRenderingContext2D, vars: string[]) {
  const style = getComputedStyle(el);
  return vars.map((v) => {
    ctx.fillStyle = style.getPropertyValue(v.slice(4, -1)).trim() || '#888';
    ctx.fillRect(0, 0, 1, 1);
    return ctx.getImageData(0, 0, 1, 1).data.slice(0, 3);
  });
}

export function CoverageFigure({ alt, front, side, wobble, setFront, setSide, setWobble }: Props) {
  const fp = footprint(MAVIC3_WIDE, alt);
  const view = fp.width * 2.4;
  const { rects, lines } = useMemo(
    () => photoGrid({ W: fp.width, H: fp.height, front: front / 100, side: side / 100, view, wobble: wobble ? WOBBLE : 0 }),
    [fp.width, fp.height, front, side, view, wobble],
  );
  const order = useMemo(() => flightOrder(rects), [rects]);

  // Survey playback: photos appear in flight order and the heatmap fills in.
  const [progress, play] = usePlayback(SWEEP_MS);
  const sweeping = progress !== null;
  const exact = sweeping ? progress * order.length : order.length;
  const taken = Math.min(order.length, Math.floor(exact) + (sweeping ? 1 : 0));
  const visible = useMemo(() => (sweeping ? order.slice(0, taken) : rects), [sweeping, order, taken, rects]);
  const cov = useMemo(() => coverage(visible, view, N), [visible, view]);

  const [mapRef, inView] = useInView<HTMLDivElement>(0.45);
  const autoplayed = useRef(false);
  useEffect(() => {
    if (inView && !autoplayed.current) {
      autoplayed.current = true;
      play();
    }
  }, [inView]);

  const [probe, setProbe] = useState({ x: 0.5, y: 0.5 });
  const canvas = useRef<HTMLCanvasElement>(null);
  const dark = useMediaQuery('(prefers-color-scheme: dark)');
  // CSS colours resolved to RGB once per colour scheme; the canvas can't read CSS variables itself.
  const palette = useRef<{ dark: boolean; rgb: Uint8ClampedArray[] } | null>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext('2d')!;
    if (palette.current?.dark !== dark) {
      palette.current = { dark, rgb: parseColors(el, ctx, [...COVERAGE_BUCKETS.map((b) => b.color), 'var(--rule)']) };
    }
    const rgb = palette.current.rgb;
    const img = ctx.createImageData(N, N);
    for (let i = 0; i < N * N; i++) {
      const n = cov.counts[i];
      // Mid-flight, unphotographed ground is "not yet", not a gap.
      const c = sweeping && n === 0 ? rgb[rgb.length - 1] : rgb[bucketOf(n)];
      img.data.set([c[0], c[1], c[2], 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
  }, [cov, sweeping, dark]);

  const px = probe.x * view;
  const py = probe.y * view;
  const seeing = visible.filter((r) => r.x0 <= px && px <= r.x1 && r.y0 <= py && py <= r.y1);
  const showDots = visible.length < 900;

  const onPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    setProbe({ x: clamp((e.clientX - box.left) / box.width), y: clamp((e.clientY - box.top) / box.height) });
  };

  const theory = viewsPerPoint(front / 100, side / 100);
  const markerSize = view / 70;

  // Drone glides between the photo it just took and the next one.
  let drone: { x: number; y: number; r: Rect | null } | null = null;
  if (sweeping && order.length) {
    const i = Math.min(order.length - 1, Math.floor(exact));
    const a = order[i];
    const b = order[Math.min(order.length - 1, i + 1)];
    const f = exact - Math.floor(exact);
    const cx = (r: typeof a) => (r.x0 + r.x1) / 2;
    const cy = (r: typeof a) => (r.y0 + r.y1) / 2;
    drone = { x: cx(a) + (cx(b) - cx(a)) * f, y: cy(a) + (cy(b) - cy(a)) * f, r: a };
  }

  return (
    <Figure
      n={3}
      id="coverage"
      title="Every photo of the survey, seen from above"
      caption={`A ${fmt(view)} m square in the middle of a survey at ${alt} m. Dashed lines are the flight lines. Point anywhere to see the photos that cover it.`}
    >
      <div className="coverage">
        <div className="coverage-map" ref={mapRef} onPointerMove={onPointer} onPointerDown={onPointer}>
          <canvas ref={canvas} width={N} height={N} />
          <svg viewBox={`0 0 ${view} ${view}`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" className="arrow" />
              </marker>
            </defs>
            {lines.map(({ x, line }) => (
              <line
                key={line}
                x1={x}
                x2={x}
                y1={line % 2 === 0 ? view : 0}
                y2={line % 2 === 0 ? 0 : view}
                className="flight-line"
                markerEnd="url(#arrow)"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {showDots &&
              visible.map((r, i) => (
                <circle key={i} cx={(r.x0 + r.x1) / 2} cy={(r.y0 + r.y1) / 2} r={markerSize / 4} className="photo-dot" />
              ))}
            {!sweeping &&
              seeing.map((r, i) => (
                <rect key={i} x={r.x0} y={r.y0} width={r.x1 - r.x0} height={r.y1 - r.y0} className="seeing" vectorEffect="non-scaling-stroke" />
              ))}
            {drone?.r && (
              <rect
                key={taken}
                x={drone.r.x0}
                y={drone.r.y0}
                width={drone.r.x1 - drone.r.x0}
                height={drone.r.y1 - drone.r.y0}
                className="snap"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {drone && (
              <g transform={`translate(${drone.x} ${drone.y}) scale(${view / 260})`} className="map-drone">
                <circle r={9} className="map-drone-halo" />
                <line x1={-5} y1={-5} x2={5} y2={5} />
                <line x1={-5} y1={5} x2={5} y2={-5} />
                {[-5, 5].flatMap((x) => [-5, 5].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r={3.2} className="prop" />))}
                <circle r={3} className="hull" />
              </g>
            )}
            {!sweeping && <circle cx={px} cy={py} r={markerSize} className="probe" vectorEffect="non-scaling-stroke" />}
          </svg>
          {!sweeping && (
            <div
              className="probe-tip"
              style={{ left: `${probe.x * 100}%`, top: `${probe.y * 100}%`, '--px': probe.x, '--below': probe.y < 0.18 ? 1 : 0 } as CSSProperties}
            >
              Seen by <strong>{seeing.length}</strong> {seeing.length === 1 ? 'photo' : 'photos'}
            </div>
          )}
          {sweeping && (
            <div className="sweep-hud">
              Photo {taken} of {order.length}
            </div>
          )}
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
          <button type="button" className="ghost" onClick={play} disabled={sweeping}>
            {sweeping ? 'Flying the survey…' : '▶ Fly the survey'}
          </button>
          <div className="stats stack">
            <Stat
              label="Photos per spot, average"
              value={<Num value={cov.mean} digits={1} />}
              note={`formula: 1 ÷ ((1 − ${front}%) × (1 − ${side}%)) = ${fmt(theory, 1)}`}
            />
            <Stat label="Fewest photos on any spot" value={sweeping ? '…' : cov.min} />
            <Stat
              label="Area seen by fewer than 2"
              value={sweeping ? '…' : <Num value={cov.weak * 100} digits={cov.weak > 0 && cov.weak < 0.01 ? 1 : 0} />}
              unit="%"
            />
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
