import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { MAVIC3_WIDE, footprint } from './camera';
import { haversine, makeProjection } from './geo';
import { buildKmz } from './kmz';
import { MAX_WAYPOINTS, type SurveyParams, bestAngle, planSurvey } from './survey';

const origin = { lat: 50, lng: 14 };
const proj = makeProjection(origin);
const rect = (w: number, h: number) =>
  [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ].map(proj.toLatLng);

const base: SurveyParams = {
  altitudeM: 100,
  frontOverlap: 0.8,
  sideOverlap: 0.7,
  angleDeg: 0,
  maxSpeedMs: 8,
  mode: 'interval',
};

describe('footprint', () => {
  it('matches the Mavic 3 ground resolution at 100 m', () => {
    const fp = footprint(MAVIC3_WIDE, 100);
    expect(fp.width).toBeCloseTo(140.8, 1);
    expect(fp.height).toBeCloseTo(105.8, 1);
    expect(fp.gsdCm).toBeCloseTo(2.67, 2);
  });
});

describe('planSurvey', () => {
  it('needs at least three vertices', () => {
    expect(planSurvey(rect(100, 100).slice(0, 2), base)).toBeNull();
  });

  it('lays out a serpentine grid in interval mode', () => {
    const plan = planSurvey(rect(200, 200), base)!;
    // 140.8 m footprint at 70% side overlap is a 42.2 m line spacing.
    expect(plan.lineSpacingM).toBeCloseTo(42.23, 1);
    expect(plan.lineCount).toBe(5);
    expect(plan.waypoints).toHaveLength(10);
    expect(plan.areaM2).toBeCloseTo(40000, -1);

    // Lines run north-south and each is the full 200 m long.
    for (let i = 0; i < plan.waypoints.length; i += 2) {
      const [a, b] = [plan.waypoints[i], plan.waypoints[i + 1]];
      expect(a.lng).toBeCloseTo(b.lng, 9);
      expect(haversine(a, b)).toBeCloseTo(200, 0);
    }
    // Serpentine: each line starts at the end where the previous one finished.
    expect(plan.waypoints[1].lat).toBeCloseTo(plan.waypoints[2].lat, 9);
    expect(plan.distanceM).toBeCloseTo(5 * 200 + 4 * plan.lineSpacingM, 0);
  });

  it('leaves no more than half a line spacing uncovered at the edges', () => {
    const plan = planSurvey(rect(200, 200), base)!;
    const xs = plan.waypoints.map((w) => proj.toXY(w).x);
    expect(Math.min(...xs)).toBeLessThanOrEqual(plan.lineSpacingM / 2 + 1e-6);
    expect(200 - Math.max(...xs)).toBeLessThanOrEqual(plan.lineSpacingM / 2 + 1e-6);
  });

  it('keeps the requested front overlap when choosing interval and speed', () => {
    const plan = planSurvey(rect(200, 200), base)!;
    // 21.2 m photo spacing at 8 m/s: a 2 s interval fits, 3 s would not.
    expect(plan.intervalS).toBe(2);
    expect(plan.speedMs).toBe(8);
    expect(plan.speedMs * plan.intervalS!).toBeLessThanOrEqual(plan.photoSpacingM);

    const low = planSurvey(rect(200, 200), { ...base, altitudeM: 30 })!;
    // 6.3 m spacing is too tight for 8 m/s at the 2 s minimum, so slow down.
    expect(low.intervalS).toBe(2);
    expect(low.speedMs).toBeCloseTo(low.photoSpacingM / 2, 6);
  });

  it('places a photo waypoint no further apart than the photo spacing in waypoint mode', () => {
    const plan = planSurvey(rect(200, 200), { ...base, mode: 'waypoint' })!;
    expect(plan.intervalS).toBeNull();
    expect(plan.waypoints.every((w) => w.takePhoto)).toBe(true);
    expect(plan.photoCount).toBe(plan.waypoints.length);
    const perLine = plan.waypoints.length / plan.lineCount;
    expect(perLine).toBe(Math.ceil(200 / plan.photoSpacingM) + 1);
    expect(haversine(plan.waypoints[0], plan.waypoints[1])).toBeLessThanOrEqual(plan.photoSpacingM + 1e-6);
  });

  it('warns about the waypoint limit, battery and altitude', () => {
    const big = planSurvey(rect(1500, 1500), { ...base, mode: 'waypoint', altitudeM: 130 })!;
    expect(big.waypoints.length).toBeGreaterThan(MAX_WAYPOINTS);
    expect(big.warnings).toHaveLength(3);
    expect(planSurvey(rect(200, 200), base)!.warnings).toHaveLength(0);
  });

  it('rotates lines with the angle', () => {
    const plan = planSurvey(rect(200, 200), { ...base, angleDeg: 90 })!;
    expect(plan.waypoints[0].lat).toBeCloseTo(plan.waypoints[1].lat, 9);
  });
});

describe('bestAngle', () => {
  it('flies along the long side', () => {
    expect(bestAngle(rect(400, 100))).toBe(90);
    expect(bestAngle(rect(100, 400))).toBe(0);
  });
});

describe('buildKmz', () => {
  const files = (mode: SurveyParams['mode']) => {
    const plan = planSurvey(rect(200, 200), { ...base, mode })!;
    const zip = unzipSync(buildKmz(plan, 100, 'goHome'));
    return { plan, zip, waylines: strFromU8(zip['wpmz/waylines.wpml']), template: strFromU8(zip['wpmz/template.kml']) };
  };

  it('packs the two WPML files DJI Fly expects', () => {
    const { zip, waylines, template } = files('interval');
    expect(Object.keys(zip).filter((k) => !k.endsWith('/')).sort()).toEqual(['wpmz/template.kml', 'wpmz/waylines.wpml']);
    for (const xml of [waylines, template]) {
      expect(xml).toContain('<wpml:droneEnumValue>68</wpml:droneEnumValue>');
      expect(xml).toContain('<wpml:finishAction>goHome</wpml:finishAction>');
    }
    expect(waylines).toContain('<wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>');
  });

  it('writes one indexed placemark per waypoint with a nadir gimbal', () => {
    const { plan, waylines } = files('interval');
    expect(waylines.match(/<Placemark>/g)).toHaveLength(plan.waypoints.length);
    const indexes = [...waylines.matchAll(/<wpml:index>(\d+)<\/wpml:index>/g)].map((m) => Number(m[1]));
    expect(indexes).toEqual(plan.waypoints.map((_, i) => i));
    expect(waylines.match(/>gimbalRotate</g)).toHaveLength(plan.waypoints.length);
    expect(waylines).not.toMatch(/<wpml:gimbalPitchRotateAngle>(?!-90<)/);
    expect(waylines).not.toContain('takePhoto');
    expect(waylines.replace(/\s+/g, '')).toContain(
      `<coordinates>${plan.waypoints[0].lng.toFixed(9)},${plan.waypoints[0].lat.toFixed(9)}</coordinates>`,
    );
    expect(waylines).toContain('<wpml:executeHeight>100</wpml:executeHeight>');
  });

  it('follows the structure DJI Fly writes itself', () => {
    const { plan, waylines } = files('interval');
    const last = plan.waypoints.length - 1;
    // One gimbal hold per leg, spanning a waypoint and the next; none starts at the last waypoint.
    const spans = [...waylines.matchAll(/StartIndex>(\d+)<\/wpml:actionGroupStartIndex>\s*<wpml:actionGroupEndIndex>(\d+)</g)]
      .map((m) => [Number(m[1]), Number(m[2])])
      .filter(([start, end]) => start !== end);
    expect(spans).toEqual(Array.from({ length: last }, (_, i) => [i, i + 1]));
    expect(waylines.match(/>gimbalEvenlyRotate</g)).toHaveLength(last);
    // Elements DJI Fly does not write for this aircraft, and totals it leaves at zero.
    expect(waylines).not.toContain('waypointGimbalHeadingParam');
    expect(waylines).toContain('<wpml:distance>0</wpml:distance>');
    expect(waylines).toContain('<wpml:duration>0</wpml:duration>');
    expect(waylines.match(/<wpml:waypointHeadingAngleEnable>1</g)).toHaveLength(plan.waypoints.length);
  });

  it('adds a photo action per waypoint in waypoint mode with unique ids', () => {
    const { plan, waylines } = files('waypoint');
    expect(waylines.match(/>takePhoto</g)).toHaveLength(plan.waypoints.length);
    const groupIds = [...waylines.matchAll(/<wpml:actionGroupId>(\d+)</g)].map((m) => m[1]);
    expect(new Set(groupIds).size).toBe(groupIds.length);
  });

  it('produces balanced XML', () => {
    const { waylines } = files('waypoint');
    const open = waylines.match(/<[A-Za-z][^>]*>/g)!.length;
    const close = waylines.match(/<\/[^>]+>/g)!.length;
    expect(open).toBe(close);
  });
});
