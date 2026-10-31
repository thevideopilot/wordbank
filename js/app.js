import { loadWords, LEVELS, TAGS } from './data.js';
import * as store from './store.js';
import {
  buildDeck, buildReviewDeck, deckCounts, stageCounts, markLearn, markPractice, markApply,
  practicePool, applyPool, distractors, shuffle, STAGES, STAGE_KEYS, PRACTICE_TO_APPLY,
} from './srs.js';
import { speak, canSpeak } from './speech.js';
import { esc, cardHead, cardDetails, stagePill, gapSentence, highlight, usesWord, ICON } from './ui.js';

const app = document.getElementById('app');
let words = [];
let byId = {};

let view = 'today';             // today | session | done | words | word
let session = null;             // see startSession()
let openId = null;
let confirmReset = false;
let list = { q: '', level: 'all', tag: 'all', stage: 'all' };
let returnTo = 'words';         // where Back goes from a word
let notice = '';                // one-off message on the Progress screen, e.g. after a restore
let installPrompt = null;

const DECK_SIZES = [5, 8, 12, 20];
// The daily session (about 30 minutes with the default 8 cards) and the quick five-minute one.
const MODES = {
  full: { practise: 12, apply: 4 },
  quick: { review: 6, practise: 6, apply: 0 },
  added: { practise: 0, apply: 0 },
};
const SHELF_DAYS = 14;

// ---------- planning a session ----------

// Words from packs released in the last fortnight (not the ones you started with).
function justAdded() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - SHELF_DAYS);
  const from = store.iso(cutoff);
  return words.filter((w) => w.added > store.since() && w.added >= from);
}

function plan(mode) {
  const s = store.settings();
  const m = MODES[mode];
  const learn = mode === 'quick' ? buildReviewDeck(words, m.review)
    : mode === 'added' ? justAdded().filter((w) => !store.progressOf(w.id).stage).slice(0, s.deckSize)
    : buildDeck(words, { level: s.level, tags: s.tags }, s.deckSize);
  const { checkups, practice } = practicePool(words);
  const prac = [...checkups.map((w) => ({ w, check: true })), ...practice.map((w) => ({ w, check: false }))].slice(0, m.practise);
  const apply = applyPool(words).slice(0, m.apply);
  return { learn, prac, apply };
}

// Rough minutes: a card ~1 min, a question ~45 s, a rewrite ~2.5 min.
const minutes = ({ learn, prac, apply }) => Math.max(1, Math.round(learn.length * 1 + prac.length * 0.75 + apply.length * 2.5));

function toSteps({ learn, prac, apply }) {
  const steps = learn.map((w) => ({ kind: 'learn', id: w.id }));
  for (const { w, check } of prac) {
    // Check-ups and every other practice question make you type the word; the rest are multiple choice.
    const typed = check || (store.progressOf(w.id).prac || 0) % 2 === 1;
    steps.push(typed
      ? { kind: 'gap', id: w.id, check }
      : { kind: 'pick', id: w.id, check, options: shuffle([w.answer, ...distractors(words, w)]) });
  }
  for (const w of apply) steps.push({ kind: 'rewrite', id: w.id });
  return steps;
}

// ---------- screens ----------

function todayScreen() {
  const s = store.settings();
  const { due, fresh } = deckCounts(words, { level: s.level, tags: s.tags });
  const full = plan('full');
  const quick = plan('quick');
  const fullN = full.learn.length + full.prac.length + full.apply.length;
  const quickN = quick.learn.length + quick.prac.length;
  const checks = full.prac.filter((p) => p.check).length;
  const counts = stageCounts(words);
  const streak = store.streak();
  const done = store.studiedToday();
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const dateLine = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const learnDue = Math.min(due, s.deckSize);
  const learnNew = full.learn.length - learnDue;
  const row = (n, title, note) => `<li class="${n ? '' : 'off'}"><span class="plan-n">${n}</span><span class="plan-l"><b>${title}</b><small>${note}</small></span></li>`;

  return `
    <header class="hello">
      <p class="eyebrow">${esc(dateLine)}</p>
      <h1>${greeting}</h1>
    </header>

    <section class="panel session" aria-labelledby="session-h">
      <div class="panel-top">
        <h2 id="session-h" class="eyebrow">Today's session</h2>
        ${streak ? `<span class="streak"><b>${streak}</b> day${streak === 1 ? '' : 's'} in a row</span>` : ''}
      </div>
      <ul class="plan">
        ${row(full.learn.length, 'Learn', full.learn.length ? `${learnDue} to review · ${learnNew} new` : 'Nothing to learn in this level and topic')}
        ${row(full.prac.length, 'Practise', full.prac.length ? `Fill the gap and pick the word${checks ? ` · ${checks} check-up${checks === 1 ? '' : 's'}` : ''}` : 'Words you remember come back here the next day')}
        ${row(full.apply.length, 'Apply', full.apply.length ? 'Rewrite plain sentences with your words' : `Unlocks after ${PRACTICE_TO_APPLY} correct answers on a word`)}
      </ul>
      <div class="seg" role="group" aria-label="Cards to learn">
        ${DECK_SIZES.map((n) => `<button class="seg-btn ${n === s.deckSize ? 'on' : ''}" data-act="size" data-v="${n}" aria-pressed="${n === s.deckSize}">${n}</button>`).join('')}
        <span class="seg-note">cards to learn</span>
      </div>
      <button class="btn primary" data-act="start" data-v="full" ${fullN ? '' : 'disabled'}>
        ${fullN ? `Start session · about ${minutes(full)} min` : 'All caught up for today'}
      </button>
      <button class="btn" data-act="start" data-v="quick" ${quickN ? '' : 'disabled'}>
        Quick 5 min${quickN ? ` · ${quickN} review${quickN === 1 ? '' : 's'}` : ' · nothing to review yet'}
      </button>
      ${done ? `<p class="muted small">You've done ${done} today.</p>` : ''}
      ${!fresh && !fullN ? '<p class="muted small">Pick another level or topic below, or come back tomorrow.</p>' : ''}
    </section>

    ${shelf()}

    <section class="stats" aria-label="Your words by stage">
      ${STAGES.map((name, i) => `
        <div class="stat stage-${STAGE_KEYS[i]}">
          <span class="stat-n">${counts[i]}</span>
          <span class="stat-l">${name}</span>
        </div>`).join('')}
    </section>

    <section class="focus" aria-label="What to learn">
      <h2 class="eyebrow">Level for new cards</h2>
      <div class="chips wrap">
        ${[...LEVELS, ['all', 'All levels']].map(([id, name]) => `<button class="chip btn-chip ${s.level === id ? 'on' : ''}" data-act="level" data-v="${id}" aria-pressed="${s.level === id}">${name}</button>`).join('')}
      </div>
      <h2 class="eyebrow">Topics</h2>
      <div class="chips wrap">
        <button class="chip btn-chip ${s.tags.length ? '' : 'on'}" data-act="tag" data-v="" aria-pressed="${!s.tags.length}">All topics</button>
        ${TAGS.map(([id, name]) => `<button class="chip btn-chip ${s.tags.includes(id) ? 'on' : ''}" data-act="tag" data-v="${id}" aria-pressed="${s.tags.includes(id)}">${name}</button>`).join('')}
      </div>
    </section>

    ${installTip()}`;
}

function shelf() {
  const fresh = justAdded();
  if (!fresh.length) return '';
  const unseen = fresh.filter((w) => !store.progressOf(w.id).stage).length;
  const shown = fresh.slice(0, 8);
  return `
    <section class="panel shelf" aria-labelledby="shelf-h">
      <div class="panel-top">
        <h2 id="shelf-h" class="eyebrow">Just added · ${fresh.length} words</h2>
      </div>
      <div class="chips wrap">
        ${shown.map((w) => `<button class="chip btn-chip" data-act="open" data-id="${esc(w.id)}">${esc(w.word)}</button>`).join('')}
        ${fresh.length > shown.length ? `<span class="chip more">+${fresh.length - shown.length}</span>` : ''}
      </div>
      ${unseen ? `<button class="btn" data-act="start" data-v="added">Learn the new words · ${Math.min(unseen, store.settings().deckSize)} cards</button>` : '<p class="muted small">You’ve started all of them.</p>'}
    </section>`;
}

function installTip() {
  let dismissed = false;
  try { dismissed = localStorage.getItem('wordbank.tip') === 'off'; } catch {}
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone || dismissed) return '';
  if (installPrompt) {
    return `<section class="tip"><p>Install Wordbank so it opens like an app and works offline.</p>
      <div class="tip-actions"><button class="btn small-btn" data-act="install">Install</button><button class="link" data-act="tip-off">Not now</button></div></section>`;
  }
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    return `<section class="tip"><p><b>Add to your Home Screen:</b> tap the Share button in Safari, then <b>Add to Home Screen</b>. It will open like an app and work offline.</p>
      <div class="tip-actions"><button class="link" data-act="tip-off">Got it</button></div></section>`;
  }
  return '';
}

function sessionScreen() {
  const { steps, i } = session;
  const step = steps[i];
  const pct = Math.round((i / steps.length) * 100);
  const body = { learn: learnStep, pick: pickStep, gap: gapStep, rewrite: rewriteStep }[step.kind](step, byId[step.id]);
  return `
    <div class="learn-top">
      <button class="icon-btn" data-act="quit" aria-label="End this session">${ICON.close}</button>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${steps.length}" aria-valuenow="${i}"><i style="width:${pct}%"></i></div>
      <span class="count">${i + 1} / ${steps.length}</span>
    </div>
    ${body}`;
}

const stepLabel = (part, kind) => `<p class="step-label"><b>${part}</b> · ${kind}</p>`;

function learnStep(step, w) {
  const { revealed } = session;
  return `
    ${session.mixed ? stepLabel('Learn', 'Card') : ''}
    <article class="card ${revealed ? 'revealed' : ''}" ${revealed ? '' : 'data-act="reveal" tabindex="0" role="button" aria-label="Reveal meaning"'}>
      <div class="card-head">${cardHead(w)}</div>
      ${revealed ? cardDetails(w) : '<p class="hint">Say what it means in your head, then tap to check.</p>'}
    </article>
    <div class="learn-actions">
      ${revealed
        ? `<button class="btn" data-act="again">Still learning</button><button class="btn good" data-act="knew">I knew it</button>`
        : `<button class="btn primary wide" data-act="reveal">Reveal meaning</button>`}
    </div>`;
}

function feedback(w, ok, note = '') {
  return `
    <div class="feedback ${ok ? 'ok' : 'no'}" role="status">
      <p class="verdict">${ok ? ICON.check : ICON.cross}<b>${!ok ? `It's “${esc(w.answer)}”` : note ? 'Nearly' : 'Right'}</b>${note ? ` <span>${note}</span>` : ''}</p>
      <p class="fb-word"><button class="link" data-act="open-step" data-id="${esc(w.id)}">${esc(w.word)}</button> ${esc(w.meaning)}</p>
    </div>`;
}

function pickStep(step, w) {
  const answered = step.chosen != null;
  const opts = step.options.map((o, n) => {
    const right = o === w.answer;
    const cls = !answered ? '' : right ? 'right' : o === step.chosen ? 'wrong' : 'dim';
    return `<button class="opt ${cls}" data-act="pick" data-v="${esc(o)}" ${answered ? 'disabled' : ''}><span class="key">${n + 1}</span>${esc(o)}</button>`;
  }).join('');
  return `
    ${stepLabel(step.check ? 'Check-up' : 'Practise', 'Pick the word')}
    <section class="q">
      <p class="q-ask">Which word fits?</p>
      <p class="q-sentence">${gapSentence(w, answered)}</p>
    </section>
    <div class="options">${opts}</div>
    ${answered ? feedback(w, step.chosen === w.answer) : ''}
    <div class="learn-actions">
      ${answered ? '<button class="btn primary wide" data-act="next">Next</button>' : ''}
    </div>`;
}

function gapStep(step, w) {
  const answered = step.result != null;
  const first = w.answer[0];
  const parts = w.answer.split(/\s+/);
  const shape = parts.length > 1 ? `${parts.length} words` : `${w.answer.length} letters`;
  const note = step.result === 'near' ? 'Close: check the spelling.' : '';
  return `
    ${stepLabel(step.check ? 'Check-up' : 'Practise', 'Fill the gap')}
    <section class="q">
      <p class="q-sentence">${gapSentence(w, answered)}</p>
      <p class="q-hint"><span class="label">Clue</span> ${esc(w.meaning)} <span class="muted">Starts with “${esc(first)}”, ${shape}.</span></p>
    </section>
    ${answered
      ? `${step.typed ? `<p class="you-typed">You wrote: <b>${esc(step.typed)}</b></p>` : ''}${feedback(w, step.result !== 'wrong', note)}`
      : `<form class="answer" data-form="gap">
          <input id="gap-input" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" aria-label="Your answer" placeholder="Type the missing word">
          <button class="btn primary" type="submit">Check</button>
        </form>
        <button class="link center" data-act="give-up">Show me the answer</button>`}
    <div class="learn-actions">
      ${answered ? '<button class="btn primary wide" data-act="next">Next</button>' : ''}
    </div>`;
}

function rewriteStep(step, w) {
  const shown = step.shown;
  const missing = shown && step.text && !usesWord(step.text, w.word);
  return `
    ${stepLabel('Apply', 'Rewrite')}
    <section class="q">
      <p class="label">Plain sentence</p>
      <p class="q-sentence plain">${esc(w.plain)}</p>
      <p class="use">Rewrite it using <button class="use-word" data-act="open-step" data-id="${esc(w.id)}">${esc(w.word)}</button></p>
      <p class="muted small">${esc(w.meaning)}</p>
    </section>
    ${shown
      ? `<section class="compare">
          <div class="mine"><p class="label">Yours</p><p>${step.text ? highlight(step.text, w.word) : '<span class="muted">You didn’t write one this time.</span>'}</p></div>
          <div class="model"><p class="label">Model answer</p><p>${highlight(w.model, w.word)}</p></div>
          ${missing ? `<p class="muted small">Your version doesn’t seem to use “${esc(w.word)}”.</p>` : ''}
          <p class="muted small">Yours doesn’t have to match. Did you use the word naturally and correctly?</p>
        </section>
        <div class="learn-actions">
          <button class="btn" data-act="applied" data-v="0">Not quite</button>
          <button class="btn good" data-act="applied" data-v="1">Got it</button>
        </div>`
      : `<textarea id="rewrite-input" rows="3" placeholder="Write your version here" aria-label="Your version">${esc(step.text || '')}</textarea>
        <div class="learn-actions">
          <button class="btn primary wide" data-act="show-model">Show model answer</button>
        </div>`}`;
}

function doneScreen() {
  const { results, tally } = session;
  const rows = [...results.entries()].map(([id, stage]) => {
    const w = byId[id];
    return `<li><button class="word-row" data-act="open" data-id="${esc(id)}"><span class="w">${esc(w.word)}</span><span class="m">${esc(w.meaning)}</span>${stagePill(stage)}</button></li>`;
  }).join('');
  const tiles = [];
  if (tally.knew + tally.again) tiles.push(['applied', tally.knew, 'Knew it'], ['learning', tally.again, 'Still learning']);
  if (tally.right + tally.wrong) tiles.push(['remembered', `${tally.right}/${tally.right + tally.wrong}`, 'Questions right']);
  if (tally.got + tally.notyet) tiles.push(['applied', tally.got, 'Sentences applied']);
  const good = tally.knew + tally.right + tally.got;
  const meh = tally.again + tally.wrong + tally.notyet;
  return `
    <header class="hello">
      <p class="eyebrow">Session finished</p>
      <h1>${good >= meh ? 'Nicely done' : 'Good practice'}</h1>
    </header>
    <section class="stats ${tiles.length <= 2 ? 'two' : tiles.length === 3 ? 'three' : ''}">
      ${tiles.map(([k, n, l]) => `<div class="stat stage-${k}"><span class="stat-n">${n}</span><span class="stat-l">${l}</span></div>`).join('')}
    </section>
    <p class="muted">Cards move to <b>Remembered</b> after you know them on two different days. Remembered words need ${PRACTICE_TO_APPLY} right answers, then one good rewrite to become <b>Applied</b>.</p>
    <ul class="word-list">${rows}</ul>
    <div class="stack">
      <button class="btn primary" data-act="nav" data-v="today">Back to Today</button>
    </div>`;
}

function wordsScreen() {
  return `
    <header class="hello compact">
      <h1>Words</h1>
      <p class="muted">${words.length} words in your bank</p>
    </header>
    <label class="search">
      ${ICON.search}
      <input id="q" type="search" placeholder="Search words or meanings" value="${esc(list.q)}" autocomplete="off" autocapitalize="off" spellcheck="false">
    </label>
    <div class="filters">
      ${filterRow('Level', 'level', [['all', 'All'], ...LEVELS])}
      ${filterRow('Topic', 'tag', [['all', 'All'], ...TAGS])}
      ${filterRow('Stage', 'stage', [['all', 'All'], ...STAGES.map((name, i) => [String(i), name])])}
    </div>
    <p class="muted small" id="list-count"></p>
    <ul class="word-list" id="list"></ul>`;
}

// One row of filter chips that scrolls sideways on a narrow phone.
const filterRow = (label, key, options) => `
  <div class="filter" role="group" aria-label="${label}">
    <span class="label">${label}</span>
    <div class="chips scroll">
      ${options.map(([id, name]) => `<button class="chip btn-chip ${list[key] === id ? 'on' : ''}" data-act="filter" data-k="${key}" data-v="${id}" aria-pressed="${list[key] === id}">${name}</button>`).join('')}
    </div>
  </div>`;

function wordRows() {
  const q = list.q.trim().toLowerCase();
  const rows = words
    .filter((w) => list.level === 'all' || w.level === list.level)
    .filter((w) => list.tag === 'all' || w.tag === list.tag)
    .filter((w) => list.stage === 'all' || String(store.progressOf(w.id).stage) === list.stage)
    .filter((w) => !q || w.word.toLowerCase().includes(q) || w.meaning.toLowerCase().includes(q))
    .sort((a, b) => a.word.localeCompare(b.word, 'en-GB'));
  const count = document.getElementById('list-count');
  if (count) count.textContent = `${rows.length} shown`;
  if (!rows.length) return `<li class="empty">No words match these filters.</li>`;
  return rows.map((w) => `<li><button class="word-row" data-act="open" data-id="${esc(w.id)}"><span class="w">${esc(w.word)}</span><span class="m">${esc(w.meaning)}</span>${stagePill(store.progressOf(w.id).stage)}</button></li>`).join('');
}

function progressNote(p) {
  if (!p.seen && !p.stage) return 'Not studied yet';
  const when = (d) => (d <= store.today() ? 'today' : new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
  if (p.stage === 1) return `Seen ${p.seen} time${p.seen === 1 ? '' : 's'} · next review ${when(p.due || store.today())}`;
  if (p.stage === 2) return `${p.prac || 0} of ${PRACTICE_TO_APPLY} right answers${(p.prac || 0) >= PRACTICE_TO_APPLY ? ' · ready to rewrite' : ''}`;
  return `Next check-up ${when(p.due || store.today())}`;
}

function wordScreen() {
  const w = byId[openId];
  const p = store.progressOf(w.id);
  return `
    <div class="learn-top">
      <button class="icon-btn" data-act="back" aria-label="Back">${ICON.back}</button>
      <span></span>
    </div>
    <article class="card revealed">
      <div class="card-head">${cardHead(w)}</div>
      ${cardDetails(w)}
    </article>
    <section class="word-progress">
      ${stagePill(p.stage)} <span class="muted small">${progressNote(p)}</span>
      ${p.stage && !session ? `<button class="link danger" data-act="reset">${confirmReset ? 'Tap again to reset' : 'Reset to New'}</button>` : ''}
    </section>`;
}

function progressScreen() {
  const t = store.today();
  const counts = stageCounts(words);
  const allDays = store.days();
  const studied = Object.keys(allDays).length;
  const total = Object.values(allDays).reduce((a, b) => a + b, 0);

  // The last 14 days as bars.
  const last = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    last.push({ d, n: allDays[store.iso(d)] || 0 });
  }
  const peak = Math.max(10, ...last.map((x) => x.n));
  const bars = last.map(({ d, n }) => `
    <div class="day ${store.iso(d) === t ? 'today' : ''}" title="${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}: ${n}">
      <i style="height:${Math.round((n / peak) * 100)}%"></i>
      <span>${d.toLocaleDateString('en-GB', { weekday: 'narrow' })}</span>
    </div>`).join('');

  // Stage mix for each level and topic, as stacked bars.
  const mix = (group) => {
    const c = [0, 0, 0, 0];
    for (const w of group) c[store.progressOf(w.id).stage]++;
    const sum = group.length || 1;
    const started = group.length - c[0];
    return `<div class="mix" role="img" aria-label="${STAGES.map((n, i) => `${c[i]} ${n}`).join(', ')}">
        ${[3, 2, 1].map((i) => (c[i] ? `<i class="stage-${STAGE_KEYS[i]}" style="width:${(c[i] / sum) * 100}%"></i>` : '')).join('')}
      </div><span class="mix-n">${started} / ${group.length}</span>`;
  };
  const rows = (pairs, key) => pairs.map(([id, name]) => `
    <li><span class="mix-l">${name}</span>${mix(words.filter((w) => w[key] === id))}</li>`).join('');

  // What's coming up in the next week.
  const week = new Date(); week.setDate(week.getDate() + 7);
  const soon = store.iso(week);
  let checkups = 0, ready = 0, reviews = 0;
  for (const w of words) {
    const p = store.progressOf(w.id);
    if (p.stage === 3 && (p.due || t) <= soon) checkups++;
    if (p.stage === 2 && (p.prac || 0) >= PRACTICE_TO_APPLY) ready++;
    if (p.stage === 1 && (p.due || t) <= soon) reviews++;
  }

  return `
    <header class="hello compact">
      <h1>Progress</h1>
      <p class="muted">${counts[3]} of ${words.length} words applied</p>
    </header>

    <section class="stats" aria-label="Your words by stage">
      ${STAGES.map((name, i) => `<div class="stat stage-${STAGE_KEYS[i]}"><span class="stat-n">${counts[i]}</span><span class="stat-l">${name}</span></div>`).join('')}
    </section>

    <section class="panel">
      <div class="panel-top">
        <h2 class="eyebrow">Last 14 days</h2>
        <span class="streak"><b>${store.streak()}</b> day streak</span>
      </div>
      <div class="days" aria-label="Cards and questions per day">${bars}</div>
      <p class="muted small">${total} cards and questions over ${studied} day${studied === 1 ? '' : 's'}.</p>
    </section>

    <section class="panel">
      <h2 class="eyebrow">Next 7 days</h2>
      <ul class="plan">
        <li class="${reviews ? '' : 'off'}"><span class="plan-n">${reviews}</span><span class="plan-l"><b>Card reviews</b><small>Learning words coming back</small></span></li>
        <li class="${checkups ? '' : 'off'}"><span class="plan-n">${checkups}</span><span class="plan-l"><b>Check-ups</b><small>Applied words to keep fresh</small></span></li>
        <li class="${ready ? '' : 'off'}"><span class="plan-n">${ready}</span><span class="plan-l"><b>Ready to rewrite</b><small>Remembered words with ${PRACTICE_TO_APPLY} right answers</small></span></li>
      </ul>
    </section>

    <section class="panel">
      <h2 class="eyebrow">By level</h2>
      <ul class="mixes">${rows(LEVELS, 'level')}</ul>
      <h2 class="eyebrow">By topic</h2>
      <ul class="mixes">${rows(TAGS, 'tag')}</ul>
      <p class="legend">${STAGES.map((n, i) => `<span><i class="stage-${STAGE_KEYS[i]}"></i>${n}</span>`).join('')}</p>
    </section>

    <section class="panel backup">
      <h2 class="eyebrow">Backup</h2>
      <p class="small">Your progress is saved on this device only. Download a backup now and then, and restore it if you change phone or clear your browser.</p>
      ${notice ? `<p class="notice" role="status">${esc(notice)}</p>` : ''}
      <div class="backup-actions">
        <button class="btn" data-act="backup">${ICON.download} Save backup</button>
        <label class="btn">${ICON.upload} Restore<input type="file" id="restore" accept="application/json,.json" hidden></label>
      </div>
    </section>`;
}

function nav() {
  const on = (id) => view === id || (id === returnTo && view === 'word');
  const tab = (id, label, icon) =>
    `<button class="tab ${on(id) ? 'on' : ''}" data-act="nav" data-v="${id}">${icon}<span>${label}</span></button>`;
  return `<nav class="tabs" aria-label="Main">${tab('today', 'Today', ICON.today)}${tab('words', 'Words', ICON.words)}${tab('progress', 'Progress', ICON.progress)}</nav>`;
}

// ---------- rendering ----------

function render({ keepScroll = false } = {}) {
  const screens = { today: todayScreen, session: sessionScreen, done: doneScreen, words: wordsScreen, word: wordScreen, progress: progressScreen };
  const focused = view === 'session' || (view === 'word' && session);
  app.className = `app view-${focused ? 'learn' : view}`;
  app.innerHTML = `<main class="screen">${screens[view]()}</main>${focused ? '' : nav()}`;
  if (!keepScroll) window.scrollTo(0, 0);
  if (!canSpeak()) app.querySelectorAll('.speak').forEach((b) => b.remove());
  if (view === 'words') {
    const q = document.getElementById('q');
    const refresh = () => { document.getElementById('list').innerHTML = wordRows(); };
    q.addEventListener('input', () => { list.q = q.value; refresh(); });
    refresh();
  }
  document.getElementById('restore')?.addEventListener('change', restore);
  notice = '';
  document.getElementById('gap-input')?.focus({ preventScroll: true });
}

function go(next) {
  view = next;
  confirmReset = false;
  render();
}

// ---------- actions ----------

function startSession(mode) {
  const steps = toSteps(plan(mode));
  if (!steps.length) { go('today'); return; }
  session = {
    mode, steps, i: 0, revealed: false,
    learnEnd: steps.filter((s) => s.kind === 'learn').length,
    mixed: steps.some((s) => s.kind !== 'learn'),
    requeued: new Set(), results: new Map(),
    tally: { knew: 0, again: 0, right: 0, wrong: 0, got: 0, notyet: 0 },
  };
  go('session');
}

function advance() {
  session.i++;
  session.revealed = false;
  if (session.i >= session.steps.length) endSession();
  else render();
}

function endSession() {
  if (session.results.size) go('done');
  else { session = null; go('today'); }
}

const current = () => session.steps[session.i];

function answerLearn(knew) {
  const { id } = current();
  const p = markLearn(id, knew);
  store.logStudy();
  session.results.set(id, p.stage);
  if (knew) session.tally.knew++;
  else {
    session.tally.again++;
    // Show a missed card once more, later in the learning part of the session.
    if (!session.requeued.has(id)) {
      session.requeued.add(id);
      session.steps.splice(Math.min(session.i + 4, session.learnEnd), 0, { kind: 'learn', id });
      session.learnEnd++;
    }
  }
  advance();
}

function scoreQuestion(step, correct) {
  const p = markPractice(step.id, correct);
  store.logStudy();
  session.results.set(step.id, p.stage);
  session.tally[correct ? 'right' : 'wrong']++;
  render({ keepScroll: true });
}

// Lower-case, straight apostrophes, single spaces, and British or American -ise/-ize both accepted.
const norm = (s) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' -]/g, '').replace(/\s+/g, ' ').trim().replace(/iz(e|ed|es|ing|ation)\b/g, 'is$1');

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

function checkGap(typed) {
  const step = current();
  const w = byId[step.id];
  const a = norm(typed), b = norm(w.answer);
  if (!a) return;
  step.typed = typed.trim();
  step.result = a === b ? 'right' : b.length >= 5 && distance(a, b) === 1 ? 'near' : 'wrong';
  scoreQuestion(step, step.result !== 'wrong');
}

const actions = {
  nav: (el) => { if (el.dataset.v !== 'word') session = null; go(el.dataset.v); },
  start: (el) => startSession(el.dataset.v),
  reveal: () => { session.revealed = true; render({ keepScroll: true }); },
  knew: () => answerLearn(true),
  again: () => answerLearn(false),
  quit: endSession,
  next: advance,
  pick: (el) => {
    const step = current();
    if (step.chosen != null) return;
    step.chosen = el.dataset.v;
    scoreQuestion(step, step.chosen === byId[step.id].answer);
  },
  'give-up': () => { const step = current(); step.result = 'wrong'; step.typed = ''; scoreQuestion(step, false); },
  'show-model': () => {
    const step = current();
    step.text = document.getElementById('rewrite-input')?.value.trim() || '';
    step.shown = true;
    render({ keepScroll: true });
  },
  applied: (el) => {
    const step = current();
    const got = el.dataset.v === '1';
    const p = markApply(step.id, got);
    store.logStudy();
    session.results.set(step.id, p.stage);
    session.tally[got ? 'got' : 'notyet']++;
    advance();
  },
  'open-step': (el) => {
    // Keep a half-written rewrite while you look the word up.
    const box = document.getElementById('rewrite-input');
    if (box) current().text = box.value;
    openId = el.dataset.id;
    go('word');
  },
  back: () => go(session ? 'session' : returnTo),
  speak: (el) => speak(el.dataset.say),
  size: (el) => { store.setSetting('deckSize', Number(el.dataset.v)); render({ keepScroll: true }); },
  level: (el) => { store.setSetting('level', el.dataset.v); render({ keepScroll: true }); },
  tag: (el) => {
    const v = el.dataset.v;
    const tags = store.settings().tags;
    store.setSetting('tags', !v ? [] : tags.includes(v) ? tags.filter((t) => t !== v) : [...tags, v]);
    render({ keepScroll: true });
  },
  filter: (el) => { list[el.dataset.k] = el.dataset.v; render({ keepScroll: true }); },
  open: (el) => { session = null; returnTo = view === 'word' ? returnTo : view === 'done' ? 'today' : view; openId = el.dataset.id; go('word'); },
  backup: () => {
    const blob = new Blob([store.exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `wordbank-backup-${store.today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  reset: () => {
    if (!confirmReset) { confirmReset = true; render({ keepScroll: true }); return; }
    store.resetProgress(openId);
    confirmReset = false;
    render({ keepScroll: true });
  },
  install: async () => { installPrompt?.prompt(); installPrompt = null; render({ keepScroll: true }); },
  'tip-off': () => { try { localStorage.setItem('wordbank.tip', 'off'); } catch {} render({ keepScroll: true }); },
};

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  actions[el.dataset.act]?.(el);
});

async function restore(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const n = store.importData(await file.text());
    notice = `Restored progress for ${n} word${n === 1 ? '' : 's'} from ${file.name}.`;
  } catch (err) {
    notice = err instanceof SyntaxError ? "That file isn't a Wordbank backup." : err.message;
  }
  render({ keepScroll: true });
}

app.addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.target.dataset.form === 'gap') checkGap(document.getElementById('gap-input').value);
});

document.addEventListener('keydown', (e) => {
  if (view !== 'session') return;
  if (e.key === 'Escape') { endSession(); return; }
  if (e.target.matches('input, textarea')) return;
  const step = current();
  const answered = step.chosen != null || step.result != null;
  if (step.kind === 'learn') {
    if (!session.revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); actions.reveal(); }
    else if (session.revealed && e.key === 'ArrowRight') answerLearn(true);
    else if (session.revealed && e.key === 'ArrowLeft') answerLearn(false);
  } else if ((step.kind === 'pick' || step.kind === 'gap') && answered && e.key === 'Enter') {
    e.preventDefault(); advance();
  } else if (step.kind === 'pick' && !answered && /^[1-4]$/.test(e.key)) {
    app.querySelectorAll('.opt')[Number(e.key) - 1]?.click();
  }
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  if (view === 'today') render({ keepScroll: true });
});

// ---------- start ----------

(async function boot() {
  try {
    words = await loadWords();
    byId = Object.fromEntries(words.map((w) => [w.id, w]));
    store.askToPersist();
    render();
  } catch (err) {
    app.innerHTML = `<p class="loading">Couldn't load the word list. Check your connection and reopen the app.<br><small>${esc(err.message)}</small></p>`;
  }
  if ('serviceWorker' in navigator) {
    // When an update takes over, reload so the new version shows straight away (but never mid-session).
    const updating = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (updating && view !== 'session') location.reload();
    });
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
