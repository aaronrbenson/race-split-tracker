import { RACE_DISTANCE_KM, RACE_START_MINUTES, SPLITS_100K_KM } from './data.js';
import { computeETAs } from './eta.js';
import { fetchRunnerInfo } from './edsFetcher.js';
import { isTestModeActive, getTestRunnerState, startTestMode } from './testMode.js';
import { isDemoModeActive, getRandomDemoState } from './demoMode.js';
import { isReplayActive, getReplayRunnerState, startReplay, isReplayFinished } from './replayRace.js';

const DEFAULT_RESULTS_URL = 'http://edsresults.com/2026rr100/';
const DEFAULT_BIB = 'TBD';

const ADMIN_KEY_ACTIVE = 'rocky_admin_active';
const ADMIN_KEY_KM = 'rocky_admin_km';
const ADMIN_KEY_TIME = 'rocky_admin_time';

/** Time format expected by ETA logic: e.g. "2:30 PM", "9:15 AM" */
const TIME_PATTERN = /^\d{1,2}:\d{2}\s*[AP]M$/i;

/** Current local time as "H:MM AM/PM" for check-in. */
function getCurrentClockTime() {
  const d = new Date();
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Base URL for API (same origin in production). */
function getApiBase() {
  return '';
}

/**
 * Fetch stored bib from server. Returns bib string or null.
 */
async function fetchBibFromServer() {
  const base = getApiBase();
  const res = await fetch(`${base}/api/checkin`);
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  const bib = data?.bib != null ? String(data.bib).trim() : '';
  return bib || null;
}

/**
 * Fetch latest field check-in for bib. Returns { km, clockTime } or null.
 */
async function fetchFieldCheckin(bib) {
  const base = getApiBase();
  const url = `${base}/api/checkin?bib=${encodeURIComponent(bib)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data && typeof data.km === 'number' && data.clockTime) return data;
  return null;
}

/**
 * Submit a field check-in. Returns { ok: boolean, error?: string }.
 */
async function submitFieldCheckin(bib, km, clockTime) {
  const base = getApiBase();
  const res = await fetch(`${base}/api/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bib, km, clockTime }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || res.statusText || 'Failed' };
  return { ok: true };
}

function getAdminOverride() {
  if (localStorage.getItem(ADMIN_KEY_ACTIVE) !== 'true') return null;
  const time = (localStorage.getItem(ADMIN_KEY_TIME) || '').trim();
  const kmRaw = localStorage.getItem(ADMIN_KEY_KM);
  if (!time || !TIME_PATTERN.test(time) || kmRaw === null || kmRaw === '') return null;
  const km = parseFloat(kmRaw, 10);
  if (Number.isNaN(km) || km < 0 || km > RACE_DISTANCE_KM) return null;
  return { km, clockTime: time };
}

/** Format elapsed minutes as "Xh Ym" for time on course. */
function formatTimeOnCourse(totalMinutes) {
  if (totalMinutes == null || Number.isNaN(totalMinutes) || totalMinutes < 0) return null;
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Parse "HH:MM:SS" (elapsed) to total minutes. */
function parseHHMMSSToMinutes(str) {
  const match = (str || '').trim().match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const s = parseInt(match[3], 10);
  return h * 60 + m + s / 60;
}

/** Parse "9:15 AM" to minutes from midnight. */
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

/** Emoji by race phase: runner until final 10k, then skull. */
function getProgressEmoji(km) {
  return km >= 90 ? '💀' : '🏃';
}

function getConfig() {
  return {
    resultsUrl: localStorage.getItem('rocky_results_url') || DEFAULT_RESULTS_URL,
    bib: localStorage.getItem('rocky_bib') || DEFAULT_BIB,
  };
}

function setConfig({ resultsUrl, bib }) {
  if (resultsUrl != null) localStorage.setItem('rocky_results_url', resultsUrl);
  if (bib != null) localStorage.setItem('rocky_bib', bib);
}

/** Shared status thresholds (minutes behind plan). Used for both next aid station color and How's he doing. */
const STATUS = {
  AHEAD: 'ahead',        // delta < -15
  ON: 'on',              // -15 <= delta <= 15
  BEHIND: 'behind',      // 15 < delta <= 60  (yellow)
  VERY_BEHIND: 'very',   // 60 < delta <= 120 (red)
  CATASTROPHIC: 'cat',   // delta > 120
  STALE: 'stale',        // no update in extreme time
  UNKNOWN: 'unknown',    // no delta data
};

/** Minutes since last split before we consider data "stale". */
const STALE_THRESHOLD_MINUTES = 90;

function getStatusBand(delta) {
  if (delta == null || Number.isNaN(delta)) return STATUS.UNKNOWN;
  if (delta < -15) return STATUS.AHEAD;
  if (delta <= 15) return STATUS.ON;
  if (delta <= 60) return STATUS.BEHIND;
  if (delta <= 120) return STATUS.VERY_BEHIND;
  return STATUS.CATASTROPHIC;
}

/** CSS class for next aid station time, aligned with status band. */
function getProgressTimeClass(statusBand) {
  switch (statusBand) {
    case STATUS.AHEAD: return 'progress-time-ahead';
    case STATUS.ON: return 'progress-time-on';
    case STATUS.BEHIND: return 'progress-time-behind';
    case STATUS.VERY_BEHIND:
    case STATUS.CATASTROPHIC: return 'progress-time-very-behind';
    default: return '';
  }
}

/** Pick one message from array using km for stable variety (doesn't flip every refresh). */
function pickMessage(messages, km) {
  if (!messages || messages.length === 0) return '';
  const idx = Math.floor((km ?? 0) * 0.5) % messages.length;
  return messages[idx];
}

/**
 * Render official splits table on the finished screen.
 * @param {HTMLElement | null} container
 * @param {Array<{ km: number, clockTime: string, splitId?: string }>} splits
 * @param {string | null} totalRaceTime - e.g. "14:30:00"
 */
function renderFinishedSplits(container, splits, totalRaceTime) {
  if (!container) return;
  const sorted = [...splits].filter((s) => s.km != null && s.clockTime).sort((a, b) => a.km - b.km);
  if (sorted.length === 0 && !totalRaceTime) {
    container.innerHTML = '';
    return;
  }
  const rows = sorted.map((s) => {
    const labelMatch = SPLITS_100K_KM.find((sp) => Math.abs(sp.km - s.km) < 0.1 || sp.id === s.splitId);
    const label = labelMatch ? labelMatch.label : `${s.km.toFixed(1)} km`;
    const clockMin = parseClockToMinutes(s.clockTime);
    const elapsed = clockMin != null ? formatTimeOnCourse(clockMin - RACE_START_MINUTES) : '—';
    return { label, km: s.km, clockTime: s.clockTime, elapsed };
  });
  if (totalRaceTime && (rows.length === 0 || rows[rows.length - 1].km < 99)) {
    rows.push({
      label: 'Finish',
      km: RACE_DISTANCE_KM,
      clockTime: '—',
      elapsed: totalRaceTime,
    });
  } else if (totalRaceTime && rows.length > 0) {
    rows[rows.length - 1].elapsed = totalRaceTime;
  }
  container.innerHTML = `
    <h2 class="finished-splits-title">Official splits</h2>
    <div class="finished-splits-table-wrap">
      <table class="finished-splits-table" aria-label="Official split times">
        <thead>
          <tr>
            <th scope="col">Split</th>
            <th scope="col">Distance</th>
            <th scope="col">Clock time</th>
            <th scope="col">Elapsed</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td>${r.label}</td>
              <td>${r.km.toFixed(2)} km</td>
              <td>${r.clockTime}</td>
              <td>${r.elapsed}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function isDataStale(lastSplit) {
  if (!lastSplit?.clockTime) return false;
  const nowMin = parseClockToMinutes(getCurrentClockTime());
  const lastMin = parseClockToMinutes(lastSplit.clockTime);
  if (nowMin == null || lastMin == null) return false;
  let minutesSince = nowMin - lastMin;
  if (minutesSince < 0) minutesSince += 24 * 60; // wrap midnight
  return minutesSince > STALE_THRESHOLD_MINUTES;
}

/**
 * @param {HTMLElement} container
 * @param {{ km: number, clockTime: string } | null} lastSplit
 * @param {string | null} totalRaceTime
 * @param {boolean} [skipFillTween] - If true (e.g. test mode), bar and runner use final position immediately so the bar "fills" correctly on each update.
 */
function renderRaceProgress(container, lastSplit, totalRaceTime, skipFillTween = false) {
  if (!container) return;
  const progressKm = lastSplit?.km ?? 0;
  const progressPct = Math.min(100, Math.max(0, (progressKm / RACE_DISTANCE_KM) * 100));
  const isFinished = progressKm >= 99.5;

  let totalDisplay = '—';
  if (isFinished && totalRaceTime) {
    totalDisplay = totalRaceTime;
  } else if (!isFinished && lastSplit?.clockTime) {
    const lastMin = parseClockToMinutes(lastSplit.clockTime);
    if (lastMin != null) {
      const elapsedMin = lastMin - RACE_START_MINUTES;
      totalDisplay = formatTimeOnCourse(elapsedMin) || '—';
    }
  }

  if (isFinished) {
    container.innerHTML = `
      <p class="label">FINISHER</p>
      <div class="race-progress-celebration">
        <span class="race-progress-trophy-wrap">
          <span class="race-progress-trophy" aria-hidden="true">🏆</span>
          <span class="race-progress-trophy-100" aria-hidden="true">💯</span>
        </span>
        <p class="race-progress-celebration-title">Finished!</p>
        <div class="race-progress-stats">
          <p class="race-progress-total">Official time: ${totalDisplay}</p>
        </div>
      </div>
    `;
    return;
  }

  const progressEmoji = getProgressEmoji(progressKm);
  /* Show two runners once in "final stretch" (split 5 = 77.25 km); we never have a split at 82.4 so use 77.25 */
  const hasPacer = progressKm >= 77.25;
  const fillWidth = skipFillTween ? progressPct : 0;
  const runnerLeft = skipFillTween ? progressPct : 0;
  const fillAnimClass = skipFillTween ? '' : ' race-progress-fill-anim';
  const runnerAnimClass = skipFillTween ? '' : ' race-progress-runner-anim';
  const secondRunner = hasPacer ? `<span class="race-progress-runner race-progress-runner-pacer${runnerAnimClass}" style="left: ${runnerLeft}%" data-target="${progressPct}" aria-hidden="true">${progressEmoji}</span>` : '';
  const aidStationMarkers = (aidStations || []).filter((s) => s.km > 0 && s.km < RACE_DISTANCE_KM).map((s) => {
    const pct = (s.km / RACE_DISTANCE_KM) * 100;
    return `<span class="race-progress-aid-marker" style="left: ${pct}%" aria-hidden="true"></span>`;
  }).join('');
  container.innerHTML = `
    <p class="label">Overall Status</p>
    <div class="race-progress-bar-wrap">
      <div class="race-progress-track">
        <div class="race-progress-fill${fillAnimClass}" style="width: ${fillWidth}%"></div>
        ${aidStationMarkers}
        <span class="race-progress-runner${runnerAnimClass}" style="left: ${runnerLeft}%" data-target="${progressPct}" aria-hidden="true">${progressEmoji}</span>
        ${secondRunner}
      </div>
      <span class="race-progress-emoji" aria-hidden="true">💯</span>
    </div>
    <div class="race-progress-stats">
      <p class="race-progress-total">Time: ${totalDisplay}</p>
      <p class="race-progress-total">Est. distance: ${progressKm.toFixed(1)} km</p>
    </div>
  `;
  if (!skipFillTween) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const fill = container.querySelector('.race-progress-fill');
        const runners = container.querySelectorAll('.race-progress-runner');
        if (fill) fill.style.width = `${progressPct}%`;
        runners.forEach((r) => { r.style.left = `${progressPct}%`; });
      });
    });
  }
}

/** Format pace (minutes per km) as "X:XX/km". */
function formatPaceMinPerKm(minPerKm) {
  if (minPerKm == null || !Number.isFinite(minPerKm) || minPerKm < 0) return null;
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm % 1) * 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

function renderLastSplit(container, lastSplit) {
  if (!container) return;
  if (!lastSplit) {
    container.innerHTML = '<p class="label">Last recorded split</p><p>No split data yet.</p>';
    return;
  }
  let avgPaceHtml = '';
  const km = lastSplit.km ?? 0;
  const lastMin = parseClockToMinutes(lastSplit.clockTime);
  if (lastMin != null && km > 0) {
    const elapsed = lastMin - RACE_START_MINUTES;
    if (elapsed >= 0) {
      const pace = elapsed / km;
      const paceStr = formatPaceMinPerKm(pace);
      if (paceStr) avgPaceHtml = `<p class="last-split-pace">Avg pace: ${paceStr}</p>`;
    }
  }
  const sourceText = lastSplit.source === 'checkin' ? 'via Aaron check-in' : 'via official race timer';
  container.innerHTML = `
    <p class="label">Last recorded split</p>
    <p>${km.toFixed(1)} km at ${lastSplit.clockTime}</p>
    <p class="last-split-source">${sourceText}</p>
    ${avgPaceHtml}
  `;
}

/**
 * Get last passed and next upcoming aid station based on last split km.
 */
function getLastNextStations(lastSplitKm, etas) {
  if (!etas || etas.length === 0) return { last: null, next: null };
  let last = null;
  let next = null;
  for (const e of etas) {
    if (e.km <= lastSplitKm) last = e;
    if (e.km > lastSplitKm && next == null) {
      next = e;
      break;
    }
  }
  return { last, next };
}

function renderProgressLine(container, lastSplit, etas) {
  if (!container) return;
  const lastSplitKm = lastSplit?.km ?? 0;
  const { next } = getLastNextStations(lastSplitKm, etas);

  const nextTime = next ? next.eta : '—';
  const nextName = next ? `@ ${(next.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim()}` : '—';
  const nextIsLastNatureCenter = next && next.name.includes('Nature Center') && next.km >= LAST_NATURE_CENTER_KM - 0.1;
  const nextPacerNote = nextIsLastNatureCenter ? '<div class="progress-next-pacer-note">Get ready, Zach!</div>' : '';

  const statusBand = getStatusBand(next?.planDeltaMinutes);
  const nextTimeClass = getProgressTimeClass(statusBand);

  container.innerHTML = `
    <div class="progress-line-inner">
      <div class="progress-station-wrap progress-next-wrap">
        <div class="progress-station-label">Next aid station arrival estimate</div>
        <div class="progress-station progress-next">
          <span class="progress-time ${nextTimeClass}">${nextTime}</span>
          <span class="progress-name">${nextName}</span>
        </div>
        ${nextPacerNote}
      </div>
    </div>
  `;
}

const HOWS_HE_DOING_MESSAGES = {
  [STATUS.AHEAD]: [
    "He's flying! Someone tell him it's a long day.",
    'Ahead of schedule and feeling dangerous.',
    'Crushing it. Crew better not be napping.',
    'Moving faster than planned. Trust the taper.',
  ],
  [STATUS.ON]: [
    'Smooth sailing. Right on plan.',
    'Locked in. Exactly where he needs to be.',
    'On target. Nothing to see here.',
    'Right on schedule. Keep it steady.',
  ],
  [STATUS.BEHIND]: [
    "A little behind, but he's been through worse.",
    'Slightly off pace. Totally manageable.',
    'A few minutes back, nothing to worry about yet.',
    'Behind schedule but still in the game.',
  ],
  [STATUS.VERY_BEHIND]: [
    'Running behind. Time to prep the good snacks.',
    'Significantly off pace. Ready the backup plan.',
    'He could use a boost. Have the essentials ready.',
    'Behind schedule. Stay calm, stay ready.',
  ],
  [STATUS.CATASTROPHIC]: [
    "Uh oh. Break out the pizza and prayers.",
    "Way off pace. Something's going on.",
    "Major delay. Crew, it's time to rally.",
    "This is a tough spot. Support mode activated.",
  ],
  [STATUS.STALE]: [
    "We haven't seen an update in a while.",
    "No recent updates. Last position may be stale.",
    "Data is getting old. Last split was a while ago.",
  ],
};

function getHowsHeDoingState(lastSplit, etas, planDeltaAtLastSplit, skipStaleCheck = false) {
  if (!lastSplit) return null;
  const km = lastSplit.km ?? 0;

  if (!skipStaleCheck && isDataStale(lastSplit)) {
    const messages = HOWS_HE_DOING_MESSAGES[STATUS.STALE];
    const base = pickMessage(messages, km);
    const lastSeen = `${lastSplit.label ?? `${km.toFixed(1)} km`} at ${lastSplit.clockTime}`;
    return { emoji: '⏳', message: `${base} Last seen: ${lastSeen}.`, band: STATUS.STALE };
  }

  const { next } = getLastNextStations(km, etas);
  const statusDelta = next?.planDeltaMinutes ?? planDeltaAtLastSplit;
  const band = getStatusBand(statusDelta);

  if (band === STATUS.UNKNOWN) return null;

  const early = km < 35;
  const messages = HOWS_HE_DOING_MESSAGES[band];
  let message = pickMessage(messages, km);

  if (band === STATUS.AHEAD && early) {
    message = HOWS_HE_DOING_MESSAGES[STATUS.AHEAD][0];
  }

  const emojiMap = {
    [STATUS.AHEAD]: '🚀',
    [STATUS.ON]: '✅',
    [STATUS.BEHIND]: '😅',
    [STATUS.VERY_BEHIND]: '⚠️',
    [STATUS.CATASTROPHIC]: '🆘',
  };
  return { emoji: emojiMap[band] ?? '❓', message, band };
}

function renderHowsHeDoing(container, lastSplit, etas, planDeltaAtLastSplit, isFinished = false, skipStaleCheck = false) {
  if (!container) return;
  if (isFinished) {
    container.style.display = 'none';
    return;
  }
  container.style.display = '';
  const state = getHowsHeDoingState(lastSplit, etas, planDeltaAtLastSplit, skipStaleCheck);
  if (!state) {
    container.innerHTML = '<p class="hows-he-doing-empty">Waiting on Aaron to make his move...</p>';
    return;
  }
  container.innerHTML = `
    <h2 class="hows-he-doing-title">How's he doing?</h2>
    <div class="hows-he-doing-card">
      <span class="hows-he-doing-emoji" aria-hidden="true">${state.emoji}</span>
      <p class="hows-he-doing-message">${state.message}</p>
    </div>
  `;
}

const LAST_NATURE_CENTER_KM = 84.06;

/** Section label for aid station by km (Prologue, Lap 1, Lap 2, Lap 3). Tyler's Prologue (3.5) under Lap 1; Tyler's Lap 2 done (~70) under Lap 3. */
function getEtaSectionLabel(km) {
  if (km < 3.5) return 'Prologue';
  if (km <= 36.87) return 'Lap 1';
  if (km < 67) return 'Lap 2';
  return 'Lap 3';
}

function renderETAs(container, etas, lastSplitKm) {
  if (!container) return;
  const cleared = lastSplitKm != null;
  let lastSection = null;
  const listItems = etas.flatMap((e) => {
    const section = getEtaSectionLabel(e.km);
    const headerLi = lastSection !== section ? `<li class="eta-section-header">${section}</li>` : '';
    lastSection = section;
    const isCleared = cleared && e.km <= lastSplitKm;
    const isLastNatureCenter = e.name.includes('Nature Center') && e.km >= LAST_NATURE_CENTER_KM - 0.1;
    const classes = [e.crewAccess ? 'crew-access' : '', isCleared ? 'eta-cleared' : '', isLastNatureCenter ? 'eta-row-with-reminder' : ''].filter(Boolean).join(' ');
    const pacerBlock = isLastNatureCenter
      ? `<div class="pacer-reminder">📌 Pick up Zach as Pacer Here</div>`
      : '';
    const rowLi = `<li class="${classes}">
      <div class="eta-row-top">
        <span>${(e.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim()}${e.km > 0 ? ` <span class="km">${e.km.toFixed(1)} km</span>` : ''}</span>
        <span class="eta-cell"><span class="eta-time">${e.eta}</span></span>
      </div>
      ${pacerBlock}
    </li>`;
    return headerLi ? [headerLi, rowLi] : [rowLi];
  });
  container.innerHTML = `
    <h2>Estimated arrival at aid stations</h2>
    <ul class="eta-list">
      ${listItems.join('')}
    </ul>
  `;
}

function normalizeTimeInput(str) {
  const s = (str || '').trim().replace(/\s*([ap]m)$/i, (_, m) => ' ' + m.toUpperCase());
  return s;
}

function updateDemoStatusLabel(status) {
  const el = document.getElementById('demo-mode-label');
  if (!el) return;
  el.textContent = status || '';
}

async function getRunnerData() {
  if (isTestModeActive()) {
    const state = getTestRunnerState();
    if (state) {
      return Promise.resolve({
        runner: {
          splits: [{ km: state.km, clockTime: state.clockTime }],
          totalRaceTime: state.totalRaceTime ?? null,
        },
        fallback: false,
        testModeActive: true,
      });
    }
  }
  if (isReplayActive()) {
    const state = getReplayRunnerState();
    if (state) {
      return Promise.resolve({
        runner: {
          splits: [{ km: state.km, clockTime: state.clockTime }],
          totalRaceTime: state.totalRaceTime ?? null,
        },
        fallback: false,
        replayActive: true,
        replayFinished: isReplayFinished(),
      });
    }
  }
  if (isDemoModeActive()) {
    const { km, clockTime } = getRandomDemoState(aidStations);
    return Promise.resolve({
      runner: { splits: [{ km, clockTime }], totalRaceTime: null },
      fallback: false,
      demoModeActive: true,
    });
  }
  const admin = getAdminOverride();
  if (admin) {
    return Promise.resolve({
      runner: { splits: [{ km: admin.km, clockTime: admin.clockTime }], totalRaceTime: null },
      fallback: false,
      adminActive: true,
      adminKm: admin.km,
      adminTime: admin.clockTime,
    });
  }
  const serverBib = await fetchBibFromServer();
  if (serverBib) setConfig({ bib: serverBib });
  const config = getConfig();
  const bib = (config.bib || '').trim();
  if (!bib || bib === 'TBD') {
    return { runner: { splits: [], totalRaceTime: null }, fallback: true, noBib: true };
  }
  return fetchRunnerInfo(config.resultsUrl, bib).then((runner) => {
    if (runner && runner.splits && runner.splits.length > 0) {
      return { runner, fallback: false };
    }
    return { runner: { splits: [], totalRaceTime: null }, fallback: true, noBib: false };
  });
}

function refresh() {
  getRunnerData().then(async ({ runner, fallback, adminActive, adminKm, adminTime, noBib, testModeActive, demoModeActive, replayActive, replayFinished }) => {
    let splits = (runner.splits || []).map((s) => ({
      km: s.km,
      clockTime: s.clockTime,
      splitId: s.splitId,
    }));
    if (!adminActive && !testModeActive && !demoModeActive && !replayActive) {
      const bib = (getConfig().bib || '').trim();
      if (bib && bib !== 'TBD') {
        const checkin = await fetchFieldCheckin(bib);
        if (checkin) {
          splits.push({ km: checkin.km, clockTime: checkin.clockTime, splitId: 'field' });
        }
      }
    }
    const { lastSplit, etas, planDeltaAtLastSplit } = computeETAs(splits, aidStations);
    const isFinished = (lastSplit?.km ?? 0) >= 99.5 || !!runner.totalRaceTime;
    const app = document.getElementById('app');
    if (app) {
      if (isFinished) app.classList.add('course-finished');
      else app.classList.remove('course-finished');
    }
    const sheet = document.getElementById('course-sheet');
    if (sheet) {
      if (isFinished) {
        sheet.classList.add('course-sheet-finished');
        const vh = window.innerHeight;
        const safe = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-bottom)')) || 0;
        sheet.style.height = `${vh - safe}px`;
        sheet.style.setProperty('--sheet-height', `${vh - safe}px`);
      } else {
        const wasFinished = sheet.classList.contains('course-sheet-finished');
        sheet.classList.remove('course-sheet-finished');
        if (wasFinished) {
          const peek = Math.max(200, window.innerHeight * 0.35);
          sheet.style.height = `${peek}px`;
          sheet.style.setProperty('--sheet-height', `${peek}px`);
        }
      }
    }
    const skipStaleCheck = demoModeActive || replayActive;
    renderRaceProgress(document.getElementById('race-progress'), lastSplit, runner.totalRaceTime ?? null, testModeActive || demoModeActive || replayActive);
    renderFinishedSplits(document.getElementById('finished-splits'), isFinished ? (runner.splits || []) : [], runner.totalRaceTime ?? null);
    renderLastSplit(document.getElementById('last-split'), lastSplit);
    renderProgressLine(document.getElementById('progress-line'), lastSplit, etas);
    renderHowsHeDoing(document.getElementById('hows-he-doing'), lastSplit, etas, planDeltaAtLastSplit, isFinished, skipStaleCheck);
    renderETAs(document.getElementById('eta-section'), etas, lastSplit?.km ?? null);
    const msgEl = document.getElementById('live-fallback-msg');
    if (msgEl) {
      if (testModeActive) {
        const state = getTestRunnerState();
        const scenarioLabel = state?.scenario ? ` (scenario ${state.scenario})` : '';
        msgEl.textContent = state?.isFinished
          ? `Test mode${scenarioLabel} — finished.`
          : `Test mode${scenarioLabel} — mock runner in progress.`;
      } else if (replayActive && !replayFinished) msgEl.textContent = 'Replay in progress.';
      else if (demoModeActive || replayActive) msgEl.textContent = '';
      else if (adminActive) msgEl.textContent = `Showing test position: ${adminKm.toFixed(1)} km at ${adminTime}`;
      else if (lastSplit?.label === 'Field check-in') msgEl.textContent = 'Latest position from runner check-in.';
      else if (fallback && !noBib) msgEl.textContent = 'Could not load live results.';
      else if (fallback && noBib) msgEl.textContent = '';
      else msgEl.textContent = '';
    }
    if (replayActive || demoModeActive) {
      updateDemoStatusLabel('DEMO MODE');
    } else {
      updateDemoStatusLabel('');
    }
    if (typeof __rockyOnRunnerUpdate === 'function') __rockyOnRunnerUpdate({ lastSplit });
  });
}

/** Aid stations from pacing plan, set by init(). */
let aidStations = [];

/**
 * @param {Object} [options] - optional
 * @param {Array<{ name: string, km: number, target: string, crewAccess: boolean }>} [options.aidStations] - pacing plan aid stations (required)
 * @param {(arg: { lastSplit: { km: number } | null }) => void} [options.onRunnerUpdate] - called after each refresh with latest split
 */
export function init(options = {}) {
  aidStations = options.aidStations ?? aidStations;
  if (options.onRunnerUpdate) window.__rockyOnRunnerUpdate = options.onRunnerUpdate;

  // Render dynamic sections immediately with default/empty data so they are visible before refresh() resolves
  const { etas: defaultEtas } = computeETAs([], aidStations);
  renderRaceProgress(document.getElementById('race-progress'), null, null);
  renderFinishedSplits(document.getElementById('finished-splits'), [], null);
  renderLastSplit(document.getElementById('last-split'), null);
  renderProgressLine(document.getElementById('progress-line'), null, defaultEtas);
  renderHowsHeDoing(document.getElementById('hows-he-doing'), null, defaultEtas, null, false);
  renderETAs(document.getElementById('eta-section'), defaultEtas, null);

  // Ensure sheet content starts scrolled to top so progress/ETAs are visible
  const sheetInner = document.querySelector('.course-sheet-inner');
  if (sheetInner) sheetInner.scrollTop = 0;

  const refreshBtn = document.getElementById('header-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      const icon = refreshBtn.querySelector('.header-refresh-icon');
      if (icon) {
        icon.classList.add('header-refresh-icon-spin');
        const onEnd = () => {
          icon.classList.remove('header-refresh-icon-spin');
          icon.removeEventListener('animationend', onEnd);
        };
        icon.addEventListener('animationend', onEnd);
      }
      refresh();
      refreshBtn.blur();
    });
  }

  const replayBtn = document.getElementById('replay-race-btn');
  if (replayBtn) {
    replayBtn.addEventListener('click', () => {
      if (!isReplayActive()) {
        startReplay(refresh, aidStations);
        replayBtn.blur();
      }
    });
  }

  const testParam = new URLSearchParams(location.search).get('test');
  if (testParam === 'finish' || testParam === '5') {
    startTestMode('finish', refresh, aidStations);
  } else if (['1', '2', '3', '4'].includes(testParam)) {
    startTestMode(parseInt(testParam, 10), refresh, aidStations);
  } else {
    refresh();
  }
}
