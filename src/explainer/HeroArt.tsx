import { memo, useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from './ui';

// Banner scene, in SVG units. The drone flies horizontal lines; footprints are 75% front / 60% side.
const VW = 1040;
const VH = 300;
const FW = 84; // along the line
const FH = 110; // across the line
const SX = FW * (1 - 0.75);
const SY = FH * (1 - 0.6);
const SPEED = 430; // units per second
const TURN_S = 0.55;
const HOLD_S = 2.4;
const FADE_S = 0.9;

const LINES: number[] = [];
for (let y = 12; y < VH + SY / 2; y += SY) LINES.push(y);
const X0 = -FW / 2;
const X1 = VW + FW / 2;
const LINE_S = (X1 - X0) / SPEED;
const PER_LINE = Math.floor((X1 - X0) / SX) + 1;
const LEG_S = LINE_S + TURN_S;
const FLY_S = LINES.length * LEG_S;
const CYCLE_S = FLY_S + HOLD_S + FADE_S;

const PHOTOS = LINES.flatMap((y, l) =>
  Array.from({ length: PER_LINE }, (_, i) => ({ x: l % 2 === 0 ? X0 + i * SX : X1 - i * SX, y })),
);

function droneAt(t: number) {
  const l = Math.min(LINES.length - 1, Math.floor(t / LEG_S));
  const u = Math.min(t - l * LEG_S, LEG_S);
  const forward = l % 2 === 0;
  if (u <= LINE_S || l === LINES.length - 1) {
    const d = Math.min(u, LINE_S) * SPEED;
    return { x: forward ? X0 + d : X1 - d, y: LINES[l], taken: l * PER_LINE + Math.min(PER_LINE, Math.floor(d / SX) + 1), heading: forward ? 1 : -1 };
  }
  // U-turn just outside the frame.
  const p = (u - LINE_S) / TURN_S;
  const x = forward ? X1 + Math.sin(p * Math.PI) * 30 : X0 - Math.sin(p * Math.PI) * 30;
  return { x, y: LINES[l] + (LINES[l + 1] - LINES[l]) * (1 - Math.cos(p * Math.PI)) / 2, taken: (l + 1) * PER_LINE, heading: forward ? 1 : -1 };
}

const Stamps = memo(function Stamps({ n }: { n: number }) {
  return (
    <>
      {PHOTOS.slice(0, n).map((p, i) => (
        <rect key={i} className="stamp" x={p.x - FW / 2} y={p.y - FH / 2} width={FW} height={FH} rx={3} />
      ))}
    </>
  );
});

export function HeroArt() {
  const reduced = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>(0.05);
  const [t, setT] = useState(reduced ? FLY_S : 0);
  const clock = useRef(0);

  useEffect(() => {
    if (reduced || !inView) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // Clamp the step so a backgrounded tab doesn't jump ahead.
      clock.current = (clock.current + Math.min(0.1, (now - last) / 1000)) % CYCLE_S;
      last = now;
      setT(clock.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, inView]);

  const flying = Math.min(t, FLY_S);
  const d = reduced ? { x: VW * 0.62, y: LINES[3], taken: PHOTOS.length, heading: 1 } : droneAt(flying);
  const fade = t > FLY_S + HOLD_S ? 1 - (t - FLY_S - HOLD_S) / FADE_S : 1;
  const done = t >= FLY_S;

  return (
    <div className="hero-art" ref={ref} aria-hidden="true">
      <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="rows" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(28)">
            <line x1="0" y1="0" x2="0" y2="9" className="crop-row" />
          </pattern>
          <pattern id="rows2" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-62)">
            <line x1="0" y1="0" x2="0" y2="7" className="crop-row" />
          </pattern>
        </defs>
        <rect width={VW} height={VH} className="land" />
        <polygon points="0,0 360,0 300,140 0,175" className="field f1" />
        <polygon points="0,0 360,0 300,140 0,175" fill="url(#rows)" />
        <polygon points="420,0 760,0 700,120 470,160" className="field f2" />
        <polygon points="760,0 1040,0 1040,150 840,190 700,120" className="field f3" />
        <polygon points="760,0 1040,0 1040,150 840,190 700,120" fill="url(#rows2)" />
        <polygon points="0,215 280,195 360,300 0,300" className="field f2" />
        <polygon points="560,230 860,215 900,300 520,300" className="field f1" />
        <polygon points="560,230 860,215 900,300 520,300" fill="url(#rows2)" />
        {[
          [470, 205, 16],
          [498, 222, 12],
          [455, 238, 13],
          [930, 250, 18],
          [962, 228, 12],
          [395, 75, 11],
        ].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} className="tree" />
        ))}
        <path d="M-10 186 C 180 160, 360 236, 560 196 S 880 150, 1050 190" className="road" />

        <g style={{ opacity: Math.max(0, fade) }}>
          <Stamps n={d.taken} />
        </g>
        {!done && !reduced && (
          <g>
            <rect x={d.x - FW / 2} y={d.y - FH / 2} width={FW} height={FH} rx={3} className="live-frame" />
            <circle key={d.taken} cx={d.x} cy={d.y} r={14} className="shutter" />
          </g>
        )}
        <g transform={`translate(${d.x} ${d.y}) rotate(${d.heading > 0 ? 0 : 180})`}>
          <g className="drone-top">
            <line x1={-11} y1={-11} x2={11} y2={11} />
            <line x1={-11} y1={11} x2={11} y2={-11} />
            {[
              [-11, -11],
              [11, -11],
              [-11, 11],
              [11, 11],
            ].map(([x, y]) => (
              <circle key={`${x}${y}`} cx={x} cy={y} r={7.5} className="prop" />
            ))}
            <rect x={-7} y={-5} width={14} height={10} rx={3} className="hull" />
            <circle cx={6} cy={0} r={2} className="eye" />
          </g>
        </g>
      </svg>
      <div className="hero-hud">
        <span>
          <i className="dot-front" /> Front 75%
        </span>
        <span>
          <i className="dot-side" /> Side 60%
        </span>
        <span className="hud-count">{Math.min(d.taken, PHOTOS.length)} photos</span>
      </div>
    </div>
  );
}
