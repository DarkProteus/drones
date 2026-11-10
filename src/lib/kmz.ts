import { strToU8, zipSync } from 'fflate';
import type { SurveyPlan } from './survey';
import { type MissionOptions, buildTemplate, buildWaylines } from './wpml';

export function buildKmz(plan: SurveyPlan, altitudeM: number, finishAction: MissionOptions['finishAction']): Uint8Array {
  const options: MissionOptions = {
    altitudeM,
    speedMs: plan.speedMs,
    gimbalPitchDeg: -90,
    finishAction,
  };
  return zipSync({
    wpmz: {
      'template.kml': strToU8(buildTemplate(options)),
      'waylines.wpml': strToU8(buildWaylines(plan.waypoints, options)),
    },
  });
}

export function downloadBytes(bytes: Uint8Array, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
