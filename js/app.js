import { loadWords, LEVELS, TAGS } from './data.js';
import * as store from './store.js';
import { buildDeck, deckCounts, stageCounts, markLearn, STAGES, STAGE_KEYS } from './srs.js';
import { speak, canSpeak } from './speech.js';
import { esc, cardHead, cardDetails, stagePill, ICON } from './ui.js';

const app = document.getElementById('app');
let words = [];
let byId = {};

let view = 'today';             // today | learn | done | words | word
let session = null;             // { deck: [ids], i, revealed, knew, again, requeued: Set, results: Map }
let openId = null;
let confirmReset = false;
let list = { q: '', level: 'all' };
let installPrompt = null;

const DECK_SIZES = [5, 8, 12, 20];

// ---------- screens ----------

function todayScreen() {
  const s = store.settings();
  const focus = { level: s.level, tags: s.tags };
  const { due, fresh } = deckCounts(words, focus);
  const counts = stageCounts(words);
  const streak = store.streak();
  const done = store.studiedToday();
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const dateLine = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const available = Math.min(s.deckSize, due + fresh);

  return `
    <header class="hello">
      <p class="eyebrow">${esc(dateLine)}</p>
      <h1>${greeting}</h1>
    </header>

    <section class="panel session" aria-labelledby="session-h">
      <div class="panel-top">
        <h2 id="session-h" class="eyebrow">Today's cards</h2>
        ${streak ? `<span class="streak"><b>${streak}</b> day${streak === 1 ? '' : 's'} in a row</span>` : ''}
      </div>
      <p class="session-line"><b>${due}</b> to review <span class="dot">·</span> <b>${fresh}</b> new</p>
      <div class="seg" role="group" aria-label="Cards per session">
        ${DECK_SIZES.map((n) => `<button class="seg-btn ${n === s.deckSize ? 'on' : ''}" data-act="size" data-v="${n}" aria-pressed="${n === s.deckSize}">${n}</button>`).join('')}
        <span class="seg-note">cards per round</span>
      </div>
      <button class="btn primary" data-act="start" ${available ? '' : 'disabled'}>
        ${available ? `Start learning · ${available} card${available === 1 ? '' : 's'}` : 'All caught up here'}
      </button>
      ${available ? '' : '<p class="muted small">Nothing due in this level and topic. Pick another below, or come back tomorrow for reviews.</p>'}
      ${done ? `<p class="muted small">${done} card${done === 1 ? '' : 's'} studied today.</p>` : ''}
    </section>

    <section class="stats" aria-label="Your words by stage">
      ${STAGES.map((name, i) => `
        <div class="stat stage-${STAGE_KEYS[i]}">
          <span class="stat-n">${counts[i]}</span>
          <span class="stat-l">${name}</span>
        </div>`).join('')}
    </section>

    <section class="focus" aria-label="What to study">
      <h2 class="eyebrow">Level</h2>
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

    <p class="coming">Coming next: fill-the-gap, pick-the-word and rewrite exercises.</p>`;
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

function learnScreen() {
  const { deck, i, revealed } = session;
  const w = byId[deck[i]];
  const pct = Math.round((i / deck.length) * 100);
  return `
    <div class="learn-top">
      <button class="icon-btn" data-act="quit" aria-label="End this round">${ICON.close}</button>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${deck.length}" aria-valuenow="${i}"><i style="width:${pct}%"></i></div>
      <span class="count">${i + 1} / ${deck.length}</span>
    </div>
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

function doneScreen() {
  const { results, knew, again } = session;
  const rows = [...results.entries()].map(([id, stage]) => {
    const w = byId[id];
    return `<li><button class="word-row" data-act="open" data-id="${esc(id)}"><span class="w">${esc(w.word)}</span><span class="m">${esc(w.meaning)}</span>${stagePill(stage)}</button></li>`;
  }).join('');
  return `
    <header class="hello">
      <p class="eyebrow">Round finished</p>
      <h1>${knew >= again ? 'Nicely done' : 'Good practice'}</h1>
    </header>
    <section class="stats two">
      <div class="stat stage-applied"><span class="stat-n">${knew}</span><span class="stat-l">Knew it</span></div>
      <div class="stat stage-learning"><span class="stat-n">${again}</span><span class="stat-l">Still learning</span></div>
    </section>
    <p class="muted">Words move to <b>Remembered</b> after you know them on two different days.</p>
    <ul class="word-list">${rows}</ul>
    <div class="stack">
      <button class="btn primary" data-act="start">Another round</button>
      <button class="btn" data-act="nav" data-v="today">Back to Today</button>
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

function wordScreen() {
  const w = byId[openId];
  const p = store.progressOf(w.id);
  const seen = p.seen ? `Seen ${p.seen} time${p.seen === 1 ? '' : 's'}` : 'Not studied yet';
  return `
    <div class="learn-top">
      <button class="icon-btn" data-act="nav" data-v="words" aria-label="Back to words">${ICON.back}</button>
      <span></span>
    </div>
    <article class="card revealed">
      <div class="card-head">${cardHead(w)}</div>
      ${cardDetails(w)}
    </article>
    <section class="word-progress">
      ${stagePill(p.stage)} <span class="muted small">${seen}</span>
      ${p.stage ? `<button class="link danger" data-act="reset">${confirmReset ? 'Tap again to reset' : 'Reset to New'}</button>` : ''}
    </section>`;
}

function nav() {
  const tab = (id, label, icon) =>
    `<button class="tab ${view === id || (id === 'words' && view === 'word') ? 'on' : ''}" data-act="nav" data-v="${id}">${icon}<span>${label}</span></button>`;
  return `<nav class="tabs" aria-label="Main">${tab('today', 'Today', ICON.today)}${tab('words', 'Words', ICON.words)}</nav>`;
}

// ---------- rendering ----------

function render({ keepScroll = false } = {}) {
  const screens = { today: todayScreen, learn: learnScreen, done: doneScreen, words: wordsScreen, word: wordScreen };
  const focused = view === 'learn';
  app.className = `app view-${view}`;
  app.innerHTML = `<main class="screen">${screens[view]()}</main>${focused ? '' : nav()}`;
  if (!keepScroll) window.scrollTo(0, 0);
  if (!canSpeak()) app.querySelectorAll('.speak').forEach((b) => b.remove());
  if (view === 'words') {
    const q = document.getElementById('q');
    q.addEventListener('input', () => { list.q = q.value; document.getElementById('list').innerHTML = wordRows(); });
  }
}

function go(next) {
  view = next;
  confirmReset = false;
  render();
}

// ---------- actions ----------

function startSession() {
  const s = store.settings();
  const deck = buildDeck(words, { level: s.level, tags: s.tags }, s.deckSize).map((w) => w.id);
  if (!deck.length) { go('today'); return; }
  session = { deck, i: 0, revealed: false, knew: 0, again: 0, requeued: new Set(), results: new Map() };
  go('learn');
}

function answer(knew) {
  const id = session.deck[session.i];
  const p = markLearn(id, knew);
  store.logStudy();
  session.results.set(id, p.stage);
  if (knew) session.knew++;
  else {
    session.again++;
    // Show a missed card once more later in this round.
    if (!session.requeued.has(id)) {
      session.requeued.add(id);
      session.deck.splice(Math.min(session.i + 4, session.deck.length), 0, id);
    }
  }
  session.i++;
  session.revealed = false;
  if (session.i >= session.deck.length) go('done');
  else render();
}

const actions = {
  nav: (el) => go(el.dataset.v),
  start: startSession,
  reveal: () => { session.revealed = true; render({ keepScroll: true }); },
  knew: () => answer(true),
  again: () => answer(false),
  quit: () => go(session.results.size ? 'done' : 'today'),
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
  open: (el) => { openId = el.dataset.id; go('word'); },
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

document.addEventListener('keydown', (e) => {
  if (view !== 'learn' || e.target.matches('input, textarea')) return;
  if (!session.revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); actions.reveal(); }
  else if (session.revealed && e.key === 'ArrowRight') answer(true);
  else if (session.revealed && e.key === 'ArrowLeft') answer(false);
  else if (e.key === 'Escape') actions.quit();
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
