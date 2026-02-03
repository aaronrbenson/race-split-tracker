import { AID_STATIONS_KM, SPLITS_100K_KM } from './data.js';

/**
 * Parse "9:15 AM" / "1:45 PM" into minutes from midnight (local).
 */
function parseClockToMinutes(clockStr) {
  const match = clockStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const pm = (match[3] || '').toUpperCase() === 'PM';
  if (pm && h !== 12) h += 12;
  if (!pm && h === 12) h = 0;
  return h * 60 + m;
}

/**
 * Format minutes-from-midnight as "9:15 AM" / "1:45 PM".
 */
function formatMinutesToClock(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = Math.floor(totalMinutes % 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

/**
 * Compute ETAs for all aid stations given runner's split data.
 * @param {Array<{ km: number, clockTime: string }>} splits - ascending by km, clock times like "9:15 AM"
 * @returns {{ lastSplit: { km: number, clockTime: string, label?: string }, etas: Array<{ name: string, km: number, eta: string, crewAccess: boolean }> }}
 */
export function computeETAs(splits) {
  if (!splits || splits.length === 0) {
    return {
      lastSplit: null,
      etas: AID_STATIONS_KM.map((s) => ({
        name: s.name,
        km: s.km,
        eta: '—',
        crewAccess: s.crewAccess,
      })),
    };
  }

  const sorted = [...splits].sort((a, b) => a.km - b.km);
  const last = sorted[sorted.length - 1];
  const lastKm = last.km;
  const lastMinutes = parseClockToMinutes(last.clockTime);
  if (lastMinutes == null) {
    return {
      lastSplit: { km: lastKm, clockTime: last.clockTime },
      etas: AID_STATIONS_KM.map((s) => ({
        name: s.name,
        km: s.km,
        eta: '—',
        crewAccess: s.crewAccess,
      })),
    };
  }

  // Segment pace: (min per km) from previous split to last split
  let paceMinPerKm = null;
  if (sorted.length >= 2) {
    const prev = sorted[sorted.length - 2];
    const prevMinutes = parseClockToMinutes(prev.clockTime);
    if (prevMinutes != null && lastKm > prev.km) {
      paceMinPerKm = (lastMinutes - prevMinutes) / (lastKm - prev.km);
    }
  }
  // Otherwise use overall pace from start (0 km at 7:00 AM = 420 min)
  if (paceMinPerKm == null) {
    const startMinutes = 7 * 60; // 7:00 AM
    paceMinPerKm = (lastMinutes - startMinutes) / lastKm;
  }

  const startMinutes = 7 * 60; // 7:00 AM
  const firstSplit = sorted[0];
  const firstMin = parseClockToMinutes(firstSplit.clockTime);

  const etas = AID_STATIONS_KM.map((station) => {
    let etaMinutes;
    if (station.km <= lastKm) {
      const before = sorted.filter((s) => s.km <= station.km);
      const after = sorted.filter((s) => s.km > station.km);
      if (after.length === 0) {
        etaMinutes = lastMinutes;
      } else if (before.length === 0) {
        const b = after[0];
        const bMin = parseClockToMinutes(b.clockTime);
        if (bMin == null) etaMinutes = null;
        else {
          const paceToFirst = firstMin != null ? (firstMin - startMinutes) / firstSplit.km : null;
          if (paceToFirst != null) etaMinutes = startMinutes + paceToFirst * station.km;
          else etaMinutes = null;
        }
      } else {
        const a = before[before.length - 1];
        const b = after[0];
        const aMin = parseClockToMinutes(a.clockTime);
        const bMin = parseClockToMinutes(b.clockTime);
        if (aMin == null || bMin == null) etaMinutes = null;
        else {
          const t = (station.km - a.km) / (b.km - a.km);
          etaMinutes = aMin + t * (bMin - aMin);
        }
      }
    } else {
      etaMinutes = lastMinutes + paceMinPerKm * (station.km - lastKm);
    }
    const etaStr = etaMinutes != null ? formatMinutesToClock(etaMinutes) : '—';
    return {
      name: station.name,
      km: station.km,
      eta: etaStr,
      crewAccess: station.crewAccess,
    };
  });

  let lastSplitLabel = `${lastKm.toFixed(1)} km`;
  if (last.splitId) {
    const match = last.splitId.match(/^split(\d)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      lastSplitLabel = n === 6 ? 'Split 6/6 (Finish)' : `Split ${n}/6`;
    }
  }

  return {
    lastSplit: {
      km: lastKm,
      clockTime: last.clockTime,
      label: lastSplitLabel,
    },
    etas,
  };
}
