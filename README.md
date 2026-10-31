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
| Remembered | It appears in fill-the-gap and pick-the-word questions, at most once a day | You get it right three times, then write one good rewrite |
| Applied | You've used it in your own sentence | Check-ups after 1, 3 and 7 days, then monthly |

## A day's session

**Start session** (about 30 minutes with 8 cards) runs three parts in a row:

1. **Learn**: due review cards first, then new cards from the level and topics you picked.
2. **Practise**: up to 12 questions. Check-ups for Applied words come first. Questions alternate between picking the word from four options and typing it into the gap (with the meaning and first letter as a clue). Typing accepts small spelling slips and -ize spellings.
3. **Apply**: up to 4 plain sentences to rewrite with a word. You compare your version with a model answer and mark yourself.

**Quick 5 min** skips new cards and rewrites: just due reviews and practice questions.

## Word bank

Pitched for a native speaker with years in tech: nothing everyday, no mainstream jargon.

- **Vocabulary (half):** GRE / GMAT words. Basic is entry-level GRE (*mitigate*, *acumen*), Intermediate is mid-level (*obsequious*, *equivocate*), Advanced is the hardest (*obloquy*, *contumacious*).
- **Concepts (half):** Tech & AI, Strategy, Politics, Economics and Capital markets, from foundational (Basic) to specialist (Advanced), e.g. *speculative decoding*, *Goodhart's law*, *Salisbury convention*, *Baumol's cost disease*, *contango*.

Each card has the meaning, British IPA, an example (for concepts, a plain-English comparison), a work or in-use example, similar and opposite terms, a gap-fill sentence, and a plain sentence with a model rewrite.

Words live in `data/pack-*.json`, listed in `data/index.json`. The service worker reads that list, so a new pack needs no code change.

## New words every fortnight

- **Queue:** `tools/queue.txt` holds words waiting to be released, in the same pipe-separated format as the pack sources.
- **Release:** every other Monday (even ISO weeks), the GitHub Action in `.github/workflows/top-up.yml` runs `tools/release.py`. It takes the next 20 words, builds `data/pack-NNN.json`, lists it in `data/index.json`, commits and rebuilds the site. Run it by hand from the Actions tab: `check` validates the queue; `release` releases 20 now.
- **Refill:** on the 1st of each month a Claude task on the Mac tops the queue back up to 60, balanced across levels and topics, then runs `python3 tools/release.py --check` and pushes.
- **Just added:** words from packs released in the last 14 days appear on the Today screen, with a button to learn them.

To add words by hand, append lines to `tools/queue.txt`, check them, and release:

```bash
python3 tools/release.py --check
```

```bash
python3 tools/release.py
```

## Backup

Progress is stored on the device. **Progress → Save backup** downloads a JSON file; **Restore** loads one back (for example on a new phone).

## Sprints

1. **Foundation and Learn** (done): installable offline app, Today screen, Learn cards with British pronunciation, four-stage tracking, Words list and search, first 150 words.
2. **Practise and Apply** (done): fill-the-gap, pick-the-word, rewrite with model answer, daily 30-minute session and 5-minute mode, spaced check-ups, +175 words.
3. **Progress and growth** (done): progress screen, topic filters, backup and restore, "Just added" shelf, fortnightly automatic top-up of 20 words, final 175 words.

## Run locally

```bash
node tools/serve.mjs 5180
```

Then open http://localhost:5180.
