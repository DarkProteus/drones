import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { type Focus, MapView } from './MapView';
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

const fmtDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
const fmtArea = (m2: number) => (m2 >= 10000 ? `${(m2 / 10000).toFixed(2)} ha` : `${Math.round(m2)} m²`);
const fmtDuration = (s: number) => `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s`;

interface SliderProps {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

function Slider({ label, unit, value, min, max, step = 1, onChange }: SliderProps) {
  const id = `field-${label.toLowerCase().replace(/\W+/g, '-')}`;
  const set = (raw: string) => {
    const n = Number(raw);
    if (raw !== '' && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(e.target.value)} aria-label={`${label} slider`} />
      <span className="number">
        <input id={id} type="number" min={min} max={max} step={step} value={value} onChange={(e) => set(e.target.value)} />
        <span className="unit">{unit}</span>
      </span>
    </div>
  );
}

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

  return (
    <div className="app">
      <aside className="sidebar">
        <header>
          <h1>Survey Mission Planner</h1>
          <p className="muted">{MAVIC3_WIDE.name} · DJI Fly waypoint KMZ</p>
        </header>

        <form className="search" onSubmit={search}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a place or enter lat, lng" aria-label="Find a place" />
          <button type="submit">Go</button>
        </form>
        {searchError && <p className="error">{searchError}</p>}

        <section>
          <h2>1. Survey area</h2>
          <p className="muted">Click the map to add corners in order. Drag a corner to move it; right-click to remove it.</p>
          <div className="row">
            <button type="button" onClick={() => setPolygon(polygon.slice(0, -1))} disabled={!polygon.length}>
              Undo corner
            </button>
            <button type="button" onClick={() => setPolygon([])} disabled={!polygon.length}>
              Clear
            </button>
            <span className="muted">{polygon.length} corners</span>
          </div>
        </section>

        <section>
          <h2>2. Flight settings</h2>
          <Slider label="Altitude" unit="m" min={20} max={500} value={settings.altitudeM} onChange={(altitudeM) => update({ altitudeM })} />
          <Slider label="Front overlap" unit="%" min={50} max={90} value={settings.frontOverlapPct} onChange={(frontOverlapPct) => update({ frontOverlapPct })} />
          <Slider label="Side overlap" unit="%" min={30} max={90} value={settings.sideOverlapPct} onChange={(sideOverlapPct) => update({ sideOverlapPct })} />
          <p className="muted">
            Not sure what overlap to pick?{' '}
            <a
              className="link"
              href={`./overlap/?alt=${settings.altitudeM}&front=${settings.frontOverlapPct}&side=${settings.sideOverlapPct}`}
            >
              See how overlap works →
            </a>
          </p>
          <Slider label="Line direction" unit="°" min={0} max={179} value={settings.angleDeg} onChange={(angleDeg) => update({ angleDeg })} />
          <div className="row">
            <button type="button" onClick={() => update({ angleDeg: bestAngle(polygon) })} disabled={polygon.length < 3}>
              Auto direction (fewest lines)
            </button>
          </div>
          <Slider label="Max speed" unit="m/s" min={1} max={15} step={0.5} value={settings.maxSpeedMs} onChange={(maxSpeedMs) => update({ maxSpeedMs })} />

          <fieldset>
            <legend>Photo capture</legend>
            <label>
              <input type="radio" name="mode" checked={settings.mode === 'interval'} onChange={() => update({ mode: 'interval' })} />
              Interval timer <span className="muted">— fly lines non-stop, DJI Fly shoots on a timer (few waypoints)</span>
            </label>
            <label>
              <input type="radio" name="mode" checked={settings.mode === 'waypoint'} onChange={() => update({ mode: 'waypoint' })} />
              Photo at each waypoint <span className="muted">— stop for every photo (max {MAX_WAYPOINTS} waypoints)</span>
            </label>
          </fieldset>

          <div className="field">
            <label htmlFor="finish">When finished</label>
            <select id="finish" value={settings.finishAction} onChange={(e) => update({ finishAction: e.target.value as Settings['finishAction'] })}>
              <option value="goHome">Return to home</option>
              <option value="noAction">Hover in place</option>
            </select>
          </div>
        </section>

        <section>
          <h2>3. Plan</h2>
          {!plan ? (
            <p className="muted">Add at least three corners to see the plan.</p>
          ) : (
            <>
              <dl className="stats" data-testid="stats">
                <dt>Area</dt>
                <dd>{fmtArea(plan.areaM2)}</dd>
                <dt>Ground resolution</dt>
                <dd>{plan.footprint.gsdCm.toFixed(2)} cm/px</dd>
                <dt>Photo footprint</dt>
                <dd>
                  {Math.round(plan.footprint.width)} × {Math.round(plan.footprint.height)} m
                </dd>
                <dt>Flight lines</dt>
                <dd>
                  {plan.lineCount}, {plan.lineSpacingM.toFixed(1)} m apart
                </dd>
                <dt>Waypoints</dt>
                <dd>{plan.waypoints.length}</dd>
                <dt>Photos</dt>
                <dd>~{plan.photoCount}</dd>
                <dt>Route length</dt>
                <dd>{fmtDistance(plan.distanceM)}</dd>
                <dt>Speed</dt>
                <dd>{plan.speedMs.toFixed(1)} m/s</dd>
                <dt>Flight time</dt>
                <dd>~{fmtDuration(plan.durationS)}</dd>
              </dl>
              <p className="muted">Time and length cover the survey route only, not the flight from take-off to the first waypoint and back.</p>

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
        </section>

        <section>
          <details>
            <summary>How to load the KMZ into DJI Fly</summary>
            <p className="muted">DJI Fly has no import button, so the file replaces a placeholder mission. This is a community workaround, not an official DJI feature.</p>
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
            <p className="muted">
              iPhone with RC-N1: Files › On My iPhone › DJI Fly › <code>wayline_mission</code>. Altitudes are relative to the take-off point and the route does not follow terrain.
            </p>
          </details>
        </section>
      </aside>

      <MapView polygon={polygon} onPolygonChange={setPolygon} plan={plan} focus={focus} />
    </div>
  );
}
