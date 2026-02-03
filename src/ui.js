import { AID_STATIONS_KM, DEMO_RUNNER, getRandomDemoRunner } from './data.js';
import { computeETAs } from './eta.js';
import { fetchRunnerInfo } from './edsFetcher.js';

const DEFAULT_RESULTS_URL = 'http://edsresults.com/2025rr100/';
const DEFAULT_BIB = 'TBD';

function getConfig() {
  return {
    resultsUrl: localStorage.getItem('rocky_results_url') || DEFAULT_RESULTS_URL,
    bib: localStorage.getItem('rocky_bib') || DEFAULT_BIB,
    useDemo: localStorage.getItem('rocky_use_demo') !== 'false',
  };
}

function setConfig({ resultsUrl, bib, useDemo }) {
  if (resultsUrl != null) localStorage.setItem('rocky_results_url', resultsUrl);
  if (bib != null) localStorage.setItem('rocky_bib', bib);
  if (useDemo != null) localStorage.setItem('rocky_use_demo', useDemo ? 'true' : 'false');
}

function renderLastSplit(container, lastSplit) {
  if (!container) return;
  if (!lastSplit) {
    container.innerHTML = '<p class="label">Last check-in</p><p>No split data yet. Use demo mode or enter results URL + bib.</p>';
    return;
  }
  container.innerHTML = `
    <p class="label">Last check-in</p>
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
  const dash = '—'.repeat(6);

  const lastTime = last ? last.eta : '—';
  const lastName = last ? `@ ${last.name}` : 'Start';
  const lastIsChip = last && lastSplit && Math.abs(last.km - lastSplitKm) < 1.5;
  const lastTimeLabel = last ? (lastIsChip ? 'Chip time' : 'Estimated') : '';

  const nextTime = next ? next.eta : '—';
  const nextName = next ? `@ ${next.name}` : '—';
  const nextTimeLabel = next ? 'Estimated' : '';

  container.innerHTML = `
    <div class="progress-line-inner">
      <div class="progress-station progress-last">
        <span class="progress-time-label">${lastTimeLabel}</span>
        <span class="progress-time">${lastTime}</span>
        <span class="progress-name">${lastName}</span>
      </div>
      <span class="progress-track" aria-hidden="true">${dash} <span class="progress-runner">🏃</span> ${dash}</span>
      <div class="progress-station progress-next">
        <span class="progress-time-label">${nextTimeLabel}</span>
        <span class="progress-time">${nextTime}</span>
        <span class="progress-name">${nextName}</span>
      </div>
    </div>
  `;
}

function renderETAs(container, etas, lastSplitKm) {
  if (!container) return;
  const cleared = lastSplitKm != null;
  container.innerHTML = `
    <h2>Estimated arrival at aid stations</h2>
    <ul class="eta-list">
      ${etas
        .map(
          (e) => {
            const isCleared = cleared && e.km <= lastSplitKm;
            const classes = [e.crewAccess ? 'crew-access' : '', isCleared ? 'eta-cleared' : ''].filter(Boolean).join(' ');
            return `<li class="${classes}">
              <span>${e.name} <span class="km">${e.km.toFixed(1)} km</span></span>
              <span>${e.eta}</span>
            </li>`;
          }
        )
        .join('')}
    </ul>
  `;
}

function renderConfig(container) {
  const config = getConfig();
  if (!container) return;
  container.innerHTML = `
    <h2>Settings</h2>
    <label for="rocky-results-url">Results page URL</label>
    <input type="url" id="rocky-results-url" value="${config.resultsUrl}" placeholder="${DEFAULT_RESULTS_URL}" />
    <label for="rocky-bib">Bib number</label>
    <input type="text" id="rocky-bib" value="${config.bib}" placeholder="TBD" />
    <label for="rocky-use-demo">Use demo data (mock mid-race splits)</label>
    <select id="rocky-use-demo">
      <option value="true" ${config.useDemo ? 'selected' : ''}>Yes — show demo</option>
      <option value="false" ${!config.useDemo ? 'selected' : ''}>No — try live results</option>
    </select>
    <button type="button" id="rocky-save-config">Save & refresh</button>
  `;

  container.querySelector('#rocky-save-config').addEventListener('click', () => {
    setConfig({
      resultsUrl: container.querySelector('#rocky-results-url').value.trim() || DEFAULT_RESULTS_URL,
      bib: container.querySelector('#rocky-bib').value.trim() || DEFAULT_BIB,
      useDemo: container.querySelector('#rocky-use-demo').value === 'true',
    });
    refresh();
  });
}

function renderQuickRef(container) {
  if (!container) return;
  container.innerHTML = `
    <h2>Quick reference</h2>
    <p>You can see Aaron at: <strong>Tyler's Last Resort (Start/Finish)</strong> — every lap.</p>
    <p>Target finish: 8:30–9:30 PM (~13.5–14.5 hours).</p>
  `;
}

function renderTylersTable(container) {
  const tylers = AID_STATIONS_KM.filter((a) => a.crewAccess);
  if (!container) return;
  container.innerHTML = `
    <h2>Tyler's Last Resort — where to see Aaron</h2>
    <table>
      <thead>
        <tr><th>Visit</th><th>km</th><th>Target</th><th>Window</th><th>What Aaron needs</th></tr>
      </thead>
      <tbody>
        <tr><td>START</td><td>0</td><td>7:00 AM</td><td>—</td><td>Cheer him off! Stay calm.</td></tr>
        <tr><td>Prologue done</td><td>3.5</td><td>7:16 AM</td><td>7:12–7:20</td><td>Quick wave — nothing needed.</td></tr>
        <tr><td>Lap 1 done</td><td>35.7</td><td>9:55 AM</td><td>9:30–10:30</td><td>Sock change, refill Tailwind, quick check-in.</td></tr>
        <tr><td>Lap 2 done</td><td>67.9</td><td>1:45 PM</td><td>1:00–2:30</td><td>KEY STOP — Sock change, sunscreen, ice bandana, real food.</td></tr>
        <tr><td>FINISH!</td><td>99.9</td><td>9:00 PM</td><td>8:00–10:00</td><td>CELEBRATE!</td></tr>
      </tbody>
    </table>
  `;
}

function renderAllAidStations(container) {
  if (!container) return;
  container.innerHTML = `
    <h2>All aid stations — detailed timing</h2>
    <p class="note">You can't crew at Gate, Nature Center, or Dam Nation easily — just Tyler's. Use this table if Aaron texts or you want to track progress.</p>
    <table>
      <thead>
        <tr><th>Aid station</th><th>km</th><th>Target</th><th>Early</th><th>Late</th><th>Cutoff</th></tr>
      </thead>
      <tbody>
        ${AID_STATIONS_KM.map(
          (a) =>
            `<tr>
              <td>${a.name}</td><td>${a.km.toFixed(1)}</td><td>${a.target}</td><td>${a.early}</td><td>${a.late}</td><td>${a.cutoff}</td>
            </tr>`
        ).join('')}
      </tbody>
    </table>
    <p class="note">* Cutoffs are next-day (Sunday). Aaron will be well ahead of cutoffs.</p>
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
      <li>Headlamp + fresh batteries (after ~6:30 PM)</li>
      <li>Real food: PB&J, banana, whatever sounds good</li>
      <li>A chair (sit 1–2 min MAX)</li>
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
      <li>The Lap 2 stop is the big one. Sock change, ice, sunscreen, real food.</li>
      <li>Weather: Starts cool (45°F), peaks ~75°F around 2–3 PM, cools to 55°F by finish.</li>
      <li>If he's late: Don't panic. Use the "Late" column as your outer window.</li>
    </ul>
  `;
}

function getRunnerData() {
  const config = getConfig();
  if (config.useDemo) {
    return Promise.resolve({ runner: getRandomDemoRunner(), fallback: false });
  }
  const bib = (config.bib || '').trim();
  if (!bib) {
    return Promise.resolve({ runner: getRandomDemoRunner(), fallback: true });
  }
  return fetchRunnerInfo(config.resultsUrl, bib).then((runner) => {
    if (runner && runner.splits && runner.splits.length > 0) {
      return { runner, fallback: false };
    }
    return { runner: getRandomDemoRunner(), fallback: true };
  });
}

function refresh() {
  getRunnerData().then(({ runner, fallback }) => {
    const splits = (runner.splits || []).map((s) => ({
      km: s.km,
      clockTime: s.clockTime,
      splitId: s.splitId,
    }));
    const { lastSplit, etas } = computeETAs(splits);
    renderLastSplit(document.getElementById('last-split'), lastSplit);
    renderProgressLine(document.getElementById('progress-line'), lastSplit, etas);
    renderETAs(document.getElementById('eta-section'), etas, lastSplit?.km ?? null);
    const msgEl = document.getElementById('live-fallback-msg');
    if (msgEl) {
      msgEl.textContent = fallback ? 'Could not load live results; showing demo data.' : '';
    }
  });
}

export function init() {
  renderConfig(document.getElementById('config-section'));
  renderQuickRef(document.getElementById('quick-ref'));
  renderTylersTable(document.getElementById('tylers-table'));
  renderAllAidStations(document.getElementById('all-aid-stations'));
  renderWhatToHave(document.getElementById('what-to-have'));
  renderCrewTips(document.getElementById('crew-tips'));
  refresh();
}
