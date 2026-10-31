// How a word moves through the four stages, and how a learning deck is chosen.
import { progressOf, setProgress, today, iso } from './store.js';

export const STAGES = ['New', 'Learning', 'Remembered', 'Applied'];
export const STAGE_KEYS = ['new', 'learning', 'remembered', 'applied'];
const RECALLS_TO_REMEMBER = 2;
export const PRACTICE_TO_APPLY = 3;
// Days until each check-up once a word is Applied; after the last one it comes back monthly.
const CHECK_DAYS = [1, 3, 7];
const LATER = 30;

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

// Result of a fill-the-gap or pick-the-word question. For a Remembered word this counts
// towards Apply; for an Applied word it is a check-up.
export function markPractice(id, correct) {
  const p = { ...progressOf(id) };
  p.last = today();
  if (p.stage === 3) {
    p.checks = correct ? (p.checks || 0) + 1 : 0;
    p.due = addDays(correct ? (CHECK_DAYS[p.checks] ?? LATER) : 1);
  } else {
    p.prac = correct ? (p.prac || 0) + 1 : Math.max(0, (p.prac || 0) - 1);
    // One correct answer a day counts, so the three are spread out.
    p.due = correct ? addDays(1) : today();
  }
  setProgress(id, p);
  return p;
}

// Result of a rewrite, marked against the model answer. "Got it" makes the word Applied.
export function markApply(id, gotIt) {
  const p = { ...progressOf(id) };
  p.last = today();
  if (gotIt && p.stage === 2) {
    p.stage = 3;
    p.checks = 0;
    p.due = addDays(CHECK_DAYS[0]);
  }
  setProgress(id, p);
  return p;
}

const isDue = (p, t) => (p.due || t) <= t;

// Remembered words still building up correct answers, plus Applied words due a check-up.
export function practicePool(words) {
  const t = today();
  const checkups = [], practice = [];
  for (const w of words) {
    const p = progressOf(w.id);
    if (p.stage === 3 && isDue(p, t)) checkups.push(w);
    else if (p.stage === 2 && (p.prac || 0) < PRACTICE_TO_APPLY && isDue(p, t)) practice.push(w);
  }
  return { checkups: shuffle(checkups), practice: shuffle(practice) };
}

// Remembered words with enough correct answers to try in your own sentence.
export const applyPool = (words) =>
  shuffle(words.filter((w) => { const p = progressOf(w.id); return p.stage === 2 && (p.prac || 0) >= PRACTICE_TO_APPLY; }));

// Three wrong options for pick-the-word: same topic and part of speech where possible, then same topic.
export function distractors(words, w, n = 3) {
  const others = words.filter((o) => o.id !== w.id && o.answer.toLowerCase() !== w.answer.toLowerCase());
  const close = shuffle(others.filter((o) => o.tag === w.tag && o.pos === w.pos && o.level === w.level));
  const topic = shuffle(others.filter((o) => o.tag === w.tag && o.pos === w.pos));
  const any = shuffle(others.filter((o) => o.tag === w.tag));
  const picked = [];
  for (const o of [...close, ...topic, ...any, ...shuffle(others)]) {
    if (picked.length === n) break;
    if (!picked.some((x) => x.answer.toLowerCase() === o.answer.toLowerCase())) picked.push(o);
  }
  return picked.map((o) => o.answer);
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

// Only the learning cards that are due: used by the quick five-minute mode.
export function buildReviewDeck(words, size) {
  const t = today();
  return shuffle(words.filter((w) => { const p = progressOf(w.id); return p.stage === 1 && isDue(p, t); })).slice(0, size);
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

export { shuffle };

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
