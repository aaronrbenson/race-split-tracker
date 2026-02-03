/**
 * Field check-in API for Rocky 100K crew tracker.
 * GET (no query) — return { bib } from Redis (stored default bib).
 * GET ?bib=X — return latest check-in for bib (or 404).
 * POST body: { bib } — store default bib in Redis.
 * POST body: { bib, km, clockTime } — store check-in (one per bib, overwrites) and update stored bib.
 * DELETE ?bib=X — delete check-in for bib. DELETE (no query) — purge all check-ins.
 * Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (e.g. from Vercel + Upstash).
 */

const RACE_DISTANCE_KM = 100.12;
const CHECKIN_TTL_SEC = 24 * 60 * 60; // 24h
const TIME_PATTERN = /^\d{1,2}:\d{2}\s*[AP]M$/i;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, status, data) {
  cors(res);
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'DELETE') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  let redis;
  try {
    const { Redis } = await import('@upstash/redis');
    redis = Redis.fromEnv();
  } catch (e) {
    console.error('Redis init failed', e);
    json(res, 503, { error: 'Check-in store not configured (Redis env missing)' });
    return;
  }

  const bibQuery = (req.query?.bib ?? '').toString().trim();
  const bibBody = (req.body && req.body.bib != null) ? String(req.body.bib).trim() : '';

  if (req.method === 'GET' && !bibQuery) {
    try {
      const storedBib = await redis.get('rocky:bib');
      json(res, 200, { bib: storedBib != null ? String(storedBib) : '' });
    } catch (e) {
      console.error('Redis GET rocky:bib failed', e);
      json(res, 500, { error: 'Failed to read config' });
    }
    return;
  }

  const bib = bibQuery || bibBody;

  if (req.method === 'DELETE' && !bib) {
    try {
      const keys = await redis.keys('rocky:checkin:*');
      const count = keys.length;
      if (count > 0) {
        await redis.del(...keys);
      }
      json(res, 200, { ok: true, deleted: count });
    } catch (e) {
      console.error('Redis purge failed', e);
      json(res, 500, { error: 'Failed to purge check-ins' });
    }
    return;
  }

  if (!bib) {
    json(res, 400, { error: 'Missing bib' });
    return;
  }

  const key = `rocky:checkin:${bib}`;

  if (req.method === 'GET') {
    try {
      const raw = await redis.get(key);
      if (raw == null) {
        json(res, 404, { error: 'No check-in for this bib' });
        return;
      }
      json(res, 200, raw);
    } catch (e) {
      console.error('Redis GET failed', e);
      json(res, 500, { error: 'Failed to read check-in' });
    }
    return;
  }

  if (req.method === 'DELETE') {
    try {
      await redis.del(key);
      json(res, 200, { ok: true });
    } catch (e) {
      console.error('Redis DEL failed', e);
      json(res, 500, { error: 'Failed to reset check-in' });
    }
    return;
  }

  // POST
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      json(res, 400, { error: 'Invalid JSON body' });
      return;
    }
  }

  const km = body?.km != null ? Number(body.km) : NaN;
  const clockTime = (body?.clockTime ?? '').toString().trim();
  const isCheckin = !Number.isNaN(km) && km >= 0 && km <= RACE_DISTANCE_KM && TIME_PATTERN.test(clockTime);

  if (isCheckin) {
    const value = { km, clockTime, at: new Date().toISOString() };
    try {
      await redis.set(key, value, { ex: CHECKIN_TTL_SEC });
      if (bib) await redis.set('rocky:bib', bib);
      json(res, 200, value);
    } catch (e) {
      console.error('Redis SET failed', e);
      json(res, 500, { error: 'Failed to save check-in' });
    }
    return;
  }

  if (bib) {
    try {
      await redis.set('rocky:bib', bib);
      json(res, 200, { ok: true });
    } catch (e) {
      console.error('Redis SET rocky:bib failed', e);
      json(res, 500, { error: 'Failed to save bib' });
    }
    return;
  }

  json(res, 400, { error: 'Missing bib or check-in data (km, clockTime)' });
}
