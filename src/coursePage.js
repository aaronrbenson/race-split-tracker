import { initMap } from './map.js';
import { parseGpxToTrack } from './gpx.js';
import { initSheetDrag } from './sheet.js';
import { RACE_DISTANCE_KM } from './data.js';

const DEFAULT_GPX_URL = '/Rocky_Raccoon_100%20for%20Publication.gpx';
const RACE_START_KM_KEY = 'rocky_race_start_km';

function getEl(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error('Missing element #' + id);
  return el;
}

function setStatus(msg) {
  getEl('course-status').textContent = msg;
}

function getRaceStartKm() {
  const v = localStorage.getItem(RACE_START_KM_KEY);
  if (v == null || v === '') return 3.5;
  const n = parseFloat(v, 10);
  return Number.isNaN(n) ? 3.5 : n;
}

function setRaceStartKm(km) {
  localStorage.setItem(RACE_START_KM_KEY, String(km));
}

function init() {
  initSheetDrag();

  const mapContainer = getEl('map-container');
  const gpxFile = getEl('gpx-file');
  const loadDefaultBtn = getEl('load-default-gpx');
  const raceStartKmInput = getEl('race-start-km');
  const runnerKmInput = getEl('runner-km');
  const runnerKmRange = getEl('runner-km-range');

  const savedRaceStartKm = getRaceStartKm();
  raceStartKmInput.value = String(savedRaceStartKm);

  const mapApi = initMap(mapContainer, {
    raceStartKm: savedRaceStartKm,
    raceDistanceKm: RACE_DISTANCE_KM,
    numLoops: 3,
  });

  function applyTrack(xml) {
    try {
      const track = parseGpxToTrack(xml);
      mapApi.setTrack(track);
      const km = parseFloat(runnerKmInput.value, 10) || 0;
      mapApi.setRunnerKm(km);
      setStatus(
        `Course loaded. Track length: ${track.trackLengthKm.toFixed(1)} km. Runner at ${km.toFixed(1)} km (3 loops).`
      );
    } catch (e) {
      setStatus('Error: ' + (e.message || String(e)));
    }
  }

  function updateRunnerFromInputs() {
    const km = parseFloat(runnerKmInput.value, 10);
    const raceStart = parseFloat(raceStartKmInput.value, 10) || 0;
    setRaceStartKm(raceStart);
    mapApi.setRaceStartKm(raceStart);
    if (Number.isNaN(km)) {
      mapApi.setRunnerKm(null);
      setStatus('Set runner distance (km).');
      return;
    }
    mapApi.setRunnerKm(km);
    setStatus(`Runner at ${km.toFixed(1)} km (track starts at race km ${raceStart}).`);
  }

  gpxFile.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => applyTrack(reader.result);
    reader.readAsText(file);
  });

  loadDefaultBtn.addEventListener('click', () => {
    setStatus('Loading default course…');
    fetch(DEFAULT_GPX_URL)
      .then((r) => {
        if (!r.ok) throw new Error(r.statusText || 'Failed to load GPX');
        return r.text();
      })
      .then(applyTrack)
      .catch((e) => setStatus('Error: ' + (e.message || String(e))));
  });

  runnerKmInput.addEventListener('input', () => {
    const v = runnerKmInput.value;
    const n = parseFloat(v, 10);
    if (!Number.isNaN(n)) runnerKmRange.value = String(n);
    updateRunnerFromInputs();
  });
  runnerKmRange.addEventListener('input', () => {
    runnerKmInput.value = runnerKmRange.value;
    updateRunnerFromInputs();
  });

  raceStartKmInput.addEventListener('change', updateRunnerFromInputs);
  raceStartKmInput.addEventListener('input', updateRunnerFromInputs);

  loadDefaultBtn.click();
}

init();
