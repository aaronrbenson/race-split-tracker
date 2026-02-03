import { RACE_DISTANCE_KM } from './data.js';

const BIB_KEY = 'rocky_bib';
const DEFAULT_BIB = 'TBD';

const ADMIN_KEY_ACTIVE = 'rocky_admin_active';
const ADMIN_KEY_KM = 'rocky_admin_km';
const ADMIN_KEY_TIME = 'rocky_admin_time';

/** Time format expected: e.g. "2:30 PM", "9:15 AM" */
const TIME_PATTERN = /^\d{1,2}:\d{2}\s*[AP]M$/i;

function getAdminOverride() {
  if (localStorage.getItem(ADMIN_KEY_ACTIVE) !== 'true') return null;
  const time = (localStorage.getItem(ADMIN_KEY_TIME) || '').trim();
  const kmRaw = localStorage.getItem(ADMIN_KEY_KM);
  if (!time || !TIME_PATTERN.test(time) || kmRaw === null || kmRaw === '') return null;
  const km = parseFloat(kmRaw, 10);
  if (Number.isNaN(km) || km < 0 || km > RACE_DISTANCE_KM) return null;
  return { km, clockTime: time };
}

function normalizeTimeInput(str) {
  const s = (str || '').trim().replace(/\s*([ap]m)$/i, (_, m) => ' ' + m.toUpperCase());
  return s;
}

function getCurrentClockTime() {
  const d = new Date();
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function getApiBase() {
  return '';
}

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

async function resetCheckins() {
  const base = getApiBase();
  const res = await fetch(`${base}/api/checkin`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || res.statusText || 'Failed' };
  return { ok: true };
}

async function fetchBibFromServer() {
  const base = getApiBase();
  const res = await fetch(`${base}/api/checkin`);
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  const bib = data?.bib != null ? String(data.bib).trim() : '';
  return bib || null;
}

async function saveBibToServer(bib) {
  const base = getApiBase();
  const res = await fetch(`${base}/api/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bib }),
  });
  if (!res.ok) return false;
  return true;
}

function getBib() {
  return localStorage.getItem(BIB_KEY) || DEFAULT_BIB;
}

function setBib(bib) {
  localStorage.setItem(BIB_KEY, bib || DEFAULT_BIB);
}

async function render() {
  const container = document.getElementById('checkin-section');
  if (!container) return;
  let bib = (getBib() || '').trim();
  const serverBib = await fetchBibFromServer();
  if (serverBib != null && serverBib !== '') {
    bib = serverBib;
    setBib(bib);
  }
  container.innerHTML = `
    <div class="checkin-form checkin-form-field">
      <div class="checkin-km-wrap">
        <label for="rocky-checkin-km" class="checkin-km-label">km</label>
        <input type="number" id="rocky-checkin-km" class="checkin-km-input" min="0" max="${RACE_DISTANCE_KM}" step="0.1" placeholder="0" inputmode="decimal" enterkeyhint="done" />
      </div>
      <button type="button" id="rocky-checkin-submit" class="checkin-submit checkin-submit-primary">Check in</button>
      <p class="checkin-section-msg" id="rocky-checkin-msg" aria-live="polite"></p>
      <div class="checkin-bib-wrap">
        <label for="rocky-checkin-bib" class="checkin-bib-label">Bib</label>
        <input type="text" id="rocky-checkin-bib" class="checkin-bib-input" value="${bib}" placeholder="Bib" inputmode="numeric" pattern="[0-9]*" autocomplete="off" />
      </div>
      <p class="checkin-reset-wrap">
        <button type="button" id="rocky-checkin-reset" class="checkin-reset">Reset all check-ins</button>
      </p>
    </div>
  `;

  const bibEl = container.querySelector('#rocky-checkin-bib');
  const kmEl = container.querySelector('#rocky-checkin-km');
  const msgEl = container.querySelector('#rocky-checkin-msg');
  const submitBtn = container.querySelector('#rocky-checkin-submit');
  const resetBtn = container.querySelector('#rocky-checkin-reset');

  bibEl.addEventListener('blur', async () => {
    const v = (bibEl.value || '').trim();
    if (v && v !== DEFAULT_BIB) {
      setBib(v);
      await saveBibToServer(v);
    }
  });

  resetBtn.addEventListener('click', async () => {
    msgEl.textContent = '';
    msgEl.className = 'checkin-section-msg';
    resetBtn.disabled = true;
    const result = await resetCheckins();
    resetBtn.disabled = false;
    if (result.ok) {
      msgEl.textContent = 'All check-ins cleared.';
      msgEl.className = 'checkin-section-msg checkin-section-msg-success';
    } else {
      msgEl.textContent = result.error || 'Failed to reset.';
      msgEl.className = 'checkin-section-msg checkin-section-msg-error';
    }
  });

  submitBtn.addEventListener('click', async () => {
    const bibValue = (bibEl.value || '').trim();
    const kmRaw = kmEl.value.trim();
    msgEl.textContent = '';
    msgEl.className = 'checkin-section-msg';

    if (!bibValue || bibValue === DEFAULT_BIB) {
      msgEl.textContent = 'Enter your bib number.';
      msgEl.className = 'checkin-section-msg checkin-section-msg-error';
      return;
    }
    const km = parseFloat(kmRaw, 10);
    if (kmRaw === '' || Number.isNaN(km) || km < 0 || km > RACE_DISTANCE_KM) {
      msgEl.textContent = `Enter a kilometer between 0 and ${RACE_DISTANCE_KM}`;
      msgEl.className = 'checkin-section-msg checkin-section-msg-error';
      return;
    }

    setBib(bibValue);
    submitBtn.disabled = true;
    const clockTime = getCurrentClockTime();
    const result = await submitFieldCheckin(bibValue, km, clockTime);
    submitBtn.disabled = false;

    if (result.ok) {
      msgEl.textContent = 'Check-in saved. Crew will see it when they refresh.';
      msgEl.className = 'checkin-section-msg checkin-section-msg-success';
    } else {
      msgEl.textContent = result.error || 'Failed to save check-in.';
      msgEl.className = 'checkin-section-msg checkin-section-msg-error';
    }
  });
}

function renderAdminSection(container) {
  if (!container) return;
  const admin = getAdminOverride();
  const currentTime = admin ? admin.clockTime : '';
  const currentKm = admin ? String(admin.km) : '';
  container.innerHTML = `
    <h2>Test position (admin)</h2>
    <p class="admin-section-desc">Simulate a runner position to test the main page without live results.</p>
    <label for="rocky-admin-time">Time of day</label>
    <input type="text" id="rocky-admin-time" value="${currentTime}" placeholder="e.g. 2:30 PM" />
    <label for="rocky-admin-km">Kilometer</label>
    <input type="number" id="rocky-admin-km" value="${currentKm}" min="0" max="${RACE_DISTANCE_KM}" step="0.1" placeholder="45" />
    <p class="admin-section-error" id="rocky-admin-error" aria-live="polite"></p>
    <div class="admin-section-actions">
      <button type="button" id="rocky-admin-submit">Submit</button>
      <button type="button" id="rocky-admin-clear">Clear</button>
    </div>
  `;

  const timeEl = container.querySelector('#rocky-admin-time');
  const kmEl = container.querySelector('#rocky-admin-km');
  const errorEl = container.querySelector('#rocky-admin-error');

  container.querySelector('#rocky-admin-submit').addEventListener('click', () => {
    const rawTime = timeEl.value;
    const time = normalizeTimeInput(rawTime);
    const kmRaw = kmEl.value.trim();
    errorEl.textContent = '';
    if (!TIME_PATTERN.test(time)) {
      errorEl.textContent = 'Enter time like 2:30 PM or 9:15 AM';
      return;
    }
    const km = parseFloat(kmRaw, 10);
    if (kmRaw === '' || Number.isNaN(km) || km < 0 || km > RACE_DISTANCE_KM) {
      errorEl.textContent = `Enter a kilometer between 0 and ${RACE_DISTANCE_KM}`;
      return;
    }
    localStorage.setItem(ADMIN_KEY_ACTIVE, 'true');
    localStorage.setItem(ADMIN_KEY_KM, String(km));
    localStorage.setItem(ADMIN_KEY_TIME, time);
    errorEl.textContent = 'Saved. Open the main tracker page to see the test position.';
  });

  container.querySelector('#rocky-admin-clear').addEventListener('click', () => {
    localStorage.removeItem(ADMIN_KEY_ACTIVE);
    localStorage.removeItem(ADMIN_KEY_KM);
    localStorage.removeItem(ADMIN_KEY_TIME);
    errorEl.textContent = '';
    timeEl.value = '';
    kmEl.value = '';
  });
}

render();
renderAdminSection(document.getElementById('admin-section'));
