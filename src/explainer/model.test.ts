import { describe, expect, it } from 'vitest';
import { bucketOf, coverage, flightOrder, photoGrid, viewsPerPoint } from './model';

const base = { W: 100, H: 75, view: 240, wobble: 0 };

describe('coverage', () => {
  it('matches 1 / ((1 − front)(1 − side)) on average', () => {
    for (const [front, side] of [
      [0.75, 0.6],
      [0.8, 0.7],
      [0.5, 0.5],
    ]) {
      const { rects } = photoGrid({ ...base, front, side });
      const c = coverage(rects, base.view, 200);
      expect(c.mean / viewsPerPoint(front, side)).toBeCloseTo(1, 1);
    }
  });

  it('leaves no gaps on a perfect grid, even with no overlap', () => {
    const { rects } = photoGrid({ ...base, front: 0, side: 0 });
    expect(coverage(rects, base.view, 120).min).toBeGreaterThanOrEqual(1);
  });

  it('opens gaps when photos wobble with little overlap', () => {
    const { rects } = photoGrid({ ...base, front: 0.05, side: 0.05, wobble: 0.06 });
    const c = coverage(rects, base.view, 120);
    expect(c.min).toBe(0);
    expect(c.weak).toBeGreaterThan(0);
  });

  it('only keeps flight lines inside the view', () => {
    const { lines } = photoGrid({ ...base, front: 0.8, side: 0.7 });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every(({ x }) => x >= 0 && x <= base.view)).toBe(true);
  });
});

describe('flightOrder', () => {
  it('flies line by line, alternating direction', () => {
    const { rects } = photoGrid({ ...base, front: 0.8, side: 0.7 });
    const order = flightOrder(rects);
    expect(order).toHaveLength(rects.length);
    for (let i = 1; i < order.length; i++) {
      const [a, b] = [order[i - 1], order[i]];
      expect(b.line).toBeGreaterThanOrEqual(a.line);
      if (a.line === b.line) expect(a.line % 2 === 0 ? b.y0 < a.y0 : b.y0 > a.y0).toBe(true);
    }
  });
});

describe('bucketOf', () => {
  it('maps counts to legend buckets', () => {
    expect([0, 1, 2, 3, 4, 7, 13, 25, 99].map(bucketOf)).toEqual([0, 1, 2, 2, 3, 4, 5, 6, 6]);
  });
});
