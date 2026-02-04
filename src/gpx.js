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
 * Get lat/lon at a given distance along the track (linear interpolation between points).
 * @param {{ lat: number, lon: number, cumulKm: number }[]} track
 * @param {number} distanceKm - distance in km along the track (0 to trackLength)
 * @returns {{ lat: number, lon: number } | null}
 */
export function getPositionAtDistance(track, distanceKm) {
  if (track.length === 0) return null;
  const total = track[track.length - 1].cumulKm;
  if (total <= 0) return { lat: track[0].lat, lon: track[0].lon };
  // Clamp to 0..total (loop: if past end, could wrap; for now we clamp)
  let d = Math.max(0, Math.min(distanceKm, total));
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i];
    const b = track[i + 1];
    if (d >= a.cumulKm && d <= b.cumulKm) {
      const seg = b.cumulKm - a.cumulKm;
      const t = seg > 0 ? (d - a.cumulKm) / seg : 0;
      return {
        lat: a.lat + t * (b.lat - a.lat),
        lon: a.lon + t * (b.lon - a.lon),
      };
    }
  }
  return { lat: track[track.length - 1].lat, lon: track[track.length - 1].lon };
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
