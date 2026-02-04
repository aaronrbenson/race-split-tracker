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

  /* Ensure tiles load correctly: invalidateSize after layout (handles timing/resize issues) */
  map.whenReady(() => {
    requestAnimationFrame(() => {
      map.invalidateSize();
    });
  });
  const resizeObs = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => map.invalidateSize())
    : null;
  if (resizeObs && container) resizeObs.observe(container);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20,
  }).addTo(map);

  let polyline = null;
  let runnerMarker = null;
  let startFinishMarker = null;
  let aidStationMarkers = [];
  let currentTrack = null;
  let currentRaceStartKm = raceStartKm;

  /** First-lap aid station km for Gate, Nature Center, Dam Nation (Tyler's = start/finish). */
  const FIRST_LAP_AID_KM = [
    { name: 'Gate', km: 9.66 },
    { name: 'Nature Center', km: 18.19 },
    { name: 'Dam Nation', km: 26.23 },
  ];

  function poiIcon(emoji) {
    return L.divIcon({
      className: 'course-poi-marker',
      html: `<span aria-hidden="true">${emoji}</span>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  }

  function aidStationIcon(name) {
    return L.divIcon({
      className: 'course-aid-marker',
      html: `
        <div class="course-aid-label-wrap">
          <span class="course-aid-emoji" aria-hidden="true">⛺</span>
          <span class="course-aid-label">${name}</span>
        </div>
      `,
      iconSize: [80, 36],
      iconAnchor: [40, 36],
    });
  }

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
    polyline = null;
    if (startFinishMarker) map.removeLayer(startFinishMarker);
    startFinishMarker = null;
    aidStationMarkers.forEach((m) => map.removeLayer(m));
    aidStationMarkers = [];
    if (!track || track.points.length === 0) return;
    const latLngs = track.points.map((p) => [p.lat, p.lon]);
    polyline = L.polyline(latLngs, { color: '#58a6ff', weight: 4, opacity: 0.9 }).addTo(map);

    /* Start/finish marker at loop start */
    const start = track.points[0];
    if (start) {
      startFinishMarker = L.marker([start.lat, start.lon], {
        icon: L.divIcon({
          className: 'course-aid-marker course-aid-start',
          html: `
            <div class="course-aid-label-wrap">
              <span class="course-aid-emoji" aria-hidden="true">🏁</span>
              <span class="course-aid-label">Start / Finish</span>
            </div>
          `,
          iconSize: [100, 36],
          iconAnchor: [50, 36],
        }),
      }).addTo(map);
    }

    /* Aid station markers from first-lap distances */
    const trackLen = track.trackLengthKm;
    const loopLen = raceDistanceKm / 3;
    for (const { name, km } of FIRST_LAP_AID_KM) {
      const trackKm = (km / loopLen) * trackLen;
      const pos = getPositionAtDistance(track.points, trackKm);
      if (pos) {
        const m = L.marker([pos.lat, pos.lon], { icon: aidStationIcon(name) }).addTo(map);
        aidStationMarkers.push(m);
      }
    }

    map.invalidateSize();
    const sheetH = getSheetHeightPx();
    map.fitBounds(track.bounds, {
      paddingTopLeft: [24, 24],
      paddingBottomRight: [24, sheetH],
      maxZoom: 14,
    });
    centerMapForSheet(map);
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
