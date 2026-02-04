import { init } from './ui.js';
import { initMap } from './map.js';
import { parseGpxToTrack } from './gpx.js';
import { initSheetDrag } from './sheet.js';
import { RACE_DISTANCE_KM } from './data.js';

const DEFAULT_GPX_URL = '/Rocky_Raccoon_100%20for%20Publication.gpx';
const RACE_START_KM_KEY = 'rocky_race_start_km';

function getRaceStartKm() {
  const v = localStorage.getItem(RACE_START_KM_KEY);
  if (v == null || v === '') return 3.5;
  const n = parseFloat(v, 10);
  return Number.isNaN(n) ? 3.5 : n;
}

async function loadCourseAndInitMap(mapApi) {
  try {
    const res = await fetch(DEFAULT_GPX_URL);
    if (!res.ok) return;
    const xml = await res.text();
    const track = parseGpxToTrack(xml);
    mapApi.setTrack(track);
  } catch (_) {
    // Offline or missing GPX: map stays empty
  }
}

const mapContainer = document.getElementById('map-container');
if (mapContainer) {
  initSheetDrag();
  const raceStartKm = getRaceStartKm();
  const mapApi = initMap(mapContainer, {
    raceStartKm,
    raceDistanceKm: RACE_DISTANCE_KM,
    numLoops: 3,
  });
  loadCourseAndInitMap(mapApi);
  init({
    onRunnerUpdate: ({ lastSplit }) => {
      mapApi.setRunnerKm(lastSplit?.km ?? null);
    },
  });
} else {
  init();
}
