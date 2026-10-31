# Wordbank

A pocket vocabulary trainer for general English, built as an installable web app (PWA) for one person to use on their phone. You learn a word on a card, prove you remember it, then use it in your own sentences.

British English throughout. Your progress is stored on your device only.

## Install on your phone

1. Open the app's GitHub Pages address in **Safari** (iPhone) or **Chrome** (Android).
2. iPhone: tap **Share → Add to Home Screen**. Android: tap **Install** in the app or the browser menu.
3. Open it from the Home Screen. After the first visit it works offline.

## How a word moves

| Stage | What happens | Moves on when |
| --- | --- | --- |
| New | You see the word on a card and tap to reveal it | You study it once |
| Learning | The card comes back in later rounds | You know it on two separate days |
| Remembered | It appears in fill-the-gap and pick-the-word questions (sprint 2) | You get it right three times |
| Applied | You've rewritten plain sentences with it (sprint 2) | Check-ups after 1, 3 and 7 days |

## Word bank

Words are grouped by **level** (Basic, Intermediate, Advanced) and tagged by **topic**: General, GRE / GMAT, Executive & strategy, Tech & AI. Each card has the meaning, British IPA, an everyday example (a plain-English comparison for tech terms), a work example, similar and opposite words, a gap-fill sentence, and a plain sentence with a model rewrite.

Words live in `data/pack-*.json`, listed in `data/index.json`. To add a pack:

```bash
python3 tools/build_pack.py tools/words-pack-002.txt data/pack-002.json 2026-11-07
```

Then add `"pack-002.json"` to `data/index.json`, add it to the `SHELL` list in `sw.js` and bump `VERSION` there.

## Sprints

1. **Foundation and Learn** (done): installable offline app, Today screen, Learn cards with British pronunciation, four-stage tracking, Words list and search, first 150 words.
2. **Practise and Apply**: fill-the-gap, pick-the-word, rewrite with model answer, daily 30-minute session and 5-minute mode, spaced check-ups, +175 words.
3. **Progress and growth**: progress screen, topic filters, backup and restore, "New this week" shelf, weekly automatic top-up of ~20 words, final 175 words.

## Run locally

```bash
node tools/serve.mjs 5180
```

Then open http://localhost:5180.
