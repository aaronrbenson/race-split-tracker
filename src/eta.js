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
      planDeltaAtLastSplit: null,
      etas: AID_STATIONS_KM.map((s) => ({
        name: s.name,
        km: s.km,
        eta: '—',
        crewAccess: s.crewAccess,
        planDeltaMinutes: null,
        planStatus: null,
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
      planDeltaAtLastSplit: null,
      etas: AID_STATIONS_KM.map((s) => ({
        name: s.name,
        km: s.km,
        eta: '—',
        crewAccess: s.crewAccess,
        planDeltaMinutes: null,
        planStatus: null,
      })),
    };
  }

  // Forward pace: use last segment; when 3+ splits use rolling 2-segment pace to smooth noise.
  let paceMinPerKm = null;
  if (sorted.length >= 3) {
    const from = sorted[sorted.length - 3];
    const fromMinutes = parseClockToMinutes(from.clockTime);
    if (fromMinutes != null && lastKm > from.km) {
      paceMinPerKm = (lastMinutes - fromMinutes) / (lastKm - from.km);
    }
  }
  if (paceMinPerKm == null && sorted.length >= 2) {
    const prev = sorted[sorted.length - 2];
    const prevMinutes = parseClockToMinutes(prev.clockTime);
    if (prevMinutes != null && lastKm > prev.km) {
      paceMinPerKm = (lastMinutes - prevMinutes) / (lastKm - prev.km);
    }
  }
  if (paceMinPerKm == null) {
    const startMinutes = 7 * 60; // 7:00 AM
    paceMinPerKm = (lastMinutes - startMinutes) / lastKm;
  }

  const startMinutes = 7 * 60; // 7:00 AM
  const firstSplit = sorted[0];
  const firstMin = parseClockToMinutes(firstSplit.clockTime);

  function etaMinutesForStation(st) {
    if (st.km <= lastKm) {
      const before = sorted.filter((s) => s.km <= st.km);
      const after = sorted.filter((s) => s.km > st.km);
      if (after.length === 0) return lastMinutes;
      if (before.length === 0) {
        const b = after[0];
        const bMin = parseClockToMinutes(b.clockTime);
        if (bMin == null) return null;
        const paceToFirst = firstMin != null ? (firstMin - startMinutes) / firstSplit.km : null;
        return paceToFirst != null ? startMinutes + paceToFirst * st.km : null;
      }
      const a = before[before.length - 1];
      const b = after[0];
      const aMin = parseClockToMinutes(a.clockTime);
      const bMin = parseClockToMinutes(b.clockTime);
      if (aMin == null || bMin == null) return null;
      const t = (st.km - a.km) / (b.km - a.km);
      return aMin + t * (bMin - aMin);
    }
    return lastMinutes + paceMinPerKm * (st.km - lastKm);
  }

  const lastStationIndex = AID_STATIONS_KM.length - 1;

  const etas = AID_STATIONS_KM.map((station, index) => {
    let etaMinutes = etaMinutesForStation(station);
    const etaStr = etaMinutes != null ? formatMinutesToClock(etaMinutes) : '—';
    let planDeltaMinutes = null;
    let planStatus = null;
    if (etaMinutes != null && station.target && station.target !== '—') {
      let targetMinutes = parseClockToMinutes(station.target);
      if (targetMinutes != null) {
        // For the finish line only: use an adjusted target so the status matches the trend.
        // If you're 74 min behind at the last aid station, we compare finish ETA to (9:30 - 74 min)
        // so you don't suddenly show "76 min ahead" when you were behind everywhere else.
        const isFinish = index === lastStationIndex;
        if (isFinish && lastStationIndex > 0) {
          const prevStation = AID_STATIONS_KM[lastStationIndex - 1];
          const prevEta = etaMinutesForStation(prevStation);
          const prevTarget = prevStation.target && prevStation.target !== '—' ? parseClockToMinutes(prevStation.target) : null;
          if (prevEta != null && prevTarget != null) {
            const deficitAtPrev = prevEta - prevTarget;
            targetMinutes = targetMinutes - deficitAtPrev;
          }
        }
        planDeltaMinutes = Math.round(etaMinutes - targetMinutes);
        const threshold = 5;
        planStatus = planDeltaMinutes < -threshold ? 'ahead' : planDeltaMinutes > threshold ? 'behind' : 'on';
      }
    }
    return {
      name: station.name,
      km: station.km,
      eta: etaStr,
      crewAccess: station.crewAccess,
      planDeltaMinutes,
      planStatus,
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

  // Global "vs plan" at current position: interpolate plan target at lastKm, compare to lastMinutes.
  let planDeltaAtLastSplit = null;
  const beforeStations = AID_STATIONS_KM.filter((s) => s.km <= lastKm);
  const afterStations = AID_STATIONS_KM.filter((s) => s.km > lastKm);
  if (beforeStations.length > 0 && afterStations.length > 0) {
    const a = beforeStations[beforeStations.length - 1];
    const b = afterStations[0];
    const aTarget = a.target && a.target !== '—' ? parseClockToMinutes(a.target) : null;
    const bTarget = b.target && b.target !== '—' ? parseClockToMinutes(b.target) : null;
    if (aTarget != null && bTarget != null && b.km > a.km) {
      const t = (lastKm - a.km) / (b.km - a.km);
      const planTargetAtLast = aTarget + t * (bTarget - aTarget);
      planDeltaAtLastSplit = Math.round(lastMinutes - planTargetAtLast);
    }
  } else if (beforeStations.length > 0) {
    const s = beforeStations[beforeStations.length - 1];
    const targetMin = s.target && s.target !== '—' ? parseClockToMinutes(s.target) : null;
    if (targetMin != null) planDeltaAtLastSplit = Math.round(lastMinutes - targetMin);
  }

  return {
    lastSplit: {
      km: lastKm,
      clockTime: last.clockTime,
      label: lastSplitLabel,
    },
    planDeltaAtLastSplit,
    etas,
  };
}
