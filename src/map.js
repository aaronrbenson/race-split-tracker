import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getPositionAtDistance, raceKmToTrackKm, raceKmToTrackKmThreeLoops } from './gpx.js';

/** Default race distance (km) for scaling. */
const DEFAULT_RACE_KM = 100.12;

/** Peek height fraction, match sheet.js so we can offset map center. */
const SHEET_PEEK_FRACTION = 0.35;

function getSheetHeightPx() {
  const sheet = document.getElementById('course-sheet');
  if (sheet && sheet.offsetHeight > 0) return sheet.offsetHeight;
  return Math.max(200, window.innerHeight * SHEET_PEEK_FRACTION);
}

/**
 * Pan map up so its center aligns with the visible area (above the sheet).
 * Use slightly more than half the sheet height so the map sits a bit higher on load.
 */
function centerMapForSheet(map) {
  const sheetH = getSheetHeightPx();
  map.panBy([0, -sheetH * 0.6], { animate: false });
}

/**
 * Create and run the course map.
 * @param {HTMLElement} container - div for the map
 * @param {Object} options - { raceStartKm?: number, raceDistanceKm?: number, numLoops?: number }
 * @returns {{ setTrack, setRunnerKm, setRaceStartKm }}
 */
export function initMap(container, options = {}) {
  const raceStartKm = options.raceStartKm ?? 3.5;
  const raceDistanceKm = options.raceDistanceKm ?? DEFAULT_RACE_KM;
  const numLoops = options.numLoops ?? 3;

  /* Center on Rocky Raccoon / Huntsville State Park area */
  const map = L.map(container).setView([30.615, -95.534], 12);
  centerMapForSheet(map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20,
  }).addTo(map);

  let polyline = null;
  let runnerMarker = null;
  let currentTrack = null;
  let currentRaceStartKm = raceStartKm;

  function runnerIcon(bearing) {
    /* Runner emoji faces right (east); 0 = north so offset -90 so bearing 90 = 0 rotation */
    const deg = bearing != null ? Math.round(bearing) - 90 : -90;
    return L.divIcon({
      className: 'course-runner-marker',
      html: `<span class="course-runner-arrow" style="transform: rotate(${deg}deg)" aria-hidden="true">🏃</span>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }

  function setTrack(track) {
    currentTrack = track;
    if (polyline) map.removeLayer(polyline);
    if (!track || track.points.length === 0) return;
    const latLngs = track.points.map((p) => [p.lat, p.lon]);
    polyline = L.polyline(latLngs, { color: '#58a6ff', weight: 4, opacity: 0.9 }).addTo(map);
    map.fitBounds(track.bounds, { padding: [24, 24], maxZoom: 14 });
    centerMapForSheet(map);
    // Always re-place runner when track loads (in case refresh() ran before track was ready)
    setRunnerKm(lastRunnerKm);
  }

  let lastRunnerKm = null;
  function setRunnerKm(km) {
    lastRunnerKm = km;
    if (runnerMarker) {
      map.removeLayer(runnerMarker);
      runnerMarker = null;
    }
    if (!currentTrack || currentTrack.points.length === 0) return;
    // When no split data, show runner at start (0 km) so they're visible on the map
    const effectiveKm = km == null ? 0 : km;
    const trackKm = numLoops === 3
      ? raceKmToTrackKmThreeLoops(effectiveKm, currentTrack.trackLengthKm, currentRaceStartKm, raceDistanceKm)
      : raceKmToTrackKm(effectiveKm, currentTrack.trackLengthKm, currentRaceStartKm, raceDistanceKm);
    const pos = getPositionAtDistance(currentTrack.points, trackKm);
    if (!pos) return;
    {
      const icon = runnerIcon(pos.bearing);
      runnerMarker = L.marker([pos.lat, pos.lon], { icon }).addTo(map);
    }
  }

  function setRaceStartKm(km) {
    currentRaceStartKm = km;
    if (lastRunnerKm != null) setRunnerKm(lastRunnerKm);
  }

  return { setTrack, setRunnerKm, setRaceStartKm };
}
