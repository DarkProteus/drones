import L from 'leaflet';
import { useEffect, useRef } from 'react';
import type { LatLng } from './lib/geo';
import type { SurveyPlan } from './lib/survey';

const VIEW_KEY = 'mission-planner-view';
// Drawing thousands of photo dots makes panning sluggish and adds nothing visually.
const MAX_WAYPOINT_DOTS = 1500;

export interface Focus extends LatLng {
  /** Changes on every request so repeated searches for the same place still move the map. */
  nonce: number;
}

interface Props {
  polygon: LatLng[];
  onPolygonChange: (polygon: LatLng[]) => void;
  plan: SurveyPlan | null;
  focus: Focus | null;
}

function loadView(): { center: [number, number]; zoom: number } {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null');
    if (v && Number.isFinite(v.lat) && Number.isFinite(v.lng) && Number.isFinite(v.zoom)) {
      return { center: [v.lat, v.lng], zoom: v.zoom };
    }
  } catch {
    // Fall through to the default view.
  }
  return { center: [50, 15], zoom: 4 };
}

const labelIcon = (label: string, className: string) =>
  L.divIcon({ className: `pin ${className}`, html: label, iconSize: [22, 22], iconAnchor: [11, 11] });

const vertexIcon = L.divIcon({ className: 'vertex', iconSize: [14, 14], iconAnchor: [7, 7] });

export function MapView({ polygon, onPolygonChange, plan, focus }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const areaLayer = useRef<L.LayerGroup | null>(null);
  const routeLayer = useRef<L.LayerGroup | null>(null);

  // Leaflet handlers are bound once, so they read the latest props through refs.
  const polygonRef = useRef(polygon);
  polygonRef.current = polygon;
  const onChangeRef = useRef(onPolygonChange);
  onChangeRef.current = onPolygonChange;

  useEffect(() => {
    const view = loadView();
    const m = L.map(container.current!, { center: view.center, zoom: view.zoom, doubleClickZoom: false });
    const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    });
    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics' },
    );
    satellite.addTo(m);
    L.control.layers({ Satellite: satellite, Streets: streets }).addTo(m);
    L.control.scale({ imperial: false }).addTo(m);

    areaLayer.current = L.layerGroup().addTo(m);
    routeLayer.current = L.layerGroup().addTo(m);

    m.on('click', (e) => onChangeRef.current([...polygonRef.current, { lat: e.latlng.lat, lng: e.latlng.lng }]));
    m.on('moveend', () => {
      const c = m.getCenter();
      localStorage.setItem(VIEW_KEY, JSON.stringify({ lat: c.lat, lng: c.lng, zoom: m.getZoom() }));
    });

    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const layer = areaLayer.current;
    if (!layer) return;
    layer.clearLayers();

    const shape = L.polygon(polygon, { color: '#f0a24a', weight: 2, fillOpacity: 0.12, interactive: false }).addTo(layer);
    polygon.forEach((p, i) => {
      const marker = L.marker(p, { icon: vertexIcon, draggable: true, title: `Corner ${i + 1}` }).addTo(layer);
      // Only the outline follows the drag; committing on every move would recreate this marker mid-drag.
      marker.on('drag', () => {
        const live = polygonRef.current.map((q, j) => (j === i ? marker.getLatLng() : q));
        shape.setLatLngs(live);
      });
      marker.on('dragend', () => {
        const { lat, lng } = marker.getLatLng();
        onChangeRef.current(polygonRef.current.map((q, j) => (j === i ? { lat, lng } : q)));
      });
      marker.on('contextmenu', () => onChangeRef.current(polygonRef.current.filter((_, j) => j !== i)));
    });
  }, [polygon]);

  useEffect(() => {
    const layer = routeLayer.current;
    if (!layer) return;
    layer.clearLayers();
    if (!plan) return;

    const wps = plan.waypoints;
    L.polyline(wps, { color: '#6ea2f5', weight: 3, interactive: false }).addTo(layer);
    if (wps.length <= MAX_WAYPOINT_DOTS) {
      for (const wp of wps) {
        L.circleMarker(wp, { radius: 2.5, color: '#fff', weight: 1, fillColor: '#6ea2f5', fillOpacity: 1, interactive: false }).addTo(layer);
      }
    }
    L.marker(wps[0], { icon: labelIcon('S', 'pin-start'), interactive: false, keyboard: false }).addTo(layer);
    L.marker(wps[wps.length - 1], { icon: labelIcon('E', 'pin-end'), interactive: false, keyboard: false }).addTo(layer);
  }, [plan]);

  useEffect(() => {
    if (focus && map.current) map.current.setView([focus.lat, focus.lng], 16);
  }, [focus]);

  return <div ref={container} className="map" data-testid="map" />;
}
