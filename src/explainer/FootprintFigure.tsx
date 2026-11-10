import { useEffect, useRef } from 'react';
import { MAVIC3_WIDE, footprint } from '../lib/camera';
import { Figure, Num, Slider, Stat, fmt, useTween } from './ui';

const W = 560;
const H = 350;
const GROUND = 296;
const K = 1.62; // px per metre
const CX = W / 2;

export function Drone({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g className="drone" transform={`translate(${x} ${y}) scale(${scale})`}>
      <g className="drone-bob">
        <line x1={-15} y1={-3} x2={15} y2={-3} />
        <ellipse cx={-17} cy={-6} rx={9} ry={2.2} className="rotor" />
        <ellipse cx={17} cy={-6} rx={9} ry={2.2} className="rotor" />
        <rect x={-8} y={-6} width={16} height={8} rx={3} className="body" />
        <circle cx={0} cy={4} r={2.6} className="lens" />
      </g>
    </g>
  );
}

function Target({ gsdCm }: { gsdCm: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const scratch = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const size = canvas.width;
    const patchCm = 100;
    // One image pixel per camera pixel, then scaled up without smoothing: far cheaper than a fillRect per block.
    const n = Math.ceil(patchCm / gsdCm);
    const block = size / (patchCm / gsdCm);
    // Odd sub-pixel phase so the pixel grid never lines up neatly with the target, as in a real photo.
    const phase = 0.37 * gsdCm;
    const half = 30;
    // Supersampling only softens block edges; once blocks are a few screen pixels wide, 2×2 looks the same.
    const ss = n > 60 ? 2 : 4;
    const img = new ImageData(n, n);
    const d = img.data;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (let sy = 0; sy < ss; sy++) {
          const y = (j + (sy + 0.5) / ss) * gsdCm - phase - patchCm / 2;
          for (let sx = 0; sx < ss; sx++) {
            const x = (i + (sx + 0.5) / ss) * gsdCm - phase - patchCm / 2;
            if (Math.abs(x) > half || Math.abs(y) > half) {
              r += 118;
              g += 140;
              b += 92;
            } else if (x < 0 === y < 0) {
              r += 24;
              g += 26;
              b += 30;
            } else {
              r += 240;
              g += 240;
              b += 236;
            }
          }
        }
        const k = (j * n + i) * 4;
        d[k] = r / (ss * ss);
        d[k + 1] = g / (ss * ss);
        d[k + 2] = b / (ss * ss);
        d[k + 3] = 255;
      }
    }
    const off = (scratch.current ??= document.createElement('canvas'));
    off.width = n;
    off.height = n;
    off.getContext('2d')!.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, n * block, n * block);
  }, [gsdCm]);
  return <canvas ref={ref} width={240} height={240} className="target" aria-label="A 60 cm ground target as the camera would see it" />;
}

export function FootprintFigure({ alt, setAlt }: { alt: number; setAlt: (v: number) => void }) {
  const fp = footprint(MAVIC3_WIDE, alt);
  // The diagram glides to the new altitude; the stats and target use the exact value.
  const altT = useTween(alt, 380);
  const fpT = footprint(MAVIC3_WIDE, altT);
  const top = GROUND - altT * K;
  const half = (fpT.width * K) / 2;
  const legal = GROUND - 120 * K;
  return (
    <Figure n={1} title="Altitude sets footprint and detail">
      <div className="fig-split">
        <svg viewBox={`0 0 ${W} ${H}`} className="fig-svg" role="img" aria-label={`At ${alt} m the photo covers ${fmt(fp.width)} m of ground`}>
          <defs>
            <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--sky-top)" />
              <stop offset="1" stopColor="var(--sky-bottom)" />
            </linearGradient>
          </defs>
          <rect width={W} height={GROUND} fill="url(#sky)" />
          <rect y={GROUND} width={W} height={H - GROUND} className="ground" />
          <line x1={0} x2={W} y1={legal} y2={legal} className="ref-line" />
          <text x={W - 8} y={legal - 6} textAnchor="end" className="ref-text">
            120 m · common legal ceiling
          </text>
          <polygon points={`${CX},${top} ${CX - half},${GROUND} ${CX + half},${GROUND}`} className="cone" />
          <line x1={CX - half} x2={CX + half} y1={GROUND} y2={GROUND} className="footprint-line" />
          <g className="dim">
            <line x1={36} x2={36} y1={top} y2={GROUND} />
            <line x1={30} x2={42} y1={top} y2={top} />
            <line x1={30} x2={42} y1={GROUND} y2={GROUND} />
            <text x={46} y={(top + GROUND) / 2 + 4}>{Math.round(altT)} m</text>
          </g>
          <g className="dim">
            <line x1={CX - half} x2={CX + half} y1={GROUND + 18} y2={GROUND + 18} />
            <line x1={CX - half} x2={CX - half} y1={GROUND + 12} y2={GROUND + 24} />
            <line x1={CX + half} x2={CX + half} y1={GROUND + 12} y2={GROUND + 24} />
            <text x={CX} y={GROUND + 32} textAnchor="middle" className="halo">
              {fmt(fpT.width)} m on the ground
            </text>
          </g>
          <Drone x={CX} y={top - 4} scale={1.3} />
        </svg>
        <div className="target-box">
          <Target gsdCm={fp.gsdCm} />
          <p className="target-caption">
            A 60&nbsp;cm ground marker, one block per pixel. It spans about{' '}
            <strong>
              <Num value={60 / fp.gsdCm} /> pixels
            </strong>
            .
          </p>
        </div>
      </div>
      <div className="controls">
        <Slider label="Altitude" value={alt} min={20} max={150} step={5} unit="m" onChange={setAlt} />
        <div className="stats">
          <Stat
            label="Footprint"
            value={
              <>
                <Num value={fp.width} /> × <Num value={fp.height} />
              </>
            }
            unit="m"
          />
          <Stat label="Ground sample distance" value={<Num value={fp.gsdCm} digits={2} />} unit="cm/px" />
          <Stat label="Area per photo" value={<Num value={(fp.width * fp.height) / 10000} digits={2} />} unit="ha" />
        </div>
      </div>
    </Figure>
  );
}
