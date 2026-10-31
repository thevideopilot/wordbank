// Loads every word pack listed in data/index.json. New packs are added there, so the
// weekly top-up only has to drop in a file and list it.

export const LEVELS = [
  ['basic', 'Basic'],
  ['intermediate', 'Intermediate'],
  ['advanced', 'Advanced'],
];

export const TAGS = [
  ['exam', 'GRE / GMAT'],
  ['tech', 'Tech & AI'],
  ['exec', 'Strategy'],
  ['politics', 'Politics'],
  ['econ', 'Economics'],
  ['markets', 'Capital markets'],
];

// Everything except vocabulary is a concept: its "everyday" line is a plain-English comparison.
export const isConcept = (w) => w.tag !== 'exam';

export const POS = {
  adj: 'adjective', n: 'noun', v: 'verb', adv: 'adverb', 'phr v': 'phrasal verb',
};

export const levelName = (k) => (LEVELS.find(([id]) => id === k) || [, k])[1];
export const tagName = (k) => (TAGS.find(([id]) => id === k) || [, k])[1];

export async function loadWords() {
  const index = await getJSON('data/index.json');
  const packs = await Promise.all(index.packs.map((f) => getJSON(`data/${f}`).catch(() => null)));
  const seen = new Map();
  for (const pack of packs) {
    if (!pack) continue;
    for (const w of pack.words) if (!seen.has(w.id)) seen.set(w.id, w);
  }
  return [...seen.values()];
}

async function getJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}
