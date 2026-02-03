import { AID_STATIONS_KM, RACE_DISTANCE_KM } from './data.js';
import { computeETAs } from './eta.js';
import { fetchRunnerInfo } from './edsFetcher.js';

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

const RACE_START_MINUTES = 7 * 60; // 7:00 AM

function renderRaceProgress(container, lastSplit, totalRaceTime) {
  if (!container) return;
  const progressKm = lastSplit?.km ?? 0;
  const progressPct = Math.min(100, Math.max(0, (progressKm / RACE_DISTANCE_KM) * 100));
  const isFinished = progressKm >= 99.5;

  let totalDisplay = '—';
  if (isFinished && totalRaceTime) {
    const totalMin = parseHHMMSSToMinutes(totalRaceTime);
    totalDisplay = totalMin != null ? formatTimeOnCourse(totalMin) : totalRaceTime;
  } else if (!isFinished && lastSplit?.clockTime) {
    const lastMin = parseClockToMinutes(lastSplit.clockTime);
    if (lastMin != null) {
      const elapsedMin = lastMin - RACE_START_MINUTES;
      totalDisplay = formatTimeOnCourse(elapsedMin) || '—';
    }
  }

  if (isFinished) {
    container.innerHTML = `
      <p class="label">Overall Status</p>
      <div class="race-progress-celebration">
        <span class="race-progress-trophy" aria-hidden="true">🏆</span>
        <p class="race-progress-celebration-title">Finished!</p>
        <p class="race-progress-total">Result: ${totalDisplay}</p>
      </div>
    `;
    return;
  }

  const progressEmoji = getProgressEmoji(progressKm);
  /* Show two runners once in "final stretch" (split 5 = 77.25 km); we never have a split at 82.4 so use 77.25 */
  const hasPacer = progressKm >= 77.25;
  const secondRunner = hasPacer ? `<span class="race-progress-runner race-progress-runner-pacer race-progress-runner-anim" style="left: 0" data-target="${progressPct}" aria-hidden="true">${progressEmoji}</span>` : '';
  container.innerHTML = `
    <p class="label">Overall Status</p>
    <div class="race-progress-bar-wrap">
      <span class="race-progress-emoji" aria-hidden="true">🏁</span>
      <div class="race-progress-track">
        <div class="race-progress-fill race-progress-fill-anim" style="width: 0"></div>
        <span class="race-progress-runner race-progress-runner-anim" style="left: 0" data-target="${progressPct}" aria-hidden="true">${progressEmoji}</span>
        ${secondRunner}
      </div>
      <span class="race-progress-emoji" aria-hidden="true">🎯</span>
    </div>
    <p class="race-progress-total">Running time: ${totalDisplay}</p>
  `;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const fill = container.querySelector('.race-progress-fill');
      const runners = container.querySelectorAll('.race-progress-runner');
      if (fill) fill.style.width = `${progressPct}%`;
      runners.forEach((r) => { r.style.left = `${progressPct}%`; });
    });
  });
}

function renderLastSplit(container, lastSplit) {
  if (!container) return;
  if (!lastSplit) {
    container.innerHTML = '<p class="label">Last recorded split</p><p>No split data yet. Set a test position below or enter a bib for live results.</p>';
    return;
  }
  container.innerHTML = `
    <p class="label">Last recorded split</p>
    <p>${lastSplit.label} — ${lastSplit.km.toFixed(1)} km at ${lastSplit.clockTime}</p>
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
  const { last, next } = getLastNextStations(lastSplitKm, etas);

  const lastTime = last ? last.eta : '—';
  const lastName = last ? `@ ${last.name}` : 'Start';
  const nextTime = next ? next.eta : '—';
  const nextName = next ? `@ ${next.name}` : '—';
  const nextIsLastNatureCenter = next && next.name === 'Nature Center' && next.km >= 82.4;
  const nextPacerNote = nextIsLastNatureCenter ? '<div class="progress-next-pacer-note">Pickup Zach</div>' : '';

  container.innerHTML = `
    <div class="progress-line-inner">
      <div class="progress-station-wrap">
        <div class="progress-station-label">Last Aid Station</div>
        <div class="progress-station progress-last">
          <span class="progress-time">${lastTime}</span>
          <span class="progress-name">${lastName}</span>
        </div>
      </div>
      <span class="progress-track" aria-hidden="true"><span class="progress-runner">🏃</span></span>
      <div class="progress-station-wrap">
        <div class="progress-station-label">Next Aid Station</div>
        <div class="progress-station progress-next">
          <span class="progress-time">${nextTime}</span>
          <span class="progress-name">${nextName}</span>
        </div>
        ${nextPacerNote}
      </div>
    </div>
  `;
}

function getHowsHeDoingState(lastSplit, planDeltaAtLastSplit) {
  if (!lastSplit || planDeltaAtLastSplit == null) return null;
  const delta = planDeltaAtLastSplit;
  const km = lastSplit.km ?? 0;
  const early = km < 35;
  if (delta < -15) {
    return { emoji: '🚀', message: early ? 'He\'s flying! Someone tell him it\'s a long day.' : 'Ahead of schedule and feeling dangerous.' };
  }
  if (delta <= 15) return { emoji: '✅', message: 'Smooth sailing. Right on plan.' };
  if (delta <= 60) return { emoji: '😅', message: 'A little behind, but he\'s been through worse.' };
  if (delta <= 120) return { emoji: '⚠️', message: 'Running behind. Time to prep the good snacks.' };
  return { emoji: '🆘', message: 'Uh oh. Break out the pizza and prayers.' };
}

function renderHowsHeDoing(container, lastSplit, planDeltaAtLastSplit) {
  if (!container) return;
  const state = getHowsHeDoingState(lastSplit, planDeltaAtLastSplit);
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

const LAST_NATURE_CENTER_KM = 82.43;

/** Section label for aid station by km (Prologue, Lap 1, Lap 2, Lap 3). */
function getEtaSectionLabel(km) {
  if (km <= 3.54) return 'Prologue';
  if (km <= 35.73) return 'Lap 1';
  if (km <= 67.9) return 'Lap 2';
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
    const isLastNatureCenter = e.name === 'Nature Center' && e.km >= LAST_NATURE_CENTER_KM - 0.1;
    const classes = [e.crewAccess ? 'crew-access' : '', isCleared ? 'eta-cleared' : '', isLastNatureCenter ? 'eta-row-with-reminder' : ''].filter(Boolean).join(' ');
    const pacerBlock = isLastNatureCenter
      ? `<div class="pacer-reminder">📌 Pick up Zach as Pacer Here</div>`
      : '';
    const rowLi = `<li class="${classes}">
      <div class="eta-row-top">
        <span>${e.name} <span class="km">${e.km.toFixed(1)} km</span></span>
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

function renderQuickRef(container) {
  if (!container) return;
  container.innerHTML = `
    <h2>Quick reference</h2>
    <p>You can see Aaron at: <strong>Tyler's Last Resort (Start/Finish area)</strong> — every lap.</p>
    <p>Target finish: 9:30 PM (window 8:30–10:30 PM, ~14.5–15.5 hours). Estimated arrivals above update with current pace.</p>
  `;
}

function renderWhatToHave(container) {
  if (!container) return;
  container.innerHTML = `
    <h2>What to have ready</h2>
    <ul>
      <li>Fresh socks (2 pairs)</li>
      <li>Backup Tailwind / gels</li>
      <li>Sunscreen</li>
      <li>Ice bandana / cooling towel</li>
      <li>Headlamp + fresh batteries (he'll need it after ~6:00 PM)</li>
      <li>Real food: PB&J, banana, whatever sounds good</li>
      <li>A chair (sit 1–2 min MAX — don't let him sit too long!)</li>
    </ul>
  `;
}

function renderCrewTips(container) {
  if (!container) return;
  container.innerHTML = `
    <h2>Crew tips</h2>
    <ul>
      <li>Be positive but efficient. Hand him what he needs — don't ask "what do you want?"</li>
      <li>Don't be alarmed if he looks rough. That's normal for a 100k. If he's moving, he's fine.</li>
      <li>The Lap 2 stop (Tyler's) is the big one. He'll be hot and tired. Sock change, ice bandana, sunscreen, real food.</li>
      <li>Weather: Starts cool (45°F), peaks ~75°F around 2–3 PM, cools to 55°F by finish.</li>
      <li>Lap 4 will be slow — that's the plan. He's never run past 50K. Expect him to take his time.</li>
      <li>If he's late: Don't panic. Use the "Window" column times as your outer window; estimated arrivals above update with current pace.</li>
      <li><strong>Race strategy:</strong> Aaron is running a conservative, smart race — finish feeling strong, not a fast time. If he's "slower than expected" at Tyler's in the first laps, that's good; he's saving energy for the unknown miles ahead. Trust the plan!</li>
    </ul>
  `;
}

async function getRunnerData() {
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
  getRunnerData().then(async ({ runner, fallback, adminActive, adminKm, adminTime, noBib }) => {
    let splits = (runner.splits || []).map((s) => ({
      km: s.km,
      clockTime: s.clockTime,
      splitId: s.splitId,
    }));
    if (!adminActive) {
      const bib = (getConfig().bib || '').trim();
      if (bib && bib !== 'TBD') {
        const checkin = await fetchFieldCheckin(bib);
        if (checkin) {
          splits.push({ km: checkin.km, clockTime: checkin.clockTime, splitId: 'field' });
        }
      }
    }
    const { lastSplit, etas, planDeltaAtLastSplit } = computeETAs(splits);
    renderRaceProgress(document.getElementById('race-progress'), lastSplit, runner.totalRaceTime ?? null);
    renderLastSplit(document.getElementById('last-split'), lastSplit);
    renderProgressLine(document.getElementById('progress-line'), lastSplit, etas);
    renderHowsHeDoing(document.getElementById('hows-he-doing'), lastSplit, planDeltaAtLastSplit);
    renderETAs(document.getElementById('eta-section'), etas, lastSplit?.km ?? null);
    const msgEl = document.getElementById('live-fallback-msg');
    if (msgEl) {
      if (adminActive) msgEl.textContent = `Showing test position: ${adminKm.toFixed(1)} km at ${adminTime}`;
      else if (lastSplit?.label === 'Field check-in') msgEl.textContent = 'Latest position from runner check-in.';
      else if (fallback && !noBib) msgEl.textContent = 'Could not load live results.';
      else if (fallback && noBib) msgEl.textContent = 'Set a test position below or enter a bib for live results.';
      else msgEl.textContent = '';
    }
  });
}

export function init() {
  renderQuickRef(document.getElementById('quick-ref'));
  renderWhatToHave(document.getElementById('what-to-have'));
  renderCrewTips(document.getElementById('crew-tips'));
  refresh();
}
