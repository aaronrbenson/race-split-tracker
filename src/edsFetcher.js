import { SPLITS_100K_KM } from './data.js';

const RACE_START_MINUTES = 7 * 60; // 7:00 AM

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
 * Parse EDS chip time "HH:MM:SS" (elapsed from race start) into minutes from midnight.
 * Returns null if not parseable.
 */
function parseChipTimeToMinutes(str) {
  const trimmed = (str || '').trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const elapsedMinutes = hours * 60 + minutes + seconds / 60;
  return RACE_START_MINUTES + elapsedMinutes;
}

/**
 * Build runner detail URL from base URL and bib.
 */
function buildRunnerUrl(baseUrl, bib) {
  const base = (baseUrl || '').trim().replace(/\/$/, '');
  return `${base}/index.php?search_type=runner_info&bib=${encodeURIComponent(bib)}`;
}

/**
 * Parse EDS runner detail HTML into { name, bib, splits } or null.
 * Uses only Lap 1–6 Chip Time (not gun time). Skips laps with "Active" or non-HH:MM:SS.
 */
function parseRunnerPage(html, bib) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows = doc.querySelectorAll('tr');
  let name = 'Runner';
  const lapTimes = {}; // lap number (1-6) -> clock time string

  for (const row of rows) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 2) continue;
    const label = (cells[0].textContent || '').trim();
    const value = (cells[1].textContent || '').trim();

    if (label === 'Name' && value) name = value;

    const lapMatch = label.match(/^Lap (\d) Chip Time$/i);
    if (lapMatch) {
      const lapNum = parseInt(lapMatch[1], 10);
      if (lapNum >= 1 && lapNum <= 6) {
        const clockMinutes = parseChipTimeToMinutes(value);
        if (clockMinutes != null) {
          lapTimes[lapNum] = formatMinutesToClock(clockMinutes);
        }
      }
    }
  }

  const splits = [];
  for (let n = 1; n <= 6; n++) {
    if (lapTimes[n]) {
      splits.push({
        splitId: `split${n}`,
        km: SPLITS_100K_KM[n - 1].km,
        clockTime: lapTimes[n],
      });
    }
  }

  if (splits.length === 0) return null;
  return { name, bib, splits };
}

/**
 * Fetch runner info from EDS results page.
 * @param {string} baseUrl - e.g. http://edsresults.com/2025rr100/
 * @param {string} bib - runner bib number
 * @returns {Promise<{ name: string, bib: string, splits: Array } | null>}
 */
export async function fetchRunnerInfo(baseUrl, bib) {
  if (!baseUrl || !bib) return null;
  const url = buildRunnerUrl(baseUrl, bib);
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const html = await res.text();
    return parseRunnerPage(html, bib);
  } catch {
    return null;
  }
}
