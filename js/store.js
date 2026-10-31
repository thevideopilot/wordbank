// Progress lives on this device only, in localStorage.
const KEY = 'wordbank.v1';

const fresh = () => ({
  since: null,           // first day the app was used, so only later packs count as "just added"
  progress: {},          // word id -> { stage, recall, seen, due, last, prac, checks }
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

export const since = () => state.since;
export const days = () => state.days;
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

// Backup: everything in one JSON file the person can keep and restore later.
export const exportData = () => JSON.stringify({ app: 'wordbank', version: 1, saved: new Date().toISOString(), ...state }, null, 1);

export function importData(text) {
  const data = JSON.parse(text);
  if (data.app !== 'wordbank' || typeof data.progress !== 'object' || !data.progress) {
    throw new Error("This doesn't look like a Wordbank backup.");
  }
  state = {
    ...fresh(),
    since: data.since || state.since,
    progress: data.progress,
    settings: { ...fresh().settings, ...data.settings },
    days: data.days || {},
  };
  save();
  return Object.keys(state.progress).length;
}

// Ask the browser not to clear our storage when space is low (matters on iPhone).
export function askToPersist() {
  try { navigator.storage?.persist?.(); } catch {}
}

// Older saves have no start date: use the first day studied.
if (!state.since) { state.since = Object.keys(state.days).sort()[0] || today(); save(); }
