import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getPositionAtDistance, getDistanceAlongTrack, raceKmToTrackKm, raceKmToTrackKmThreeLoops, getTrackSegmentPoints, getLapStartTrackKmForRaceKm, PROLOGUE_OUT_KM, PROLOGUE_TOTAL_KM } from './gpx.js';

/** Default race distance (km) for scaling. */
const DEFAULT_RACE_KM = 100.12;

/** Fallback when sheet height not yet available (e.g. before layout). */
const SHEET_PEEK_FRACTION = 0.35;

function getSheetHeightPx() {
  const sheet = document.getElementById('course-sheet');
  if (sheet && sheet.offsetHeight > 0) return sheet.offsetHeight;
  return Math.max(200, window.innerHeight * SHEET_PEEK_FRACTION);
}

/**
 * Pan map so the center of the view aligns with the center of the visible map area
 * (the top strip above the sheet). When the sheet is ~2/3, that visible area is the top 1/3.
 */
function centerMapForSheet(map) {
  const sheetH = getSheetHeightPx();
  const containerCenterY = map.getContainer().offsetHeight / 2;
  const visibleCenterY = (map.getContainer().offsetHeight - sheetH) / 2;
  map.panBy([0, visibleCenterY - containerCenterY], { animate: false });
}

/** Default first-lap aid stations (chart miles along loop) if not provided. */
const DEFAULT_FIRST_LAP_AID_KM = [
  { name: 'Gate', mile: 6 },
  { name: 'Nature Center', mile: 11.3 },
  { name: 'Dam Nation', mile: 16.3 },
];

/** Corrected track km along loop (from dragged positions). Overrides mile-based placement when set. */
const AID_TRACK_KM = {
  Tylers: 0.51,
  Gate: 6.3,
  'Nature Center': 14.87,
  'Dam Nation': 24.89,
};

/** Optional exact lat/lon for Tylers (start/finish). When set, marker is placed here instead of track-interpolated. */
const TYLERS_LATLON = { lat: 30.61503, lon: -95.53251 };

/**
 * Create and run the course map.
 * @param {HTMLElement} container - div for the map
 * @param {Object} options - { raceStartKm?: number, raceDistanceKm?: number, numLoops?: number, firstLapAidKm?: Array<{ name: string, mile: number }> }
 * @returns {{ setTrack, setRunnerKm, setRaceStartKm }}
 */
export function initMap(container, options = {}) {
  const raceStartKm = options.raceStartKm ?? 3.5;
  const raceDistanceKm = options.raceDistanceKm ?? DEFAULT_RACE_KM;
  const numLoops = options.numLoops ?? 3;
  const firstLapAidKm = options.firstLapAidKm ?? DEFAULT_FIRST_LAP_AID_KM;

  const map = L.map(container).setView([30.615, -95.534], 12);
  centerMapForSheet(map);

  /* Label above map tiles (Leaflet panes use z-index 200–700; we use 750) */
  const labelEl = document.createElement('span');
  labelEl.className = 'map-surface-label';
  labelEl.setAttribute('aria-hidden', 'true');
  labelEl.textContent = 'Location is an estimate';
  container.appendChild(labelEl);

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
  let completedPolyline = null;
  let runnerMarker = null;
  let aidStationMarkers = [];
  let currentTrack = null;
  let currentRaceStartKm = raceStartKm;

  function poiIcon(emoji) {
    return L.divIcon({
      className: 'course-poi-marker',
      html: `<span aria-hidden="true">${emoji}</span>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  }

  function aidStationIcon(name, emoji = '💧') {
    const extraClass = name === 'Tylers' ? ' course-aid-start' : '';
    /* Icon height matches compact label (padding + emoji); anchor at bottom so label sits just above point */
    const iconH = 24;
    const iconAnchor = name === 'Tylers' ? [40, iconH] : [80, iconH];
    return L.divIcon({
      className: 'course-aid-marker' + extraClass,
      html: `
        <div class="course-aid-label-wrap">
          <span class="course-aid-emoji" aria-hidden="true">${emoji}</span>
          <span class="course-aid-label">${name === 'Tylers' ? "Tyler's" : name}</span>
        </div>
      `,
      iconSize: [160, iconH],
      iconAnchor,
    });
  }

  function runnerIcon(bearing) {
    /* Runner emoji default faces left (west). Only face east or west, toward direction of travel.
     * East = 180deg rotation, west = 0deg. Face east when bearing is in eastern semicircle (315–360, 0–135). */
    const b = bearing != null ? bearing : 270;
    const faceEast = b >= 315 || b < 135;
    const deg = faceEast ? 180 : 0;
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
    if (completedPolyline) {
      map.removeLayer(completedPolyline);
      completedPolyline = null;
    }
    aidStationMarkers.forEach((m) => map.removeLayer(m));
    aidStationMarkers = [];
    if (!track || track.points.length === 0) return;
    const latLngs = track.points.map((p) => [p.lat, p.lon]);
    polyline = L.polyline(latLngs, { color: '#a0c8ff', weight: 4, opacity: 0.7 }).addTo(map);

    const aidDebug = new URLSearchParams(location.search).get('aidDebug') === '1';
    const trackLen = track.trackLengthKm;
    const LOOP_MILES = 22.2;

    /* POIs: Tylers (start/finish) then aid stations; track km from AID_TRACK_KM or mile-based */
    const tylersPoi = { name: 'Tylers', trackKm: AID_TRACK_KM.Tylers ?? 0 };
    const aidPois = firstLapAidKm.map(({ name, mile }) => ({
      name,
      trackKm:
        AID_TRACK_KM[name] != null
          ? AID_TRACK_KM[name]
          : (mile != null && LOOP_MILES > 0 ? Math.min(1, Math.max(0, mile / LOOP_MILES)) : 0) * trackLen,
    }));
    const pois = [tylersPoi, ...aidPois];

    for (const { name, trackKm } of pois) {
      const pos =
        name === 'Tylers' && TYLERS_LATLON
          ? { lat: TYLERS_LATLON.lat, lon: TYLERS_LATLON.lon }
          : getPositionAtDistance(track.points, trackKm);
      if (pos) {
        const emoji = name === 'Tylers' ? '⭐' : '💧';
        const m = L.marker([pos.lat, pos.lon], {
          icon: aidStationIcon(name, emoji),
          draggable: aidDebug,
        }).addTo(map);
        if (aidDebug) {
          m.bindPopup('Drag to correct position').openPopup();
          m.on('dragend', () => {
            const latlng = m.getLatLng();
            const km = getDistanceAlongTrack(track.points, latlng.lat, latlng.lng);
            const text = `${name} — track km: ${km != null ? km.toFixed(2) : '—'} | lat: ${latlng.lat.toFixed(5)}, lon: ${latlng.lng.toFixed(5)}`;
            m.setPopupContent(text).openPopup();
          });
        }
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
    const effectiveKm = km == null ? 0 : km;
    let pos;
    let currentTrackKm = 0;
    if (effectiveKm < 0.5 && TYLERS_LATLON) {
      const tylersBearing = getPositionAtDistance(currentTrack.points, AID_TRACK_KM.Tylers ?? 0.51);
      pos = {
        lat: TYLERS_LATLON.lat,
        lon: TYLERS_LATLON.lon,
        bearing: tylersBearing?.bearing ?? 90,
      };
      currentTrackKm = AID_TRACK_KM.Tylers ?? 0.51;
    } else {
      currentTrackKm = numLoops === 3
        ? raceKmToTrackKmThreeLoops(effectiveKm, currentTrack.trackLengthKm, currentRaceStartKm, raceDistanceKm)
        : raceKmToTrackKm(effectiveKm, currentTrack.trackLengthKm, currentRaceStartKm, raceDistanceKm);
      pos = getPositionAtDistance(currentTrack.points, currentTrackKm);
    }
    if (!pos) return;
    const onPrologueReturn = effectiveKm > PROLOGUE_OUT_KM && effectiveKm <= PROLOGUE_TOTAL_KM;
    const bearing = onPrologueReturn ? (pos.bearing + 180) % 360 : pos.bearing;
    const icon = runnerIcon(bearing);
    runnerMarker = L.marker([pos.lat, pos.lon], { icon }).addTo(map);

    if (completedPolyline) {
      map.removeLayer(completedPolyline);
      completedPolyline = null;
    }
    if (numLoops === 3) {
      const lapStartTrackKm = getLapStartTrackKmForRaceKm(effectiveKm, currentTrack.trackLengthKm, currentRaceStartKm, raceDistanceKm);
      const segmentPoints = getTrackSegmentPoints(currentTrack.points, lapStartTrackKm, currentTrackKm);
      if (segmentPoints.length >= 2) {
        const segmentLatLngs = segmentPoints.map((p) => [p.lat, p.lon]);
        completedPolyline = L.polyline(segmentLatLngs, { color: '#2563eb', weight: 5, opacity: 0.95 }).addTo(map);
      }
    }
  }

  function setRaceStartKm(km) {
    currentRaceStartKm = km;
    if (lastRunnerKm != null) setRunnerKm(lastRunnerKm);
  }

  return { setTrack, setRunnerKm, setRaceStartKm };
}
