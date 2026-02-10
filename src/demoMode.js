import { planTargetAtKm } from './testMode.js';

/** Format minutes-from-midnight as "9:15 AM". */
function formatMinutesToClock(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = Math.floor(totalMinutes % 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

/** Pace bands with representative delta in minutes (vs plan). */
const BANDS = [
  { delta: -25 },   // ahead
  { delta: 0 },     // on
  { delta: 35 },    // behind
  { delta: 85 },    // very behind
  { delta: 150 },   // catastrophic
];

export function isDemoModeActive() {
  return !new URLSearchParams(location.search).get('test');
}

/**
 * Returns one random in-progress state { km, clockTime } for demo.
 * @param {Array<{ km: number, target: string }>} aidStations
 */
export function getRandomDemoState(aidStations) {
  const kmMin = 8;
  const kmMax = 92;
  const km = kmMin + Math.random() * (kmMax - kmMin);

  const band = BANDS[Math.floor(Math.random() * BANDS.length)];
  const planMin = planTargetAtKm(km, aidStations);
  const clockMinutes = planMin + band.delta;
  const clockTime = formatMinutesToClock(clockMinutes);

  return { km, clockTime };
}
