"""Release the next batch of words from tools/queue.txt as a new pack.

Usage:
  python3 tools/release.py                 release 20 words now
  python3 tools/release.py --even-weeks    only release in even ISO weeks (for a weekly
                                           schedule that should run every other week)
  python3 tools/release.py --check         validate the queue without releasing anything

Run by .github/workflows/top-up.yml. The monthly Claude task refills the queue and runs
--check before committing.
"""
import datetime
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from build_pack import FIELDS, parse  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")
QUEUE = os.path.join(ROOT, "tools", "queue.txt")
INDEX = os.path.join(ROOT, "data", "index.json")
BATCH = 20


def path(*parts):
    return os.path.join(ROOT, *parts)


def existing_ids():
    ids = set()
    for name in json.load(open(INDEX))["packs"]:
        ids |= {w["id"] for w in json.load(open(path("data", name)))["words"]}
    return ids


def queue_lines():
    header, lines = [], []
    for line in open(QUEUE, encoding="utf-8"):
        (header if line.startswith("#") or not line.strip() else lines).append(line.rstrip("\n"))
    return header, lines


def check():
    """Return (words, problems) for the queue: field errors, duplicates within it or against packs."""
    words, errors = parse(QUEUE, "")
    taken = existing_ids()
    seen = set()
    for w in words:
        if w["id"] in taken:
            errors.append(f"already in a pack: {w['word']}")
        if w["id"] in seen:
            errors.append(f"twice in the queue: {w['word']}")
        seen.add(w["id"])
    return words, errors


def main():
    args = sys.argv[1:]
    words, errors = check()
    if "--check" in args:
        counts = {}
        for w in words:
            counts[w["level"]] = counts.get(w["level"], 0) + 1
        print(f"{len(words)} words in the queue: " + ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))
        sys.exit("\n".join(errors) if errors else 0)
    if errors:
        sys.exit("Queue has problems; fix them first:\n" + "\n".join(errors))

    today = datetime.date.today()
    if "--even-weeks" in args and today.isocalendar()[1] % 2:
        print(f"Week {today.isocalendar()[1]} is odd; nothing to release this week.")
        return
    header, lines = queue_lines()
    if not lines:
        print("Queue is empty; nothing to release.")
        return

    index = json.load(open(INDEX))
    nums = [int(m.group(1)) for f in index["packs"] if (m := re.match(r"pack-(\d+)\.json", f))]
    n = max(nums, default=0) + 1
    batch, rest = lines[:BATCH], lines[BATCH:]

    src = path("tools", f"words-pack-{n:03d}.txt")
    with open(src, "w", encoding="utf-8") as f:
        f.write("# " + "|".join(FIELDS) + "\n" + "\n".join(batch) + "\n")
    pack, errs = parse(src, today.isoformat())
    if errs:
        sys.exit("\n".join(errs))
    out = f"pack-{n:03d}.json"
    with open(path("data", out), "w", encoding="utf-8") as f:
        json.dump({"added": today.isoformat(), "words": pack}, f, ensure_ascii=False, indent=1)

    index["packs"].append(out)
    with open(INDEX, "w") as f:
        json.dump(index, f)
    with open(QUEUE, "w", encoding="utf-8") as f:
        f.write("\n".join(header + rest) + "\n")
    print(f"Released {len(pack)} words as {out}; {len(rest)} left in the queue.")
    print(", ".join(w["word"] for w in pack))


if __name__ == "__main__":
    main()
