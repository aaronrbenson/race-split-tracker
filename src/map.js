import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getPositionAtDistance, raceKmToTrackKm } from './gpx.js';

/** Default race distance (km) for scaling. */
const DEFAULT_RACE_KM = 100.12;

/**
 * Create and run the course map.
 * @param {HTMLElement} container - div for the map
 * @param {Object} options - { raceStartKm?: number, raceDistanceKm?: number }
 * @returns {{ setTrack: (track: { points, trackLengthKm, bounds }) => void, setRunnerKm: (km: number | null) => void }}
 */
export function initMap(container, options = {}) {
  const raceStartKm = options.raceStartKm ?? 3.5;
  const raceDistanceKm = options.raceDistanceKm ?? DEFAULT_RACE_KM;

  const map = L.map(container, { zoomControl: true }).setView([30.6, -95.53], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  let polyline = null;
  let runnerMarker = null;
  let currentTrack = null;
  let currentRaceStartKm = raceStartKm;

  const runnerIcon = L.divIcon({
    className: 'course-runner-marker',
    html: '<span aria-hidden="true">🏃</span>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

  function setTrack(track) {
    currentTrack = track;
    if (polyline) map.removeLayer(polyline);
    if (!track || track.points.length === 0) return;
    const latLngs = track.points.map((p) => [p.lat, p.lon]);
    polyline = L.polyline(latLngs, { color: '#58a6ff', weight: 4, opacity: 0.9 }).addTo(map);
    map.fitBounds(track.bounds, { padding: [24, 24], maxZoom: 14 });
    if (runnerMarker) setRunnerKm(lastRunnerKm);
  }

  let lastRunnerKm = null;
  function setRunnerKm(km) {
    lastRunnerKm = km;
    if (runnerMarker) {
      map.removeLayer(runnerMarker);
      runnerMarker = null;
    }
    if (km == null || !currentTrack || currentTrack.points.length === 0) return;
    const trackKm = raceKmToTrackKm(km, currentTrack.trackLengthKm, currentRaceStartKm, raceDistanceKm);
    const pos = getPositionAtDistance(currentTrack.points, trackKm);
    if (pos) {
      runnerMarker = L.marker([pos.lat, pos.lon], { icon: runnerIcon }).addTo(map);
    }
  }

  function setRaceStartKm(km) {
    currentRaceStartKm = km;
    if (lastRunnerKm != null) setRunnerKm(lastRunnerKm);
  }

  return { setTrack, setRunnerKm, setRaceStartKm };
}
