import { type Camera, type Footprint, MAVIC3_WIDE, footprint } from './camera';
import { type LatLng, type XY, centroid, makeProjection, pathLength, polygonArea } from './geo';

/**
 * interval: waypoints only at line ends; photos come from DJI Fly's timed shooting.
 * waypoint: one waypoint per photo, each with a take-photo action.
 */
export type CaptureMode = 'interval' | 'waypoint';

export interface SurveyParams {
  altitudeM: number;
  /** Overlap between consecutive photos along a line, 0..1. */
  frontOverlap: number;
  /** Overlap between adjacent lines, 0..1. */
  sideOverlap: number;
  /** Compass bearing of the flight lines, degrees. */
  angleDeg: number;
  maxSpeedMs: number;
  mode: CaptureMode;
}

export interface Waypoint extends LatLng {
  takePhoto: boolean;
}

export interface SurveyPlan {
  waypoints: Waypoint[];
  lineCount: number;
  footprint: Footprint;
  lineSpacingM: number;
  photoSpacingM: number;
  areaM2: number;
  distanceM: number;
  durationS: number;
  speedMs: number;
  /** Timed-shot interval to set in DJI Fly; null in waypoint mode. */
  intervalS: number | null;
  photoCount: number;
  warnings: string[];
}

// Timed-shot intervals offered by DJI Fly; confirm against the app before flying.
export const PHOTO_INTERVALS_S = [2, 3, 5, 7, 10, 15, 20, 30, 60];
export const MAX_WAYPOINTS = 200;
// Rough allowance for braking, turning and accelerating at each waypoint.
const STOP_PENALTY_S = 3;
const BATTERY_WARN_S = 25 * 60;
const ALTITUDE_WARN_M = 120;

interface Line {
  v: number;
  u0: number;
  u1: number;
}

function basis(angleDeg: number) {
  const t = (angleDeg * Math.PI) / 180;
  // d runs along the flight lines, n across them.
  return { d: { x: Math.sin(t), y: Math.cos(t) }, n: { x: Math.cos(t), y: -Math.sin(t) } };
}

function crossExtent(points: XY[], angleDeg: number): { min: number; max: number } {
  const { n } = basis(angleDeg);
  const vs = points.map((p) => p.x * n.x + p.y * n.y);
  return { min: Math.min(...vs), max: Math.max(...vs) };
}

/** Line bearing that needs the fewest passes: the one the polygon is narrowest across. */
export function bestAngle(polygon: LatLng[]): number {
  if (polygon.length < 3) return 0;
  const proj = makeProjection(centroid(polygon));
  const pts = polygon.map(proj.toXY);
  let best = 0;
  let bestWidth = Infinity;
  for (let a = 0; a < 180; a++) {
    const e = crossExtent(pts, a);
    if (e.max - e.min < bestWidth - 1e-9) {
      bestWidth = e.max - e.min;
      best = a;
    }
  }
  return best;
}

function pickInterval(photoSpacingM: number, maxSpeedMs: number): { intervalS: number; speedMs: number } {
  // Longest interval that still keeps the requested overlap at full speed; otherwise slow down.
  const fits = PHOTO_INTERVALS_S.filter((i) => i * maxSpeedMs <= photoSpacingM);
  const intervalS = fits.length ? fits[fits.length - 1] : PHOTO_INTERVALS_S[0];
  return { intervalS, speedMs: Math.min(maxSpeedMs, photoSpacingM / intervalS) };
}

export function planSurvey(polygon: LatLng[], params: SurveyParams, cam: Camera = MAVIC3_WIDE): SurveyPlan | null {
  if (polygon.length < 3) return null;

  const proj = makeProjection(centroid(polygon));
  const pts = polygon.map(proj.toXY);
  const fp = footprint(cam, params.altitudeM);
  const lineSpacingM = fp.width * (1 - params.sideOverlap);
  const photoSpacingM = fp.height * (1 - params.frontOverlap);
  if (!(lineSpacingM > 0) || !(photoSpacingM > 0) || !(params.maxSpeedMs > 0)) return null;

  const { d, n } = basis(params.angleDeg);
  const uv = pts.map((p) => ({ u: p.x * d.x + p.y * d.y, v: p.x * n.x + p.y * n.y }));
  const extent = crossExtent(pts, params.angleDeg);
  const width = extent.max - extent.min;
  const lineCount = Math.max(1, Math.ceil(width / lineSpacingM));
  // Centre the lines so the uncovered margin is equal on both sides.
  const v0 = extent.min + (width - (lineCount - 1) * lineSpacingM) / 2;

  const lines: Line[] = [];
  for (let k = 0; k < lineCount; k++) {
    const v = v0 + k * lineSpacingM;
    const us: number[] = [];
    for (let i = 0; i < uv.length; i++) {
      const a = uv[i];
      const b = uv[(i + 1) % uv.length];
      if ((a.v <= v && b.v > v) || (b.v <= v && a.v > v)) {
        us.push(a.u + ((v - a.v) / (b.v - a.v)) * (b.u - a.u));
      }
    }
    // For concave shapes this spans the outermost crossings, flying over any notch.
    if (us.length >= 2) lines.push({ v, u0: Math.min(...us), u1: Math.max(...us) });
  }
  if (!lines.length) return null;

  const toLatLng = (u: number, v: number) => proj.toLatLng({ x: u * d.x + v * n.x, y: u * d.y + v * n.y });

  const { intervalS, speedMs } =
    params.mode === 'interval'
      ? pickInterval(photoSpacingM, params.maxSpeedMs)
      : { intervalS: null, speedMs: params.maxSpeedMs };

  const waypoints: Waypoint[] = [];
  let photoCount = 0;
  lines.forEach((line, k) => {
    const [from, to] = k % 2 === 0 ? [line.u0, line.u1] : [line.u1, line.u0];
    const length = Math.abs(to - from);
    if (intervalS !== null) {
      waypoints.push({ ...toLatLng(from, line.v), takePhoto: false }, { ...toLatLng(to, line.v), takePhoto: false });
      photoCount += Math.floor(length / (speedMs * intervalS)) + 1;
    } else {
      const segments = Math.max(1, Math.ceil(length / photoSpacingM));
      for (let i = 0; i <= segments; i++) {
        waypoints.push({ ...toLatLng(from + ((to - from) * i) / segments, line.v), takePhoto: true });
      }
      photoCount += segments + 1;
    }
  });

  const distanceM = pathLength(waypoints);
  const durationS = distanceM / speedMs + waypoints.length * STOP_PENALTY_S;

  const warnings: string[] = [];
  if (waypoints.length > MAX_WAYPOINTS) {
    warnings.push(
      `${waypoints.length} waypoints exceeds DJI Fly's reported limit of ${MAX_WAYPOINTS}. ` +
        (params.mode === 'waypoint'
          ? 'Switch to interval capture, reduce overlap, fly higher, or split the area.'
          : 'Reduce side overlap, fly higher, or split the area.'),
    );
  }
  if (durationS > BATTERY_WARN_S) {
    warnings.push('Estimated flight time is over 25 minutes; this likely needs more than one battery. Split the area.');
  }
  if (params.altitudeM > ALTITUDE_WARN_M) {
    warnings.push(`Altitude is above ${ALTITUDE_WARN_M} m, the legal ceiling in many regions.`);
  }

  return {
    waypoints,
    lineCount: lines.length,
    footprint: fp,
    lineSpacingM,
    photoSpacingM,
    areaM2: polygonArea(pts),
    distanceM,
    durationS,
    speedMs,
    intervalS,
    photoCount,
    warnings,
  };
}
