import { describe, expect, it } from 'vitest';
import { approach, progressAt } from './motion';

describe('approach', () => {
  it('converges without overshooting', () => {
    let v = 20;
    for (let i = 0; i < 200; i++) {
      v = approach(v, 150, 8, 100);
      expect(v).toBeGreaterThanOrEqual(20);
      expect(v).toBeLessThanOrEqual(150);
    }
    expect(v).toBeCloseTo(150, 3);
  });

  it('ignores zero or backwards frame times', () => {
    expect(approach(60, 150, 0, 100)).toBe(60);
    expect(approach(60, 150, -4, 100)).toBe(60);
  });

  it('stays bounded when the target changes every frame with early timestamps', () => {
    // A fast touch drag: a new target each frame, frame time a little before the input.
    let v = 60;
    let target = 60;
    let dir = 1;
    let last = 0;
    for (let frame = 1; frame < 2000; frame++) {
      target += dir * 5;
      if (target >= 150 || target <= 20) dir = -dir;
      const t = frame * 8.3 - 2;
      v = approach(v, target, t - last, 100);
      last = t;
      expect(v).toBeGreaterThanOrEqual(20);
      expect(v).toBeLessThanOrEqual(150);
    }
  });
});

describe('progressAt', () => {
  it('clamps to 0..1', () => {
    expect(progressAt(95, 100, 1000)).toBe(0);
    expect(progressAt(600, 100, 1000)).toBe(0.5);
    expect(progressAt(5000, 100, 1000)).toBe(1);
  });
});
