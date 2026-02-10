import { RACE_DISTANCE_KM, RACE_START_MINUTES } from './data.js';
const DURATION_SEC = 120;

/** Parse "9:15 AM" to minutes from midnight. */
function parseClockToMinutes(clockStr) {
  const match = (clockStr || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const pm = (match[3] || '').toUpperCase() === 'PM';
  if (pm && h !== 12) h += 12;
  if (!pm && h === 12) h = 0;
  return h * 60 + m;
}

/** Format minutes-from-midnight as "9:15 AM". */
function formatMinutesToClock(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = Math.floor(totalMinutes % 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

/** Format elapsed minutes as "HH:MM:SS". */
function formatElapsed(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.floor(totalMinutes % 60);
  const s = Math.floor((totalMinutes % 1) * 60);
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** Interpolate plan target minutes at given km from aid stations. */
export function planTargetAtKm(km, aidStations) {
  if (!aidStations || aidStations.length === 0) {
    const progress = km / RACE_DISTANCE_KM;
    return RACE_START_MINUTES + progress * 870; // fallback: linear 7 AM to ~9:30 PM
  }
  const stations = aidStations.filter((s) => s.target && s.target !== '—');
  if (stations.length === 0) return RACE_START_MINUTES + (km / RACE_DISTANCE_KM) * 870;
  let prev = stations[0];
  for (const s of stations) {
    if (s.km >= km) {
      if (prev.km === s.km) {
        const m = parseClockToMinutes(s.target);
        return m != null ? m : RACE_START_MINUTES;
      }
      const prevMin = parseClockToMinutes(prev.target);
      const nextMin = parseClockToMinutes(s.target);
      if (prevMin == null || nextMin == null) return prevMin ?? nextMin ?? RACE_START_MINUTES;
      const t = (km - prev.km) / (s.km - prev.km);
      return prevMin + t * (nextMin - prevMin);
    }
    prev = s;
  }
  const last = stations[stations.length - 1];
  const lastMin = parseClockToMinutes(last.target);
  if (lastMin == null) return RACE_START_MINUTES;
  const pace = (lastMin - RACE_START_MINUTES) / last.km;
  return lastMin + pace * (km - last.km);
}

/** Apply scenario offset (minutes) to plan target. progress 0..1. */
function scenarioOffset(progress, scenario) {
  switch (scenario) {
    case 1:
      return 0;
    case 2:
      return progress * 120; // finish ~2 hr late
    case 3:
      return -20; // ~20 min early throughout
    case 4:
      return 60 * Math.sin(progress * Math.PI); // behind at 50%, on plan at finish
    default:
      return 0;
  }
}

let active = false;
let scenario = 1;
let aidStationsRef = [];
let startTime = 0;
let intervalId = null;
let lastState = null;

function tick(onUpdate) {
  const elapsedSec = (Date.now() - startTime) / 1000;
  const progress = Math.min(1, elapsedSec / DURATION_SEC);
  const km = Math.min(RACE_DISTANCE_KM, progress * RACE_DISTANCE_KM);
  const planMin = planTargetAtKm(km, aidStationsRef);
  const offset = scenarioOffset(progress, scenario);
  const clockMinutes = planMin + offset;
  const clockTime = formatMinutesToClock(clockMinutes);
  const isFinished = progress >= 1;

  let totalRaceTime = null;
  if (isFinished) {
    const planFinishMin = planTargetAtKm(RACE_DISTANCE_KM, aidStationsRef);
    const finishOffset = scenarioOffset(1, scenario);
    const elapsedMin = (planFinishMin + finishOffset) - RACE_START_MINUTES;
    totalRaceTime = formatElapsed(elapsedMin);
  }

  lastState = { km, clockTime, totalRaceTime, isFinished, scenario };

  if (isFinished && intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  onUpdate();
}

export function isTestModeActive() {
  return active;
}

export function getTestRunnerState() {
  return lastState;
}

export function startTestMode(scenarioNum, onUpdate, stations = []) {
  if (active) return;
  const s = scenarioNum === 'finish' || scenarioNum === 5 ? 5 : parseInt(scenarioNum, 10);
  if (s === 5) {
    active = true;
    scenario = 5;
    aidStationsRef = stations;
    const finishMinutes = RACE_START_MINUTES + 14 * 60 + 30;
    lastState = {
      km: RACE_DISTANCE_KM,
      clockTime: formatMinutesToClock(finishMinutes),
      totalRaceTime: '14:30:00',
      isFinished: true,
      scenario: 5,
    };
    onUpdate();
    return;
  }
  if (s < 1 || s > 4) return;
  active = true;
  scenario = s;
  aidStationsRef = stations;
  startTime = Date.now();
  lastState = { km: 0, clockTime: formatMinutesToClock(RACE_START_MINUTES), totalRaceTime: null, isFinished: false, scenario: s };
  intervalId = setInterval(() => tick(onUpdate), 100);
  tick(onUpdate);
}

export function stopTestMode() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  active = false;
  lastState = null;
}
