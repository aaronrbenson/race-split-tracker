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

/** Total 100K race distance in km (for progress %). */
export const RACE_DISTANCE_KM = 100.12;

/**
 * Aid stations from crew guide v2 (conservative pacing). Distances in km.
 * km values derived from map track positions (getAidStationRaceKmFromTrack) so progress table
 * aligns with map markers; fallback uses trackLengthKm ≈ 35.7 when GPX not loaded.
 */
export const AID_STATIONS_KM = [
  { name: "START — Tyler's", km: 0, target: '7:00 AM', early: '—', late: '—', cutoff: '—', crewAccess: true },
  { name: "Tyler's (Prologue done)", km: 3.5, target: '7:20 AM', early: '7:12 AM', late: '7:28 AM', cutoff: '—', crewAccess: true },
  { name: 'Gate', km: 8.6, target: '7:50 AM', early: '7:42 AM', late: '8:00 AM', cutoff: '—', crewAccess: false },
  { name: 'Nature Center', km: 16.82, target: '8:32 AM', early: '8:18 AM', late: '8:50 AM', cutoff: '—', crewAccess: false },
  { name: 'Dam Nation', km: 26.45, target: '9:12 AM', early: '8:55 AM', late: '9:35 AM', cutoff: '—', crewAccess: false },
  { name: "Tyler's (Lap 1 done)", km: 36.87, target: '10:08 AM', early: '9:45 AM', late: '10:35 AM', cutoff: '—', crewAccess: true },
  { name: 'Gate', km: 42.76, target: '10:45 AM', early: '10:18 AM', late: '11:18 AM', cutoff: '—', crewAccess: false },
  { name: 'Nature Center', km: 50.68, target: '11:35 AM', early: '11:00 AM', late: '12:15 PM', cutoff: '—', crewAccess: false },
  { name: 'Dam Nation', km: 60.31, target: '12:22 PM', early: '11:48 AM', late: '1:00 PM', cutoff: '—', crewAccess: false },
  { name: "Tyler's (Lap 2 done)", km: 70.25, target: '2:00 PM', early: '1:15 PM', late: '2:45 PM', cutoff: '7:36 AM*', crewAccess: true },
  { name: 'Gate', km: 76.14, target: '2:58 PM', early: '2:08 PM', late: '4:00 PM', cutoff: '8:48 AM*', crewAccess: false },
  { name: 'Nature Center', km: 84.06, target: '4:22 PM', early: '3:25 PM', late: '5:45 PM', cutoff: '10:30 AM*', crewAccess: false },
  { name: 'Dam Nation', km: 93.69, target: '5:45 PM', early: '4:45 PM', late: '7:15 PM', cutoff: '12:06 PM*', crewAccess: false },
  { name: 'FINISH — Tyler\'s', km: 100.12, target: '9:30 PM', early: '8:30 PM', late: '10:30 PM', cutoff: '2:00 PM*', crewAccess: true },
];

/** Race start time (race clock 0). Feb 7, 2026 7:00 AM local. */
export const RACE_START_DATE = new Date('2026-02-07T07:00:00');
