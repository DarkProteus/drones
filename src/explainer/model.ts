export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface GridParams {
  /** Footprint across the flight line, metres. */
  W: number;
  /** Footprint along the flight line, metres. */
  H: number;
  /** 0..1 */
  front: number;
  /** 0..1 */
  side: number;
  /** Square view size, metres. */
  view: number;
  /** Max random offset of each photo as a fraction of its footprint; 0 for a perfect grid. */
  wobble: number;
}

export interface PhotoGrid {
  rects: Rect[];
  /** x of each flight line that crosses the view. */
  lines: number[];
}

// Stable pseudo-random value in [0, 1) per photo, so photos don't reshuffle while a slider moves.
function hash(i: number, j: number, k: number): number {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Lawnmower photo footprints around a square view; x runs across the lines, y along them. */
export function photoGrid({ W, H, front, side, view, wobble }: GridParams): PhotoGrid {
  const sx = W * (1 - side);
  const sy = H * (1 - front);
  const rects: Rect[] = [];
  const lines: number[] = [];
  const pad = Math.max(W, H) * (1 + wobble);
  for (let j = Math.floor(-pad / sx); j * sx <= view + pad; j++) {
    const cx = j * sx + sx / 2;
    if (cx >= 0 && cx <= view) lines.push(cx);
    for (let i = Math.floor(-pad / sy); i * sy <= view + pad; i++) {
      const x = cx + (hash(i, j, 1) * 2 - 1) * wobble * W;
      const y = i * sy + sy / 2 + (hash(i, j, 2) * 2 - 1) * wobble * H;
      const r = { x0: x - W / 2, y0: y - H / 2, x1: x + W / 2, y1: y + H / 2 };
      if (r.x1 > 0 && r.x0 < view && r.y1 > 0 && r.y0 < view) rects.push(r);
    }
  }
  return { rects, lines };
}

export interface Coverage {
  counts: Uint16Array;
  n: number;
  min: number;
  mean: number;
  /** Share of cells seen by fewer than two photos, 0..1. */
  weak: number;
}

/** Photos covering the centre of each cell of an n×n grid over the view. */
export function coverage(rects: Rect[], view: number, n: number): Coverage {
  const cell = view / n;
  const w = n + 1;
  const diff = new Int32Array(w * w);
  for (const r of rects) {
    const c0 = Math.max(0, Math.ceil(r.x0 / cell - 0.5));
    const c1 = Math.min(n - 1, Math.floor(r.x1 / cell - 0.5));
    const r0 = Math.max(0, Math.ceil(r.y0 / cell - 0.5));
    const r1 = Math.min(n - 1, Math.floor(r.y1 / cell - 0.5));
    if (c0 > c1 || r0 > r1) continue;
    diff[r0 * w + c0]++;
    diff[r0 * w + c1 + 1]--;
    diff[(r1 + 1) * w + c0]--;
    diff[(r1 + 1) * w + c1 + 1]++;
  }
  const counts = new Uint16Array(n * n);
  let min = Infinity;
  let sum = 0;
  let weak = 0;
  for (let row = 0; row < n; row++) {
    let run = 0;
    for (let col = 0; col < n; col++) {
      run += diff[row * w + col];
      const v = run + (row > 0 ? counts[(row - 1) * n + col] : 0);
      counts[row * n + col] = v;
      min = Math.min(min, v);
      sum += v;
      if (v < 2) weak++;
    }
  }
  return { counts, n, min, mean: sum / (n * n), weak: weak / (n * n) };
}

/** Photos that see an average ground point: 1 / ((1 − front)(1 − side)). */
export const viewsPerPoint = (front: number, side: number) => 1 / ((1 - front) * (1 - side));

export const COVERAGE_BUCKETS = [
  { min: 0, label: 'Gap', color: 'var(--c0)' },
  { min: 1, label: '1', color: 'var(--c1)' },
  { min: 2, label: '2–3', color: 'var(--c2)' },
  { min: 4, label: '4–6', color: 'var(--c3)' },
  { min: 7, label: '7–12', color: 'var(--c4)' },
  { min: 13, label: '13–24', color: 'var(--c5)' },
  { min: 25, label: '25+', color: 'var(--c6)' },
];

export function bucketOf(count: number): number {
  let b = 0;
  for (let i = 0; i < COVERAGE_BUCKETS.length; i++) if (count >= COVERAGE_BUCKETS[i].min) b = i;
  return b;
}
