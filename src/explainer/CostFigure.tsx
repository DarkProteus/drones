import { useMemo } from 'react';
import { makeProjection } from '../lib/geo';
import { planSurvey } from '../lib/survey';
import { Figure, Stat, fmt } from './ui';

const SIDE_M = Math.sqrt(100_000); // 10 ha square
const MAX_SPEED = 8; // the planner's default
const proj = makeProjection({ lat: 50, lng: 10 });
const FIELD = [
  { x: 0, y: 0 },
  { x: SIDE_M, y: 0 },
  { x: SIDE_M, y: SIDE_M },
  { x: 0, y: SIDE_M },
].map(proj.toLatLng);
const XS = Array.from({ length: 21 }, (_, i) => 50 + i * 2);

function run(alt: number, front: number, side: number) {
  const plan = planSurvey(FIELD, {
    altitudeM: alt,
    frontOverlap: front / 100,
    sideOverlap: side / 100,
    angleDeg: 0,
    maxSpeedMs: MAX_SPEED,
    mode: 'interval',
  });
  return plan ? { minutes: plan.durationS / 60, photos: plan.photoCount, lines: plan.lineCount, speed: plan.speedMs } : null;
}

type Pt = [number, number];

function Chart({ title, unit, front, side, current }: { title: string; unit: string; front: Pt[]; side: Pt[]; current: { f: Pt; s: Pt } }) {
  const w = 340;
  const h = 200;
  const m = { l: 40, r: 12, t: 12, b: 28 };
  const max = Math.max(...front.map((p) => p[1]), ...side.map((p) => p[1]), current.f[1], current.s[1]);
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const X = (x: number) => m.l + ((x - 50) / 40) * (w - m.l - m.r);
  const Y = (y: number) => h - m.b - (y / top) * (h - m.t - m.b);
  const path = (pts: Pt[]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join('');
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  return (
    <div className="chart">
      <h4>
        {title} <small>{unit}</small>
      </h4>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${title} as overlap changes`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={w - m.r} y1={Y(t)} y2={Y(t)} className="gridline" />
            <text x={m.l - 6} y={Y(t) + 4} textAnchor="end" className="tick">
              {fmt(t)}
            </text>
          </g>
        ))}
        {[50, 60, 70, 80, 90].map((x) => (
          <text key={x} x={X(x)} y={h - 8} textAnchor="middle" className="tick">
            {x}%
          </text>
        ))}
        <path d={path(side)} className="series side" />
        <path d={path(front)} className="series front" />
        {current.s[0] >= 50 && <circle cx={X(current.s[0])} cy={Y(current.s[1])} r={5} className="dot side" />}
        {current.f[0] >= 50 && <circle cx={X(current.f[0])} cy={Y(current.f[1])} r={5} className="dot front" />}
      </svg>
    </div>
  );
}

function niceStep(raw: number) {
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export function CostFigure({ alt, front, side }: { alt: number; front: number; side: number }) {
  const data = useMemo(() => {
    const byFront = XS.map((x) => [x, run(alt, x, side)] as const);
    const bySide = XS.map((x) => [x, run(alt, front, x)] as const);
    return { byFront, bySide, now: run(alt, front, side) };
  }, [alt, front, side]);
  const pick = (rows: typeof data.byFront, key: 'minutes' | 'photos'): Pt[] => rows.flatMap(([x, r]) => (r ? [[x, r[key]] as Pt] : []));
  const now = data.now;
  if (!now) return null;
  const cur = (key: 'minutes' | 'photos') => ({ f: [front, now[key]] as Pt, s: [side, now[key]] as Pt });

  return (
    <Figure
      n={4}
      title="The bill for a 10-hectare field"
      caption={`Computed with the Survey Mission Planner's own route logic: a ${fmt(SIDE_M)} m square at ${alt} m, timed shooting, ${MAX_SPEED} m/s maximum speed. Time covers the survey lines only.`}
    >
      <div className="chart-key">
        <span className="key front">Changing front overlap (side fixed at {side}%)</span>
        <span className="key side">Changing side overlap (front fixed at {front}%)</span>
      </div>
      <div className="charts">
        <Chart title="Flight time" unit="minutes" front={pick(data.byFront, 'minutes')} side={pick(data.bySide, 'minutes')} current={cur('minutes')} />
        <Chart title="Photos" unit="count" front={pick(data.byFront, 'photos')} side={pick(data.bySide, 'photos')} current={cur('photos')} />
      </div>
      <div className="stats">
        <Stat label="Flight time" value={fmt(now.minutes, 1)} unit="min" note={now.minutes > 25 ? 'likely needs a second battery' : 'likely one battery'} />
        <Stat label="Photos" value={fmt(now.photos)} />
        <Stat label="Flight lines" value={now.lines} />
        <Stat label="Speed" value={fmt(now.speed, 1)} unit="m/s" note={now.speed < MAX_SPEED - 0.05 ? 'slowed down to keep overlap' : 'full speed'} />
      </div>
    </Figure>
  );
}
