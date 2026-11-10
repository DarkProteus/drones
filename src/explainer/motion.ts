/**
 * Moves `value` toward `target` by the share of the gap that exponential smoothing covers in `dtMs`.
 * Never overshoots and never moves away, even if frame timestamps run backwards (dt ≤ 0).
 */
export function approach(value: number, target: number, dtMs: number, tauMs: number): number {
  if (!(dtMs > 0)) return value;
  return value + (target - value) * (1 - Math.exp(-dtMs / tauMs));
}

/** Progress of a fixed-length playback, clamped so an early frame timestamp can't extrapolate backwards. */
export const progressAt = (now: number, start: number, ms: number) => Math.min(1, Math.max(0, (now - start) / ms));
