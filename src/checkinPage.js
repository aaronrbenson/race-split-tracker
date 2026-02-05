import { RACE_DISTANCE_KM } from './data.js';

const BIB_KEY = 'rocky_bib';
const DEFAULT_BIB = 'TBD';

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
  const primaryContainer = document.getElementById('checkin-section');
  const belowFoldContainer = document.getElementById('checkin-below-fold');
  if (!primaryContainer || !belowFoldContainer) return;

  let bib = (getBib() || '').trim();
  const serverBib = await fetchBibFromServer();
  if (serverBib != null && serverBib !== '') {
    bib = serverBib;
    setBib(bib);
  }

  // Primary area: km input + check-in button only (above the fold, touch-friendly)
  primaryContainer.innerHTML = `
    <div class="checkin-form checkin-form-primary">
      <div class="checkin-km-wrap">
        <label for="rocky-checkin-km" class="checkin-km-label">km</label>
        <input type="number" id="rocky-checkin-km" class="checkin-km-input" min="0" max="${RACE_DISTANCE_KM}" step="0.1" placeholder="0" inputmode="decimal" enterkeyhint="done" />
      </div>
      <button type="button" id="rocky-checkin-submit" class="checkin-submit checkin-submit-primary">Check in</button>
      <p class="checkin-section-msg" id="rocky-checkin-msg" aria-live="polite"></p>
    </div>
  `;

  // Below the fold: bib and reset (requires scroll, avoids accidental taps)
  belowFoldContainer.innerHTML = `
    <div class="checkin-form checkin-form-below-fold">
      <div class="checkin-bib-wrap">
        <label for="rocky-checkin-bib" class="checkin-bib-label">Bib number</label>
        <input type="text" id="rocky-checkin-bib" class="checkin-bib-input" value="${bib}" placeholder="Bib" inputmode="numeric" pattern="[0-9]*" autocomplete="off" />
      </div>
      <p class="checkin-reset-wrap">
        <button type="button" id="rocky-checkin-reset" class="checkin-reset">Reset all check-ins</button>
      </p>
    </div>
  `;

  const bibEl = belowFoldContainer.querySelector('#rocky-checkin-bib');
  const kmEl = primaryContainer.querySelector('#rocky-checkin-km');
  const msgEl = primaryContainer.querySelector('#rocky-checkin-msg');
  const submitBtn = primaryContainer.querySelector('#rocky-checkin-submit');
  const resetBtn = belowFoldContainer.querySelector('#rocky-checkin-reset');

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
      msgEl.textContent = 'Scroll down to set your bib number.';
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

  // Submit on Enter in km field
  kmEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitBtn.click();
  });
}

render();
