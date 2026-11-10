import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { type Focus, MapView } from './MapView';
import { Slider, Stat } from './explainer/ui';
import { MAVIC3_WIDE } from './lib/camera';
import type { LatLng } from './lib/geo';
import { buildKmz, downloadBytes } from './lib/kmz';
import { type CaptureMode, MAX_WAYPOINTS, bestAngle, planSurvey } from './lib/survey';

const STATE_KEY = 'mission-planner-v1';

interface Settings {
  altitudeM: number;
  frontOverlapPct: number;
  sideOverlapPct: number;
  angleDeg: number;
  maxSpeedMs: number;
  mode: CaptureMode;
  finishAction: 'goHome' | 'noAction';
}

const DEFAULTS: Settings = {
  altitudeM: 80,
  frontOverlapPct: 80,
  sideOverlapPct: 70,
  angleDeg: 0,
  maxSpeedMs: 8,
  mode: 'interval',
  finishAction: 'goHome',
};

function loadState(): { polygon: LatLng[]; settings: Settings } {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null');
    if (s && Array.isArray(s.polygon)) return { polygon: s.polygon, settings: { ...DEFAULTS, ...s.settings } };
  } catch {
    // Corrupt saved state: start fresh.
  }
  return { polygon: [], settings: DEFAULTS };
}

const fmtDistance = (m: number): [string, string] => (m >= 1000 ? [(m / 1000).toFixed(2), 'km'] : [String(Math.round(m)), 'm']);
const fmtArea = (m2: number): [string, string] => (m2 >= 10000 ? [(m2 / 10000).toFixed(2), 'ha'] : [String(Math.round(m2)), 'm²']);
const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function Panel({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h2>
        <span className="num">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

const MODES: { value: CaptureMode; name: string; body: string }[] = [
  { value: 'interval', name: 'Interval timer', body: 'Flies each line non-stop while DJI Fly shoots on a timer. Few waypoints.' },
  { value: 'waypoint', name: 'Photo at each waypoint', body: `Stops for every photo. Slower, max ${MAX_WAYPOINTS} waypoints.` },
];

export function App() {
  const [initial] = useState(loadState);
  const [polygon, setPolygon] = useState<LatLng[]>(initial.polygon);
  const [settings, setSettings] = useState<Settings>(initial.settings);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [query, setQuery] = useState('');
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    localStorage.setItem(STATE_KEY, JSON.stringify({ polygon, settings }));
  }, [polygon, settings]);

  const update = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));

  const plan = useMemo(
    () =>
      planSurvey(polygon, {
        altitudeM: settings.altitudeM,
        frontOverlap: settings.frontOverlapPct / 100,
        sideOverlap: settings.sideOverlapPct / 100,
        angleDeg: settings.angleDeg,
        maxSpeedMs: settings.maxSpeedMs,
        mode: settings.mode,
      }),
    [polygon, settings],
  );

  async function search(e: FormEvent) {
    e.preventDefault();
    setSearchError('');
    const coords = query.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (coords) {
      setFocus({ lat: Number(coords[1]), lng: Number(coords[2]), nonce: Date.now() });
      return;
    }
    if (!query.trim()) return;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`);
      const hits: { lat: string; lon: string }[] = await res.json();
      if (!hits.length) return setSearchError('No place found.');
      setFocus({ lat: Number(hits[0].lat), lng: Number(hits[0].lon), nonce: Date.now() });
    } catch {
      setSearchError('Search failed. Try "lat, lng" instead.');
    }
  }

  function download() {
    if (!plan) return;
    downloadBytes(buildKmz(plan, settings.altitudeM, settings.finishAction), 'survey-mission.kmz', 'application/vnd.google-earth.kmz');
  }

  const overlapHref = `./overlap/?alt=${Math.min(150, settings.altitudeM)}&front=${settings.frontOverlapPct}&side=${settings.sideOverlapPct}`;

  return (
    <div className="app">
      <nav className="topbar">
        <a href="./" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          Survey Mission Planner
        </a>
        <a className="ghost small" href={overlapHref}>
          <span className="wide-only">How overlap works →</span>
          <span className="narrow-only">Overlap guide</span>
        </a>
      </nav>

      <aside className="sidebar">
        <header className="intro">
          <p className="kicker">Mapping flights for DJI Fly</p>
          <h1>Plan a survey mission</h1>
          <p className="dek">
            Draw an area, pick altitude and overlap, and download a waypoint mission for the {MAVIC3_WIDE.name.replace(/ \(.*\)/, '')}.
          </p>
        </header>

        <form className="search" onSubmit={search}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a place or enter lat, lng" aria-label="Find a place" />
          <button type="submit" className="ghost">
            Go
          </button>
        </form>
        {searchError && <p className="error">{searchError}</p>}

        <Panel n={1} title="Survey area">
          <p className="hint">Click the map to add corners in order. Drag a corner to move it; right-click to remove it.</p>
          <div className="row">
            <button type="button" className="ghost small" onClick={() => setPolygon(polygon.slice(0, -1))} disabled={!polygon.length}>
              Undo corner
            </button>
            <button type="button" className="ghost small" onClick={() => setPolygon([])} disabled={!polygon.length}>
              Clear
            </button>
            <span className="hint">{polygon.length} corners</span>
          </div>
        </Panel>

        <Panel n={2} title="Flight settings">
          <div className="sliders">
            <Slider label="Altitude" unit="m" min={20} max={500} value={settings.altitudeM} onChange={(altitudeM) => update({ altitudeM })} />
            <Slider label="Front overlap" unit="%" tone="front" min={50} max={90} value={settings.frontOverlapPct} onChange={(frontOverlapPct) => update({ frontOverlapPct })} />
            <Slider label="Side overlap" unit="%" tone="side" min={30} max={90} value={settings.sideOverlapPct} onChange={(sideOverlapPct) => update({ sideOverlapPct })} />
            <p className="hint">
              Not sure what overlap to pick? <a href={overlapHref}>See how overlap works →</a>
            </p>
            <Slider label="Line direction" unit="°" min={0} max={179} value={settings.angleDeg} onChange={(angleDeg) => update({ angleDeg })} />
            <button type="button" className="ghost small" onClick={() => update({ angleDeg: bestAngle(polygon) })} disabled={polygon.length < 3}>
              Auto direction (fewest lines)
            </button>
            <Slider label="Max speed" unit="m/s" min={1} max={15} step={0.5} value={settings.maxSpeedMs} onChange={(maxSpeedMs) => update({ maxSpeedMs })} />
          </div>

          <fieldset className="modes">
            <legend>Photo capture</legend>
            {MODES.map((m) => (
              <label key={m.value} className={`mode${settings.mode === m.value ? ' active' : ''}`}>
                <input type="radio" name="mode" checked={settings.mode === m.value} onChange={() => update({ mode: m.value })} />
                <span className="mode-name">{m.name}</span>
                <span className="mode-body">{m.body}</span>
              </label>
            ))}
          </fieldset>

          <label className="select">
            <span>When finished</span>
            <select value={settings.finishAction} onChange={(e) => update({ finishAction: e.target.value as Settings['finishAction'] })}>
              <option value="goHome">Return to home</option>
              <option value="noAction">Hover in place</option>
            </select>
          </label>
        </Panel>

        <Panel n={3} title="Plan">
          {!plan ? (
            <p className="hint">Add at least three corners to see the plan.</p>
          ) : (
            <>
              <div className="stats plan-stats" data-testid="stats">
                <Stat label="Area" value={fmtArea(plan.areaM2)[0]} unit={fmtArea(plan.areaM2)[1]} />
                <Stat label="Ground resolution" value={plan.footprint.gsdCm.toFixed(2)} unit="cm/px" />
                <Stat label="Photo footprint" value={`${Math.round(plan.footprint.width)} × ${Math.round(plan.footprint.height)}`} unit="m" />
                <Stat label="Flight lines" value={plan.lineCount} note={`${plan.lineSpacingM.toFixed(1)} m apart`} />
                <Stat label="Waypoints" value={plan.waypoints.length} />
                <Stat label="Photos" value={`~${plan.photoCount}`} />
                <Stat label="Route length" value={fmtDistance(plan.distanceM)[0]} unit={fmtDistance(plan.distanceM)[1]} />
                <Stat label="Speed" value={plan.speedMs.toFixed(1)} unit="m/s" />
                <Stat label="Flight time" value={`~${fmtDuration(plan.durationS)}`} unit="min" />
              </div>
              <p className="hint">Time and length cover the survey route only, not the flight from take-off to the first waypoint and back.</p>

              {plan.intervalS !== null && (
                <p className="callout" data-testid="interval">
                  Before starting the mission in DJI Fly, start <strong>timed shooting every {plan.intervalS} s</strong> in photo mode. Stop it after the last line.
                </p>
              )}
              {plan.warnings.map((w) => (
                <p className="warning" key={w} role="alert">
                  {w}
                </p>
              ))}
              <button type="button" className="primary" onClick={download}>
                Download KMZ
              </button>
            </>
          )}
        </Panel>

        <details className="howto">
          <summary>How to load the KMZ into DJI Fly</summary>
          <p className="hint">DJI Fly has no import button, so the file replaces a placeholder mission. This is a community workaround, not an official DJI feature.</p>
          <ol>
            <li>
              In DJI Fly, with the drone connected, open the waypoint panel from the left of the camera view. Make the map full screen, tap two points on the map and save. This works on the ground; the add-point button only works in flight. Then close DJI Fly completely.
            </li>
            <li>
              Open the controller storage (RC Pro or DJI RC: USB-C to a computer, or the built-in file manager with a microSD card) and go to <code>Android/data/dji.go.v5/files/waypoint/</code>.
            </li>
            <li>Open the newest folder. It holds one <code>.kmz</code> named after the folder.</li>
            <li>Rename the downloaded file to exactly that name and replace the original.</li>
            <li>Reopen DJI Fly and open the mission. The list thumbnail may still show the placeholder until then.</li>
            <li>Check every waypoint, the altitude, speed and signal-lost behaviour before take-off.</li>
          </ol>
          <p className="hint">
            iPhone with RC-N1: Files › On My iPhone › DJI Fly › <code>wayline_mission</code>. Altitudes are relative to the take-off point and the route does not follow terrain.
          </p>
        </details>
      </aside>

      <MapView polygon={polygon} onPolygonChange={setPolygon} plan={plan} focus={focus} />
    </div>
  );
}
