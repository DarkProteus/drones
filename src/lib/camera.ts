export interface Camera {
  name: string;
  sensorWidthMm: number;
  sensorHeightMm: number;
  focalLengthMm: number;
  imageWidthPx: number;
  imageHeightPx: number;
}

// Mavic 3 / Mavic 3 Classic main Hasselblad camera, 4:3 stills.
export const MAVIC3_WIDE: Camera = {
  name: 'Mavic 3 Hasselblad (24 mm eq.)',
  sensorWidthMm: 17.3,
  sensorHeightMm: 13,
  focalLengthMm: 12.29,
  imageWidthPx: 5280,
  imageHeightPx: 3956,
};

export interface Footprint {
  /** Ground coverage across the flight line, metres. */
  width: number;
  /** Ground coverage along the flight line, metres. */
  height: number;
  /** Ground sample distance, cm per pixel. */
  gsdCm: number;
}

/** Ground footprint of a nadir photo, with the long sensor side across the flight line. */
export function footprint(cam: Camera, altitudeM: number): Footprint {
  const width = (cam.sensorWidthMm * altitudeM) / cam.focalLengthMm;
  const height = (cam.sensorHeightMm * altitudeM) / cam.focalLengthMm;
  return { width, height, gsdCm: (width / cam.imageWidthPx) * 100 };
}
