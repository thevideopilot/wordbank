// How a word moves through the four stages, and how a learning deck is chosen.
import { progressOf, setProgress, today, iso } from './store.js';

export const STAGES = ['New', 'Learning', 'Remembered', 'Applied'];
export const STAGE_KEYS = ['new', 'learning', 'remembered', 'applied'];
const RECALLS_TO_REMEMBER = 2;

const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

// Result of tapping "I knew it" (knew = true) or "Still learning" on a card.
export function markLearn(id, knew) {
  const p = { ...progressOf(id) };
  p.seen = (p.seen || 0) + 1;
  p.last = today();
  p.recall = knew ? (p.recall || 0) + 1 : 0;
  if (p.stage === 0) p.stage = 1;
  if (p.stage === 1 && p.recall >= RECALLS_TO_REMEMBER) p.stage = 2;
  // A card you knew waits until tomorrow; one you didn't is due again straight away.
  p.due = knew ? addDays(1) : today();
  setProgress(id, p);
  return p;
}

export function matchesFocus(w, { level, tags }) {
  return (level === 'all' || w.level === level) && (!tags.length || tags.includes(w.tag));
}

// Learning cards that are due come first, then new words, up to the deck size.
export function buildDeck(words, focus, size) {
  const t = today();
  const pool = words.filter((w) => matchesFocus(w, focus));
  const due = pool.filter((w) => { const p = progressOf(w.id); return p.stage === 1 && (p.due || t) <= t; });
  const fresh = pool.filter((w) => progressOf(w.id).stage === 0).sort((a, b) => hash(a.id) - hash(b.id));
  return [...shuffle(due), ...fresh].slice(0, size);
}

export function deckCounts(words, focus) {
  const t = today();
  let due = 0, fresh = 0;
  for (const w of words) {
    if (!matchesFocus(w, focus)) continue;
    const p = progressOf(w.id);
    if (p.stage === 0) fresh++;
    else if (p.stage === 1 && (p.due || t) <= t) due++;
  }
  return { due, fresh };
}

export function stageCounts(words) {
  const c = [0, 0, 0, 0];
  for (const w of words) c[progressOf(w.id).stage]++;
  return c;
}

// Stable mixed order for new words, so tags and topics are interleaved.
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function shuffle(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
