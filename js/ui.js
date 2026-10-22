// ui.js — small helpers every screen uses: escaping text, ids, times,
// and the message box at the bottom.

/**
 * Make text safe to drop into HTML. ALWAYS wrap data in esc(...) when
 * building HTML strings, so a phrase like "<oi>" can't break the page.
 */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** A new unique id for a row. */
function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** 2.345 -> "2.3s" */
function secs(n) {
  return `${n.toFixed(1)}s`;
}

/** A timestamp -> "Oct 22, 10:42 AM" */
function when(ms) {
  return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** A Date -> 'YYYY-MM-DD' in your local time (one key per calendar day). */
function dateKey(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Wait a moment. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ---------- Audio as text ----------
   Files like anki-library.json and backups hold audio as base64 text. */

/** base64 text -> Blob */
function base64ToBlob(base64, type = 'audio/mpeg') {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Blob -> base64 text */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(',') + 1)); // drop "data:...;base64,"
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/* ---------- Message box: a short note at the bottom ---------- */

let toastTimer = null;
function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
