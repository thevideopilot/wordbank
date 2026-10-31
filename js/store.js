// Progress lives on this device only, in localStorage.
const KEY = 'wordbank.v1';

const fresh = () => ({
  progress: {},          // word id -> { stage, recall, seen, due, last }
  settings: { level: 'basic', tags: [], deckSize: 8 },
  days: {},              // 'YYYY-MM-DD' -> cards studied that day
});

let state = load();

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) return { ...fresh(), ...saved, settings: { ...fresh().settings, ...saved.settings } };
  } catch {}
  return fresh();
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

export const settings = () => state.settings;
export function setSetting(key, value) { state.settings[key] = value; save(); }

export const progressOf = (id) => state.progress[id] || { stage: 0, recall: 0, seen: 0 };
export function setProgress(id, p) { state.progress[id] = p; save(); }
export function resetProgress(id) { delete state.progress[id]; save(); }

export function logStudy(n = 1) {
  const d = today();
  state.days[d] = (state.days[d] || 0) + n;
  save();
}

export const studiedToday = () => state.days[today()] || 0;

// Consecutive days with at least one card, counting back from today (or yesterday,
// so the streak doesn't look broken first thing in the morning).
export function streak() {
  let n = 0;
  let d = new Date();
  if (!state.days[today()]) d.setDate(d.getDate() - 1);
  while (state.days[iso(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export const iso = (d) => {
  const z = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
export const today = () => iso(new Date());

// Ask the browser not to clear our storage when space is low (matters on iPhone).
export function askToPersist() {
  try { navigator.storage?.persist?.(); } catch {}
}
