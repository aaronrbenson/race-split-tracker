import { RACE_DISTANCE_KM } from './data.js';

/** Aaron's 2026 Rocky Raccoon 100K — official split times for replay. */
export const AARON_2026_SPLITS = [
  { km: 12.71, clockTime: '9:16 AM' },
  { km: 35.41, clockTime: '11:36 AM' },
  { km: 44.9, clockTime: '1:51 PM' },
  { km: 67.74, clockTime: '4:24 PM' },
  { km: 77.25, clockTime: '6:54 PM' },
  { km: 100.12, clockTime: '9:44 PM' },
];

export const AARON_2026_TOTAL_TIME = '14:44:19';

const RACE_START_MINUTES = 7 * 60;
const REPLAY_DURATION_SEC = 90;

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

function formatMinutesToClock(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = Math.floor(totalMinutes % 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

/**
 * Interpolate clock time (minutes from midnight) at given km from splits.
 */
function interpolateClockAtKm(km, splits) {
  if (!splits || splits.length === 0) return RACE_START_MINUTES;
  if (km <= splits[0].km) {
    const m = parseClockToMinutes(splits[0].clockTime);
    if (m == null) return RACE_START_MINUTES;
    const t = splits[0].km > 0 ? km / splits[0].km : 1;
    return RACE_START_MINUTES + t * (m - RACE_START_MINUTES);
  }
  for (let i = 0; i < splits.length - 1; i++) {
    const a = splits[i];
    const b = splits[i + 1];
    if (km >= a.km && km <= b.km) {
      const aMin = parseClockToMinutes(a.clockTime);
      const bMin = parseClockToMinutes(b.clockTime);
      if (aMin == null || bMin == null) return aMin ?? bMin ?? RACE_START_MINUTES;
      const t = (km - a.km) / (b.km - a.km);
      return aMin + t * (bMin - aMin);
    }
  }
  const last = splits[splits.length - 1];
  return parseClockToMinutes(last.clockTime) ?? RACE_START_MINUTES;
}

let active = false;
let startTime = 0;
let intervalId = null;
let lastReplayState = null;

function tick(onUpdate) {
  const elapsedSec = (Date.now() - startTime) / 1000;
  const progress = Math.min(1, elapsedSec / REPLAY_DURATION_SEC);
  const km = progress * RACE_DISTANCE_KM;
  const clockMinutes = interpolateClockAtKm(km, AARON_2026_SPLITS);
  const clockTime = formatMinutesToClock(clockMinutes);
  const isFinished = progress >= 1;
  const totalRaceTime = isFinished ? AARON_2026_TOTAL_TIME : null;

  lastReplayState = { km, clockTime, totalRaceTime, isFinished };

  if (isFinished && intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  onUpdate();
}

export function isReplayActive() {
  return active;
}

export function isReplayFinished() {
  return active && lastReplayState?.isFinished === true;
}

export function getReplayRunnerState() {
  return lastReplayState;
}

export function startReplay(onUpdate, _aidStations) {
  if (active) return;
  active = true;
  startTime = Date.now();
  lastReplayState = { km: 0, clockTime: formatMinutesToClock(RACE_START_MINUTES), totalRaceTime: null, isFinished: false };
  intervalId = setInterval(() => tick(onUpdate), 100);
  tick(onUpdate);
}

export function stopReplay() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  active = false;
  lastReplayState = null;
}
