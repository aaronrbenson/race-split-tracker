/**
 * 100K timing split locations (from official legend). Distances in km.
 * Miles source: 7.9, 22, 27.9, 42.1, 48, 62.2
 */
export const SPLITS_100K_KM = [
  { id: 'split1', label: 'Split 1', km: 12.71 },
  { id: 'split2', label: 'Split 2', km: 35.41 },
  { id: 'split3', label: 'Split 3', km: 44.9 },
  { id: 'split4', label: 'Split 4', km: 67.74 },
  { id: 'split5', label: 'Split 5', km: 77.25 },
  { id: 'split6', label: 'Split 6 (Finish)', km: 100.12 },
];

/**
 * Aid stations from crew guide PDF, distances converted to km.
 * crewAccess: true = Tyler's (where crew can meet Aaron)
 */
export const AID_STATIONS_KM = [
  { name: "START — Tyler's", km: 0, target: '7:00 AM', early: '—', late: '—', cutoff: '—', crewAccess: true },
  { name: "Tyler's (Prologue done)", km: 3.54, target: '7:16 AM', early: '7:12 AM', late: '7:20 AM', cutoff: '—', crewAccess: true },
  { name: 'Gate', km: 9.66, target: '7:44 AM', early: '7:38 AM', late: '7:55 AM', cutoff: '—', crewAccess: false },
  { name: 'Nature Center', km: 18.19, target: '8:23 AM', early: '8:13 AM', late: '8:40 AM', cutoff: '—', crewAccess: false },
  { name: 'Dam Nation', km: 26.23, target: '9:00 AM', early: '8:47 AM', late: '9:22 AM', cutoff: '—', crewAccess: false },
  { name: "Tyler's (Lap 1 done)", km: 35.73, target: '9:55 AM', early: '9:35 AM', late: '10:30 AM', cutoff: '—', crewAccess: true },
  { name: 'Gate', km: 41.84, target: '10:28 AM', early: '10:05 AM', late: '11:08 AM', cutoff: '—', crewAccess: false },
  { name: 'Nature Center', km: 50.38, target: '11:12 AM', early: '10:45 AM', late: '12:00 PM', cutoff: '—', crewAccess: false },
  { name: 'Dam Nation', km: 58.42, target: '11:55 AM', early: '11:22 AM', late: '12:50 PM', cutoff: '—', crewAccess: false },
  { name: "Tyler's (Lap 2 done)", km: 67.9, target: '1:45 PM', early: '1:00 PM', late: '2:30 PM', cutoff: '7:36 AM*', crewAccess: true },
  { name: 'Gate', km: 74.03, target: '2:40 PM', early: '1:50 PM', late: '3:45 PM', cutoff: '8:48 AM*', crewAccess: false },
  { name: 'Nature Center', km: 82.43, target: '4:00 PM', early: '2:50 PM', late: '5:30 PM', cutoff: '10:30 AM*', crewAccess: false },
  { name: 'Dam Nation', km: 90.47, target: '5:20 PM', early: '4:00 PM', late: '7:00 PM', cutoff: '12:06 PM*', crewAccess: false },
  { name: 'FINISH — Tyler\'s', km: 99.94, target: '9:00 PM', early: '8:00 PM', late: '10:00 PM', cutoff: '2:00 PM*', crewAccess: true },
];

/** Race start time (race clock 0). Feb 7, 2026 7:00 AM local. */
export const RACE_START_DATE = new Date('2026-02-07T07:00:00');

function formatMinutesToClock(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = Math.floor(totalMinutes % 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

/**
 * Returns a demo runner with a random position (0–6 splits completed) and plausible chip times.
 * Used when demo mode is on or when live fetch fails.
 */
export function getRandomDemoRunner() {
  const startMinutes = 7 * 60; // 7:00 AM
  const numSplits = Math.floor(Math.random() * 7); // 0, 1, 2, 3, 4, 5, or 6
  const splits = [];
  let prevMinutes = startMinutes;
  let prevKm = 0;
  for (let i = 0; i < numSplits; i++) {
    const split = SPLITS_100K_KM[i];
    const segmentKm = split.km - prevKm;
    const minPerKm = 7 + Math.random() * 3; // 7–10 min/km
    const segmentMinutes = segmentKm * minPerKm;
    prevMinutes += segmentMinutes;
    prevKm = split.km;
    splits.push({
      splitId: split.id,
      km: split.km,
      clockTime: formatMinutesToClock(prevMinutes),
    });
  }
  return {
    name: 'Aaron Benson',
    bib: 'TBD',
    splits,
  };
}

/** Fixed demo runner (e.g. when random is not desired). */
export const DEMO_RUNNER = {
  name: 'Aaron Benson',
  bib: 'TBD',
  splits: [
    { splitId: 'split1', km: 12.71, clockTime: '8:15 AM' },
    { splitId: 'split2', km: 35.41, clockTime: '9:50 AM' },
    { splitId: 'split3', km: 44.9, clockTime: '11:15 AM' },
    { splitId: 'split4', km: 67.74, clockTime: '1:30 PM' },
  ],
};
