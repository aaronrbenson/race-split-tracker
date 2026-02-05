/**
 * Parse GPX track and compute position at a given race distance (km).
 * Handles loop courses and optional prologue offset (track may start after race km 0).
 */

/** Earth radius in km for Haversine. */
const R = 6371;

function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Parse GPX XML string. Extracts all <trkpt> from first <trk><trkseg>.
 * @param {string} xml
 * @returns {{ lat: number, lon: number }[]} points in order
 */
export function parseGpxTrack(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('Invalid GPX: ' + parseError.textContent);

  // GPX 1.1 uses default ns; getElementsByTagNameNS or local name
  const trkpts = doc.getElementsByTagName('trkpt');
  const points = [];
  for (let i = 0; i < trkpts.length; i++) {
    const pt = trkpts[i];
    const lat = parseFloat(pt.getAttribute('lat'), 10);
    const lon = parseFloat(pt.getAttribute('lon'), 10);
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    points.push({ lat, lon });
  }
  return points;
}

/**
 * Build track with cumulative distance (km) for each point.
 * @param {{ lat: number, lon: number }[]} points
 * @returns {{ lat: number, lon: number, cumulKm: number }[]}
 */
export function buildTrackWithDistance(points) {
  if (points.length === 0) return [];
  const out = [{ ...points[0], cumulKm: 0 }];
  let cumul = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    cumul += haversineKm(a.lat, a.lon, b.lat, b.lon);
    out.push({ ...b, cumulKm: cumul });
  }
  return out;
}

/**
 * Bearing in degrees from North (0 = N, 90 = E, 180 = S, 270 = W) from point a to b.
 */
function bearingBetween(latA, lonA, latB, lonB) {
  const toRad = (x) => (x * Math.PI) / 180;
  const lat1 = toRad(latA);
  const lat2 = toRad(latB);
  const dLon = toRad(lonB - lonA);
  const x = Math.sin(dLon) * Math.cos(lat2);
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  let bearing = (Math.atan2(x, y) * 180) / Math.PI;
  if (bearing < 0) bearing += 360;
  return bearing;
}

/**
 * Get lat/lon and bearing at a given distance along the track (linear interpolation between points).
 * @param {{ lat: number, lon: number, cumulKm: number }[]} track
 * @param {number} distanceKm - distance in km along the track (0 to trackLength)
 * @returns {{ lat: number, lon: number, bearing: number } | null} bearing in degrees from North
 */
export function getPositionAtDistance(track, distanceKm) {
  if (track.length === 0) return null;
  const total = track[track.length - 1].cumulKm;
  if (total <= 0) {
    const b = track.length > 1 ? track[1] : track[0];
    return {
      lat: track[0].lat,
      lon: track[0].lon,
      bearing: bearingBetween(track[0].lat, track[0].lon, b.lat, b.lon),
    };
  }
  let d = Math.max(0, Math.min(distanceKm, total));
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i];
    const b = track[i + 1];
    if (d >= a.cumulKm && d <= b.cumulKm) {
      const seg = b.cumulKm - a.cumulKm;
      const t = seg > 0 ? (d - a.cumulKm) / seg : 0;
      const bearing = bearingBetween(a.lat, a.lon, b.lat, b.lon);
      return {
        lat: a.lat + t * (b.lat - a.lat),
        lon: a.lon + t * (b.lon - a.lon),
        bearing,
      };
    }
  }
  const last = track.length - 1;
  const a = track[last - 1];
  const b = track[last];
  return {
    lat: track[last].lat,
    lon: track[last].lon,
    bearing: bearingBetween(a.lat, a.lon, b.lat, b.lon),
  };
}

/**
 * Get distance along the track (km) for the closest point on the track to (lat, lon).
 * Projects the point onto each segment and returns the cumulative km of the closest projection.
 * @param {{ lat: number, lon: number, cumulKm: number }[]} track
 * @param {number} lat
 * @param {number} lon
 * @returns {number | null} distance in km along the track, or null if track is empty
 */
export function getDistanceAlongTrack(track, lat, lon) {
  if (!track || track.length === 0) return null;
  if (track.length === 1) return track[0].cumulKm;

  let bestKm = track[0].cumulKm;
  let bestDist = haversineKm(lat, lon, track[0].lat, track[0].lon);

  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i];
    const b = track[i + 1];
    const segLat = b.lat - a.lat;
    const segLon = b.lon - a.lon;
    const dlat = lat - a.lat;
    const dlon = lon - a.lon;
    const segLen2 = segLat * segLat + segLon * segLon;
    const t = segLen2 > 0 ? Math.max(0, Math.min(1, (dlat * segLat + dlon * segLon) / segLen2)) : 0;
    const projLat = a.lat + t * segLat;
    const projLon = a.lon + t * segLon;
    const dist = haversineKm(lat, lon, projLat, projLon);
    if (dist < bestDist) {
      bestDist = dist;
      bestKm = a.cumulKm + t * (b.cumulKm - a.cumulKm);
    }
  }

  const last = track[track.length - 1];
  const lastDist = haversineKm(lat, lon, last.lat, last.lon);
  if (lastDist < bestDist) {
    bestKm = last.cumulKm;
  }

  return bestKm;
}

/**
 * Get lat/lon points for a track segment between two distances (km).
 * Interpolates exact positions at startKm and endKm so the segment aligns with runner position.
 * @param {{ lat: number, lon: number, cumulKm: number }[]} track
 * @param {number} startKm - start of segment (track km)
 * @param {number} endKm - end of segment (track km)
 * @returns {{ lat: number, lon: number }[]} points for the segment (empty if startKm >= endKm or fewer than 2 points)
 */
export function getTrackSegmentPoints(track, startKm, endKm) {
  if (!track || track.length === 0 || startKm >= endKm) return [];
  const total = track[track.length - 1].cumulKm;
  if (total <= 0) return [];
  const startClamped = Math.max(0, Math.min(startKm, total));
  const endClamped = Math.max(0, Math.min(endKm, total));
  if (startClamped >= endClamped) return [];

  const startPos = getPositionAtDistance(track, startClamped);
  const endPos = getPositionAtDistance(track, endClamped);
  if (!startPos || !endPos) return [];

  const points = [];
  points.push({ lat: startPos.lat, lon: startPos.lon });

  for (let i = 0; i < track.length; i++) {
    const p = track[i];
    if (p.cumulKm > startClamped && p.cumulKm < endClamped) {
      points.push({ lat: p.lat, lon: p.lon });
    }
  }

  points.push({ lat: endPos.lat, lon: endPos.lon });
  return points.length >= 2 ? points : [];
}

/**
 * Lap-start track km for the current lap (for drawing "completed" segment).
 * Prologue / join: 0. Lap 0: prologueTrackKm. Laps 1 and 2: 0.
 * @param {number} raceKm
 * @param {number} trackLengthKm
 * @param {number} raceStartKm
 * @param {number} raceDistanceKm
 * @returns {number} track km at which the current lap started
 */
export function getLapStartTrackKmForRaceKm(raceKm, trackLengthKm, raceStartKm = 3.5, raceDistanceKm = 100.12) {
  if (raceKm <= 0 || raceKm >= raceDistanceKm) return 0;
  const loopLengthRaceKm = raceDistanceKm / 3;
  if (raceKm <= raceStartKm) return 0;
  const raceKmIntoLoops = raceKm - raceStartKm;
  const lapIndex = Math.floor(raceKmIntoLoops / loopLengthRaceKm);
  if (lapIndex === 0) {
    return Math.min(raceStartKm - PROLOGUE_TOTAL_KM, trackLengthKm);
  }
  return 0;
}

/**
 * Map race distance (km) to track distance (km) when track may not include prologue.
 * - raceStartKm: race km at which the track starts (e.g. 3.5 if prologue is missing)
 * - raceDistanceKm: total race distance (e.g. 100.12)
 * If raceKm < raceStartKm, returns 0 (runner before track start).
 * If raceKm > raceDistanceKm, returns trackLength (runner past finish).
 */
export function raceKmToTrackKm(raceKm, trackLengthKm, raceStartKm = 0, raceDistanceKm = 100.12) {
  if (raceKm <= raceStartKm) return 0;
  if (raceKm >= raceDistanceKm) return trackLengthKm;
  const raceSegment = raceDistanceKm - raceStartKm;
  const raceProgress = (raceKm - raceStartKm) / raceSegment;
  return raceProgress * trackLengthKm;
}

/** Prologue out-and-back: out 1.25 km, back 1.25 km (2.5 km total) before joining the main loop. */
export const PROLOGUE_OUT_KM = 1.25;
export const PROLOGUE_TOTAL_KM = PROLOGUE_OUT_KM * 2;

/**
 * Map race distance to track distance when the race is 3 loops with a prologue out-and-back.
 * Prologue: 0–1.25 km = out along track, 1.25–2.5 km = back to start, 2.5–raceStartKm = first km of loop.
 * Then three full loops; first lap starts at track km 1 so we join smoothly after the prologue.
 */
export function raceKmToTrackKmThreeLoops(raceKm, trackLengthKm, raceStartKm = 0, raceDistanceKm = 100.12) {
  if (raceKm <= 0) return 0;
  if (raceKm >= raceDistanceKm) return trackLengthKm;

  const loopLengthRaceKm = raceDistanceKm / 3;

  /* Prologue: out 1.25 km, back 1.25 km along the track */
  if (raceKm <= PROLOGUE_OUT_KM) {
    return Math.min(raceKm, trackLengthKm);
  }
  if (raceKm <= PROLOGUE_TOTAL_KM) {
    return Math.max(0, PROLOGUE_TOTAL_KM - raceKm);
  }

  /* 2.5 to raceStartKm: first stretch along the track (0 to raceStartKm - 2.5) so we join the loop */
  if (raceKm <= raceStartKm) {
    const segmentKm = raceKm - PROLOGUE_TOTAL_KM;
    return Math.min(segmentKm, trackLengthKm);
  }

  /* Main loop: laps start at raceStartKm. First lap uses track from (raceStartKm - 2.5) so we're continuous. */
  const raceKmIntoLoops = raceKm - raceStartKm;
  const lapIndex = Math.floor(raceKmIntoLoops / loopLengthRaceKm);
  const kmInLap = raceKmIntoLoops - lapIndex * loopLengthRaceKm;
  const trackKmInLap = (kmInLap / loopLengthRaceKm) * trackLengthKm;

  if (lapIndex === 0) {
    const prologueTrackKm = Math.min(raceStartKm - PROLOGUE_TOTAL_KM, trackLengthKm);
    return prologueTrackKm + (trackLengthKm - prologueTrackKm) * (kmInLap / loopLengthRaceKm);
  }

  return trackKmInLap;
}

/**
 * Inverse of raceKmToTrackKmThreeLoops: given track km and lap index, return race km.
 * lapIndex 0 = first full lap (after prologue), 1 = second lap, 2 = third lap.
 */
export function trackKmToRaceKmForLap(trackKm, lapIndex, trackLengthKm, raceStartKm = 3.5, raceDistanceKm = 100.12) {
  const loopLengthRaceKm = raceDistanceKm / 3;
  const prologueTrackKm = Math.min(raceStartKm - PROLOGUE_TOTAL_KM, trackLengthKm);

  if (lapIndex === 0) {
    const kmInLap = ((trackKm - prologueTrackKm) / (trackLengthKm - prologueTrackKm)) * loopLengthRaceKm;
    return raceStartKm + kmInLap;
  }
  const kmInLap = (trackKm / trackLengthKm) * loopLengthRaceKm;
  return raceStartKm + lapIndex * loopLengthRaceKm + kmInLap;
}

/** Track km positions for aid stations (from map placement). Used to derive race km for progress table. */
const AID_TRACK_KM_MAP = {
  Tylers: 0.51,
  Gate: 6.3,
  'Nature Center': 14.87,
  'Dam Nation': 24.89,
};

/**
 * Return race km for each of the 14 aid stations in AID_STATIONS_KM order, so progress table aligns with map.
 * Uses same prologue/loop math as raceKmToTrackKmThreeLoops.
 */
export function getAidStationRaceKmFromTrack(trackLengthKm, raceStartKm = 3.5, raceDistanceKm = 100.12) {
  const loopLengthRaceKm = raceDistanceKm / 3;
  const endLap0 = raceStartKm + loopLengthRaceKm;
  const endLap1 = raceStartKm + 2 * loopLengthRaceKm;

  const gate = (lap) => trackKmToRaceKmForLap(AID_TRACK_KM_MAP.Gate, lap, trackLengthKm, raceStartKm, raceDistanceKm);
  const natureCenter = (lap) => trackKmToRaceKmForLap(AID_TRACK_KM_MAP['Nature Center'], lap, trackLengthKm, raceStartKm, raceDistanceKm);
  const damNation = (lap) => trackKmToRaceKmForLap(AID_TRACK_KM_MAP['Dam Nation'], lap, trackLengthKm, raceStartKm, raceDistanceKm);

  return [
    0,
    raceStartKm,
    gate(0),
    natureCenter(0),
    damNation(0),
    endLap0,
    gate(1),
    natureCenter(1),
    damNation(1),
    endLap1,
    gate(2),
    natureCenter(2),
    damNation(2),
    raceDistanceKm,
  ];
}

/**
 * Parse GPX and build track with cumulative distances.
 * @param {string} xml
 * @returns {{ points: { lat, lon, cumulKm }[], trackLengthKm: number, bounds: [[number,number],[number,number]] }}
 */
export function parseGpxToTrack(xml) {
  const points = parseGpxTrack(xml);
  const track = buildTrackWithDistance(points);
  const trackLengthKm = track.length ? track[track.length - 1].cumulKm : 0;
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const bounds = [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  ];
  return { points: track, trackLengthKm, bounds };
}
