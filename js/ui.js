// Small rendering helpers shared by the screens.
import { POS, levelName, tagName } from './data.js';
import { STAGES, STAGE_KEYS } from './srs.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Matches the word plus simple inflections such as -s, -ed, -ing.
function wordPattern(word) {
  const multi = word.includes(' ') || word.includes('-');
  let stem = word.toLowerCase();
  if (!multi && stem.length > 4 && stem.endsWith('e')) stem = stem.slice(0, -1);
  if (!multi && stem.length > 4 && stem.endsWith('y')) stem = stem.slice(0, -1);
  const pattern = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(multi ? `(${pattern})` : `\\b(${pattern}\\w*)`, 'gi');
}

// Highlight the word inside an example.
export const highlight = (text, word) => esc(text).replace(wordPattern(word), '<mark>$1</mark>');

export const usesWord = (text, word) => wordPattern(word).test(text);

// A gap-fill sentence with the blank shown empty, or filled with the answer.
export function gapSentence(w, filled) {
  const [before, rest = ''] = w.gap.split('___');
  // Keep punctuation straight after the blank on the same line as it.
  const [, stuck, after] = rest.match(/^([.,;:!?'’"]*)([\s\S]*)$/);
  const blank = filled ? `<mark class="blank filled">${esc(w.answer)}</mark>` : '<span class="blank" aria-label="blank"></span>';
  return `${esc(before)}<span class="nowrap">${blank}${esc(stuck)}</span>${esc(after)}`;
}

export const stagePill = (stage) =>
  `<span class="pill stage-${STAGE_KEYS[stage]}">${STAGES[stage]}</span>`;

export const metaLine = (w) => `${esc(levelName(w.level))} · ${esc(tagName(w.tag))}`;
export const posName = (p) => POS[p] || p;

export function cardHead(w, tag = 'h1') {
  return `
    <p class="card-meta">${metaLine(w)}</p>
    <${tag} class="word">${esc(w.word)}</${tag}>
    <p class="ipa"><span>${esc(w.ipa)}</span> · ${esc(posName(w.pos))}</p>
    <button class="speak" data-act="speak" data-say="${esc(w.word)}" aria-label="Hear ${esc(w.word)}">${ICON.speaker}<span>Hear it</span></button>`;
}

export function cardDetails(w) {
  const isTech = w.tag === 'tech';
  const chips = (list) => list.map((s) => `<span class="chip">${esc(s)}</span>`).join('');
  return `
    <div class="details">
      <p class="meaning">${esc(w.meaning)}</p>
      <div class="example">
        <span class="label">${isTech ? 'Think of it like' : 'Everyday'}</span>
        <p>${isTech ? esc(w.everyday) : highlight(w.everyday, w.word)}</p>
      </div>
      <div class="example">
        <span class="label">At work</span>
        <p>${highlight(w.work, w.word)}</p>
      </div>
      ${w.synonyms.length ? `<div class="related"><span class="label">Similar</span><div class="chips">${chips(w.synonyms)}</div></div>` : ''}
      ${w.antonyms.length ? `<div class="related"><span class="label">Opposite</span><div class="chips">${chips(w.antonyms)}</div></div>` : ''}
    </div>`;
}

export const ICON = {
  speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  today: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 10h16M9 3v4M15 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  words: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M5 17a3 3 0 0 1 3-3h10M9 8h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cross: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  progress: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V12M10 20V6M15 20v-9M20 20V4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V5M7 9.5l5-5 5 5M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 16l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
};
