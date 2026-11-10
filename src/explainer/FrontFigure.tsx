import { useEffect, useRef, useState } from 'react';
import { MAVIC3_WIDE, footprint } from '../lib/camera';
import { Drone } from './FootprintFigure';
import { COVERAGE_BUCKETS, bucketOf } from './model';
import { progressAt } from './motion';
import { Figure, Num, Slider, Stat, fmt, prefersReducedMotion, useInView } from './ui';

const VW = 720;
const LEFT = 20;
const RIGHT = 20;
const DRONE_Y = 38;
const GROUND = 252;
const BARS_Y = 268;
const BARS_H = 84;
const STRIP_Y = BARS_Y + BARS_H + 12;
const STRIP_H = 26;
const VH = STRIP_Y + STRIP_H + 24;
const FLY_MS = 4200;

export function FrontFigure({ alt, front, setFront }: { alt: number; front: number; setFront: (v: number) => void }) {
  const fp = footprint(MAVIC3_WIDE, alt);
  const H = fp.height;
  const f = front / 100;
  const spacing = H * (1 - f);
  const L = 3 * H;
  const s = (VW - LEFT - RIGHT) / L;
  const X = (m: number) => LEFT + m * s;

  const photos: number[] = [];
  for (let i = 0; i * spacing < L; i++) photos.push(i * spacing);
  const lastCentre = photos[photos.length - 1] + H / 2;

  // null = at rest over the middle of the line; otherwise animation progress 0..1.
  const [progress, setProgress] = useState<number | null>(null);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const fly = () => {
    cancelAnimationFrame(raf.current);
    if (prefersReducedMotion()) return setProgress(null);
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = progressAt(t, t0, FLY_MS);
      setProgress(p);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  // Fly once on its own the first time the figure scrolls into view.
  const [svgRef, inView] = useInView<SVGSVGElement>(0.5);
  const autoplayed = useRef(false);
  useEffect(() => {
    if (inView && !autoplayed.current) {
      autoplayed.current = true;
      fly();
    }
  }, [inView]);

  const resting = progress === null;
  const droneM = resting
    ? (photos[Math.max(1, Math.floor(photos.length / 2))] ?? 0) + H / 2
    : H / 2 + progress * (lastCentre - H / 2);
  // At rest the whole line has been flown; while flying, only photos taken so far count.
  const shown = resting ? photos : photos.filter((p) => p + H / 2 <= droneM + 1e-6);
  const cur = resting ? photos.findIndex((p) => Math.abs(p + H / 2 - droneM) < 1e-6) : shown.length - 1;
  const prev = cur - 1;
  const rows = Math.max(1, Math.ceil(1 / (1 - f) - 1e-9));
  const gap = rows > 6 ? 1.5 : 3;
  const barH = Math.min(14, (BARS_H - (rows - 1) * gap) / rows);

  const edges = [...new Set([0, L, ...shown.flatMap((p) => [p, p + H]).filter((x) => x > 0 && x < L)])].sort((a, b) => a - b);
  const segments = edges.slice(0, -1).map((a, i) => {
    const b = edges[i + 1];
    const m = (a + b) / 2;
    return { a, b, n: shown.filter((p) => p <= m && m < p + H).length };
  });
  const ratio = 1 / (1 - f);
  const lo = Math.floor(ratio + 1e-6);
  const perSpot = Math.abs(ratio - Math.round(ratio)) < 1e-6 ? `${lo}` : `${lo}–${lo + 1}`;

  const overlapA = prev >= 0 ? shown[cur] : 0;
  const overlapB = prev >= 0 ? shown[prev] + H : 0;

  return (
    <Figure
      n={2}
      title="Photos along one flight line, seen from the side"
      caption="Bars below the ground are the photos, staggered across rows so their overlap stays visible. The coloured strip counts how many photos see each spot."
    >
      <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`} className="fig-svg" role="img" aria-label={`At ${front}% front overlap each point is seen by about ${perSpot} photos`}>
        <rect width={VW} height={GROUND} fill="url(#sky2)" />
        <defs>
          <linearGradient id="sky2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--sky-top)" />
            <stop offset="1" stopColor="var(--sky-bottom)" />
          </linearGradient>
        </defs>
        <line x1={0} x2={VW} y1={DRONE_Y} y2={DRONE_Y} className="track" />
        {shown.map((p, i) => (
          <polygon
            key={i}
            points={`${X(p + H / 2)},${DRONE_Y} ${X(p)},${GROUND} ${X(p + H)},${GROUND}`}
            className={(i === cur ? 'cone' : i === prev ? 'cone prev' : 'cone faint') + (resting ? '' : ' fresh')}
          />
        ))}
        {prev >= 0 && overlapB > overlapA && (
          <g>
            <rect x={X(overlapA)} y={GROUND - 6} width={(overlapB - overlapA) * s} height={6} className="overlap-band" />
            <text x={X((overlapA + overlapB) / 2)} y={GROUND - 12} textAnchor="middle" className="label-front halo">
              {front}% shared · {fmt(overlapB - overlapA)} m
            </text>
          </g>
        )}
        {shown.map((p, i) => (
          <circle key={i} cx={X(p + H / 2)} cy={DRONE_Y} r={i === cur ? 0 : 2.5} className="shot" />
        ))}
        {!resting && cur >= 0 && <circle key={`flash-${cur}`} cx={X(shown[cur] + H / 2)} cy={DRONE_Y} r={16} className="shutter" />}
        <Drone x={X(droneM)} y={DRONE_Y - 4} scale={1.2} />
        <rect y={GROUND} width={VW} height={VH - GROUND} className="ground soft" />
        <line x1={0} x2={VW} y1={GROUND} y2={GROUND} className="ground-line" />
        <text x={8} y={DRONE_Y + 18} className="axis-note">
          flying at {alt} m
        </text>

        {shown.map((p, i) => {
          const x0 = Math.max(p, 0);
          const x1 = Math.min(p + H, L);
          return (
            <rect
              key={i}
              x={X(x0)}
              y={BARS_Y + (i % rows) * (barH + gap)}
              width={Math.max(0, (x1 - x0) * s)}
              height={barH}
              rx={Math.min(3, barH / 2)}
              className={(i === cur ? 'bar cur' : i === prev ? 'bar prev' : 'bar') + (resting ? '' : ' grow')}
            />
          );
        })}
        {segments.map((seg, i) => {
          const w = (seg.b - seg.a) * s;
          // Mid-flight, ground ahead of the drone isn't a gap yet; it just hasn't been photographed.
          const pending = !resting && seg.n === 0;
          return (
            <g key={i}>
              <rect x={X(seg.a)} y={STRIP_Y} width={w} height={STRIP_H} fill={pending ? 'var(--rule)' : COVERAGE_BUCKETS[bucketOf(seg.n)].color} />
              {w > 16 && !pending && (
                <text x={X(seg.a) + w / 2} y={STRIP_Y + 17} textAnchor="middle" className={`strip-text ${bucketOf(seg.n) >= 4 ? 'on-dark' : bucketOf(seg.n) <= 1 ? 'on-bright' : ''}`}>
                  {seg.n}
                </text>
              )}
            </g>
          );
        })}
        <text x={LEFT} y={VH - 6} className="axis-note">
          ← start of line
        </text>
        <text x={VW - RIGHT} y={VH - 6} textAnchor="end" className="axis-note">
          {fmt(L)} m shown
        </text>
      </svg>
      <div className="controls">
        <Slider label="Front overlap" value={front} min={0} max={90} unit="%" tone="front" onChange={setFront} />
        <button type="button" className="ghost" onClick={fly}>
          {progress !== null && progress < 1 ? 'Flying…' : '▶ Fly the line'}
        </button>
        <div className="stats">
          <Stat label="Photo every" value={<Num value={spacing} digits={1} />} unit="m" />
          <Stat label="Photos per spot" value={perSpot} note="away from the line ends" />
        </div>
      </div>
    </Figure>
  );
}
