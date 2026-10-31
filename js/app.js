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
let list = { q: '', level: 'all' };
let installPrompt = null;

const DECK_SIZES = [5, 8, 12, 20];
// The daily session (about 30 minutes with the default 8 cards) and the quick five-minute one.
const MODES = {
  full: { practise: 12, apply: 4 },
  quick: { review: 6, practise: 6, apply: 0 },
};

// ---------- planning a session ----------

function plan(mode) {
  const s = store.settings();
  const m = MODES[mode];
  const learn = mode === 'quick'
    ? buildReviewDeck(words, m.review)
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

    ${installTip()}

    <p class="coming">Coming next: progress screen, backup and weekly new words.</p>`;
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
    <div class="chips wrap">
      ${[['all', 'All'], ...LEVELS].map(([id, name]) => `<button class="chip btn-chip ${list.level === id ? 'on' : ''}" data-act="list-level" data-v="${id}" aria-pressed="${list.level === id}">${name}</button>`).join('')}
    </div>
    <ul class="word-list" id="list">${wordRows()}</ul>`;
}

function wordRows() {
  const q = list.q.trim().toLowerCase();
  const rows = words
    .filter((w) => list.level === 'all' || w.level === list.level)
    .filter((w) => !q || w.word.toLowerCase().includes(q) || w.meaning.toLowerCase().includes(q))
    .sort((a, b) => a.word.localeCompare(b.word, 'en-GB'));
  if (!rows.length) return `<li class="empty">No words match “${esc(list.q)}”.</li>`;
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

function nav() {
  const tab = (id, label, icon) =>
    `<button class="tab ${view === id || (id === 'words' && view === 'word') ? 'on' : ''}" data-act="nav" data-v="${id}">${icon}<span>${label}</span></button>`;
  return `<nav class="tabs" aria-label="Main">${tab('today', 'Today', ICON.today)}${tab('words', 'Words', ICON.words)}</nav>`;
}

// ---------- rendering ----------

function render({ keepScroll = false } = {}) {
  const screens = { today: todayScreen, session: sessionScreen, done: doneScreen, words: wordsScreen, word: wordScreen };
  const focused = view === 'session' || (view === 'word' && session);
  app.className = `app view-${focused ? 'learn' : view}`;
  app.innerHTML = `<main class="screen">${screens[view]()}</main>${focused ? '' : nav()}`;
  if (!keepScroll) window.scrollTo(0, 0);
  if (!canSpeak()) app.querySelectorAll('.speak').forEach((b) => b.remove());
  if (view === 'words') {
    const q = document.getElementById('q');
    q.addEventListener('input', () => { list.q = q.value; document.getElementById('list').innerHTML = wordRows(); });
  }
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
  back: () => go(session ? 'session' : 'words'),
  speak: (el) => speak(el.dataset.say),
  size: (el) => { store.setSetting('deckSize', Number(el.dataset.v)); render({ keepScroll: true }); },
  level: (el) => { store.setSetting('level', el.dataset.v); render({ keepScroll: true }); },
  tag: (el) => {
    const v = el.dataset.v;
    const tags = store.settings().tags;
    store.setSetting('tags', !v ? [] : tags.includes(v) ? tags.filter((t) => t !== v) : [...tags, v]);
    render({ keepScroll: true });
  },
  'list-level': (el) => { list.level = el.dataset.v; render({ keepScroll: true }); },
  open: (el) => { session = null; openId = el.dataset.id; go('word'); },
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
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
