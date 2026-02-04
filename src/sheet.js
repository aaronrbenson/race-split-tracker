/**
 * Shared sheet drag behavior for index and course pages.
 * Call when the page has #course-sheet and #course-sheet-drag.
 */
const SHEET_PEEK = 0.35;
const SHEET_HALF = 0.5;
const SHEET_FULL = 1;

export function initSheetDrag() {
  const sheet = document.getElementById('course-sheet');
  const dragArea = document.getElementById('course-sheet-drag');
  if (!sheet || !dragArea) return;

  function getSafeBottom() {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-bottom)')) || 0;
  }

  function getHeights() {
    const vh = window.innerHeight;
    const safe = getSafeBottom();
    return {
      peek: Math.max(200, vh * SHEET_PEEK),
      half: vh * SHEET_HALF,
      full: vh - safe,
    };
  }

  function setSheetHeight(px) {
    sheet.style.height = `${px}px`;
    sheet.style.setProperty('--sheet-height', `${px}px`);
  }

  function snapToNearest(px) {
    const { peek, half, full } = getHeights();
    const midPeekHalf = (peek + half) / 2;
    const midHalfFull = (half + full) / 2;
    const snap = px < midPeekHalf ? peek : px < midHalfFull ? half : full;
    setSheetHeight(snap);
    sheet.classList.remove('dragging');
  }

  let startY = 0;
  let startHeight = 0;

  function onStart(clientY) {
    startY = clientY;
    startHeight = sheet.offsetHeight;
    sheet.classList.add('dragging');
  }

  function onMove(clientY) {
    const { peek, full } = getHeights();
    const deltaY = startY - clientY;
    const next = Math.round(startHeight + deltaY);
    setSheetHeight(Math.max(peek, Math.min(full, next)));
  }

  function onEnd() {
    if (!sheet.classList.contains('dragging')) return;
    snapToNearest(sheet.offsetHeight);
  }

  dragArea.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    onStart(e.touches[0].clientY);
  }, { passive: false });

  dragArea.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    onMove(e.touches[0].clientY);
  }, { passive: false });

  dragArea.addEventListener('touchend', onEnd);
  dragArea.addEventListener('touchcancel', onEnd);

  dragArea.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    onStart(e.clientY);
    const onMouseMove = (e2) => onMove(e2.clientY);
    const onMouseUp = () => {
      onEnd();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  setSheetHeight(getHeights().peek);
}
