import { init } from './ui.js';
import { initMap } from './map.js';
import { parseGpxToTrack, getAidStationRaceKmFromTrack } from './gpx.js';
import { initSheetDrag } from './sheet.js';
import { loadPacingPlan } from './pacingPlan.js';
import { RACE_DISTANCE_KM } from './data.js';

const DEFAULT_GPX_URL = '/Rocky_Raccoon_100%20for%20Publication.gpx';
const RACE_START_KM_KEY = 'rocky_race_start_km';

const EXPECTED_AID_STATION_COUNT = 14;

function getRaceStartKm() {
  const v = localStorage.getItem(RACE_START_KM_KEY);
  if (v == null || v === '') return 3.5;
  const n = parseFloat(v, 10);
  return Number.isNaN(n) ? 3.5 : n;
}

/** Override aid station km from track geometry so progress table aligns with map markers. */
function applyTrackDerivedKm(aidStations, trackLengthKm, raceStartKm) {
  if (!aidStations || aidStations.length !== EXPECTED_AID_STATION_COUNT) return;
  const raceKm = getAidStationRaceKmFromTrack(trackLengthKm, raceStartKm, RACE_DISTANCE_KM);
  raceKm.forEach((km, i) => {
    aidStations[i].km = km;
  });
}

async function loadCourseAndInitMap(mapApi) {
  try {
    const res = await fetch(DEFAULT_GPX_URL);
    if (!res.ok) return null;
    const xml = await res.text();
    const track = parseGpxToTrack(xml);
    mapApi.setTrack(track);
    return track;
  } catch (_) {
    return null;
  }
}

async function bootstrap() {
  const [track, { aidStations, firstLapAidKm }] = await Promise.all([
    (async () => {
      try {
        const res = await fetch(DEFAULT_GPX_URL);
        if (!res.ok) return null;
        const xml = await res.text();
        return parseGpxToTrack(xml);
      } catch (_) {
        return null;
      }
    })(),
    loadPacingPlan(),
  ]);

  const raceStartKm = getRaceStartKm();
  if (track && aidStations?.length === EXPECTED_AID_STATION_COUNT) {
    applyTrackDerivedKm(aidStations, track.trackLengthKm, raceStartKm);
  }

  const mapContainer = document.getElementById('map-container');
  if (mapContainer) {
    initSheetDrag();
    const mapApi = initMap(mapContainer, {
      raceStartKm,
      raceDistanceKm: RACE_DISTANCE_KM,
      numLoops: 3,
      firstLapAidKm,
    });
    if (track) mapApi.setTrack(track);
    else loadCourseAndInitMap(mapApi);
    init({
      aidStations,
      onRunnerUpdate: ({ lastSplit }) => {
        mapApi.setRunnerKm(lastSplit?.km ?? null);
      },
    });
  } else {
    init({ aidStations });
  }
}

bootstrap();
