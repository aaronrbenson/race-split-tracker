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

function getBib() {
  return localStorage.getItem(BIB_KEY) || DEFAULT_BIB;
}

function setBib(bib) {
  localStorage.setItem(BIB_KEY, bib || DEFAULT_BIB);
}

function render() {
  const container = document.getElementById('checkin-section');
  if (!container) return;
  const bib = (getBib() || '').trim();
  container.innerHTML = `
    <div class="checkin-form">
      <label for="rocky-checkin-bib">Bib number</label>
      <input type="text" id="rocky-checkin-bib" value="${bib}" placeholder="e.g. 123" />
      <label for="rocky-checkin-km">Kilometer</label>
      <input type="number" id="rocky-checkin-km" min="0" max="${RACE_DISTANCE_KM}" step="0.1" placeholder="48" inputmode="decimal" />
      <p class="checkin-section-msg" id="rocky-checkin-msg" aria-live="polite"></p>
      <button type="button" id="rocky-checkin-submit" class="checkin-submit">Check in</button>
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

render();
