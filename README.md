# Survey Mission Planner for DJI Mavic 3

A browser app that turns a polygon drawn on a map into a mapping (photogrammetry) flight for the consumer
DJI Mavic 3 / Mavic 3 Classic, exported as a DJI Fly waypoint mission (`.kmz`).

- Draw the survey area, set altitude and photo overlap.
- Get the lawnmower flight lines, ground resolution, photo count, route length and estimated flight time.
- Download a KMZ in DJI's WPML format and load it into DJI Fly.

Everything runs in the browser; there is no backend.

## Run it

```sh
pnpm install
pnpm dev      # development server
pnpm test     # unit tests
pnpm build    # static build in dist/
```

Pushing to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`. Enable it once under
**Settings → Pages → Source: GitHub Actions**.

## Capture modes

| Mode | Waypoints | How photos are taken |
| --- | --- | --- |
| **Interval timer** (default) | Two per flight line | The drone flies each line without stopping. You start timed shooting in DJI Fly before the mission; the app tells you the interval and sets the speed to match the overlap. |
| **Photo at each waypoint** | One per photo | The drone stops at every waypoint and takes a photo. Slower, and limited by DJI Fly's reported 200-waypoint cap. |

## Loading the KMZ into DJI Fly

DJI Fly has no import button. The file replaces a placeholder mission. This is a community workaround, not an
official DJI feature, and it can change between DJI Fly versions.

1. In DJI Fly, with the drone connected, open the waypoint panel from the left of the camera view. Make the map
   full screen, tap two points on the map and save. This works on the ground; the add-point button only works in
   flight. Close DJI Fly completely.
2. Open the mission folder on the device that runs DJI Fly:
   - **DJI RC Pro / DJI RC**: `Android/data/dji.go.v5/files/waypoint/`. Connect the controller to a computer over
     USB-C, or copy the KMZ to a microSD card and use the controller's file manager. On Windows the folder is
     sometimes hidden; Android File Transfer on a Mac or the microSD route are the usual alternatives.
   - **RC-N1 with an Android phone**: the same path on the phone. Recent Android versions hide `Android/data`
     from most file managers, so a computer over USB is the easiest way in.
   - **RC-N1 with an iPhone**: Files › On My iPhone › DJI Fly › `wayline_mission`.
3. Open the newest folder. It is named with a UUID and holds one `.kmz` with the same name.
4. Rename the downloaded file to exactly that name and replace the original.
5. Reopen DJI Fly and open the mission. The thumbnail in the list may still show the placeholder until you do.
6. Do not edit and re-save the mission in DJI Fly unless you intend to; if the route changes, replace the file
   again.

## Before you fly

The export has not been validated on an aircraft yet. Treat the first flight as a test: use a small area, keep
line of sight, and be ready to take over.

- Check every waypoint, the altitude, the speed and the signal-lost behaviour in DJI Fly before take-off.
- Altitudes are relative to the take-off point. The route does not follow terrain and knows nothing about
  obstacles.
- Flight time covers the survey route only, not the transit from take-off and back, and is an estimate.
- You are responsible for airspace rules, altitude limits and permissions where you fly.

## How it works

- `src/lib/camera.ts` — Mavic 3 camera constants and the ground footprint / resolution formulas.
- `src/lib/survey.ts` — flight line generation, interval and speed selection, statistics and warnings.
- `src/lib/wpml.ts` — `template.kml` and `waylines.wpml` in the dialect DJI Fly writes.
- `src/lib/kmz.ts` — zips both files into the KMZ.
- `src/App.tsx`, `src/MapView.tsx` — the UI and the Leaflet map.

The WPML output follows a two-point mission written by DJI Fly itself for a Mavic 3 on a DJI RC Pro. Two things
that file could not show come from open-source tools that target DJI Fly
([DJIMapping](https://github.com/marcoparatore/DJIMapping), [drone-tm](https://github.com/hotosm/drone-tm) and
[RC-2-Missions](https://github.com/fm75/RC-2-Missions)): the straight-line turn mode, since DJI Fly defaults to
curved paths, and the take-photo action. The import steps follow the
[Litchi Utilities guide](https://www.litchiutilities.com/docs/import.php).
