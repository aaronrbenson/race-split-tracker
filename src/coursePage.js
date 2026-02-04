import { initMap } from './map.js';
import { parseGpxToTrack } from './gpx.js';
import { RACE_DISTANCE_KM } from './data.js';

const DEFAULT_GPX_URL = '/Rocky_Raccoon_100%20for%20Publication.gpx';

function getEl(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error('Missing element #' + id);
  return el;
}

function setStatus(msg) {
  getEl('course-status').textContent = msg;
}

/** Sheet snap points as fraction of viewport height (0–1). */
const SHEET_PEEK = 0.35;
const SHEET_HALF = 0.5;
const SHEET_FULL = 1;

function initSheetDrag() {
  const sheet = getEl('course-sheet');
  const dragArea = getEl('course-sheet-drag');

  function getSafeBottom() {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-bottom)')) || 0;
  }

  function getHeights() {
    const vh = window.innerHeight;
    const safe = getSafeBottom();
    return {
      peek: Math.max(200, vh * SHEET_PEEK),
      half: vh * SHEET_HALF,
      full: vh - safe,
    };
  }

  function setSheetHeight(px) {
    sheet.style.height = `${px}px`;
    sheet.style.setProperty('--sheet-height', `${px}px`);
  }

  function snapToNearest(px) {
    const { peek, half, full } = getHeights();
    const midPeekHalf = (peek + half) / 2;
    const midHalfFull = (half + full) / 2;
    let snap;
    if (px < midPeekHalf) snap = peek;
    else if (px < midHalfFull) snap = half;
    else snap = full;
    setSheetHeight(snap);
    sheet.classList.remove('dragging');
  }

  let startY = 0;
  let startHeight = 0;

  function onStart(clientY) {
    const heights = getHeights();
    startY = clientY;
    startHeight = sheet.offsetHeight;
    sheet.classList.add('dragging');
  }

  function onMove(clientY) {
    const heights = getHeights();
    const deltaY = startY - clientY;
    const next = Math.round(startHeight + deltaY);
    const clamped = Math.max(heights.peek, Math.min(heights.full, next));
    setSheetHeight(clamped);
  }

  function onEnd() {
    if (!sheet.classList.contains('dragging')) return;
    snapToNearest(sheet.offsetHeight);
  }

  dragArea.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    onStart(e.touches[0].clientY);
  }, { passive: false });

  dragArea.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    onMove(e.touches[0].clientY);
  }, { passive: false });

  dragArea.addEventListener('touchend', onEnd);
  dragArea.addEventListener('touchcancel', onEnd);

  dragArea.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    onStart(e.clientY);
    const onMouseMove = (e2) => onMove(e2.clientY);
    const onMouseUp = () => {
      onEnd();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  // Set initial height to peek (in px) so it matches snap points
  setSheetHeight(getHeights().peek);
}

function init() {
  initSheetDrag();

  const mapContainer = getEl('map-container');
  const gpxFile = getEl('gpx-file');
  const loadDefaultBtn = getEl('load-default-gpx');
  const raceStartKmInput = getEl('race-start-km');
  const runnerKmInput = getEl('runner-km');
  const runnerKmRange = getEl('runner-km-range');

  const mapApi = initMap(mapContainer, {
    raceStartKm: 3.5,
    raceDistanceKm: RACE_DISTANCE_KM,
  });

  function applyTrack(xml) {
    try {
      const track = parseGpxToTrack(xml);
      mapApi.setTrack(track);
      const km = parseFloat(runnerKmInput.value, 10) || 0;
      mapApi.setRunnerKm(km);
      setStatus(
        `Course loaded. Track length: ${track.trackLengthKm.toFixed(1)} km. Runner at ${km.toFixed(1)} km.`
      );
    } catch (e) {
      setStatus('Error: ' + (e.message || String(e)));
    }
  }

  function updateRunnerFromInputs() {
    const km = parseFloat(runnerKmInput.value, 10);
    const raceStart = parseFloat(raceStartKmInput.value, 10) || 0;
    mapApi.setRaceStartKm(raceStart);
    if (Number.isNaN(km)) {
      mapApi.setRunnerKm(null);
      setStatus('Set runner distance (km).');
      return;
    }
    mapApi.setRunnerKm(km);
    setStatus(`Runner at ${km.toFixed(1)} km (track starts at race km ${raceStart}).`);
  }

  // Map uses raceStartKm from init; we could expose a setRaceStartKm on mapApi later. For now the number input is there for display/future use.
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

  // Sync race start into map: re-init is heavy; for now we only use 3.5 in map. Update runner when race-start changes so at least the label updates.
  raceStartKmInput.addEventListener('change', updateRunnerFromInputs);

  // Load default GPX on first visit so the map is useful immediately
  loadDefaultBtn.click();
}

init();
