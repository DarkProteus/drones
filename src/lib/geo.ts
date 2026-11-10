export interface LatLng {
  lat: number;
  lng: number;
}

export interface XY {
  x: number;
  y: number;
}

const EARTH_RADIUS_M = 6378137;
const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Local flat projection (x east, y north, metres); accurate enough for survey-sized areas. */
export function makeProjection(origin: LatLng) {
  const cosLat = Math.cos(rad(origin.lat));
  return {
    toXY: (p: LatLng): XY => ({
      x: rad(p.lng - origin.lng) * EARTH_RADIUS_M * cosLat,
      y: rad(p.lat - origin.lat) * EARTH_RADIUS_M,
    }),
    toLatLng: (p: XY): LatLng => ({
      lat: origin.lat + deg(p.y / EARTH_RADIUS_M),
      lng: origin.lng + deg(p.x / (EARTH_RADIUS_M * cosLat)),
    }),
  };
}

export function centroid(points: LatLng[]): LatLng {
  const sum = points.reduce((a, p) => ({ lat: a.lat + p.lat, lng: a.lng + p.lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}

export function haversine(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function pathLength(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversine(points[i - 1], points[i]);
  return total;
}

/** Shoelace area in square metres. */
export function polygonArea(points: XY[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}
