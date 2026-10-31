"""Turn a pipe-separated word list into a JSON pack the app can load.

Usage: python3 tools/build_pack.py tools/words-pack-001.txt data/pack-001.json 2026-10-31
Then add the pack's file name to data/index.json.
"""
import json
import re
import sys

LEVELS = {"b": "basic", "i": "intermediate", "a": "advanced"}
TAGS = {"gen": "general", "exam": "exam", "exec": "exec", "tech": "tech"}
FIELDS = ["word", "pos", "ipa", "level", "tag", "meaning", "everyday", "work",
          "synonyms", "antonyms", "gap", "answer", "plain", "model"]


def slug(word):
    return re.sub(r"[^a-z0-9]+", "-", word.lower()).strip("-")


def parse(path, added):
    words, errors = [], []
    for n, line in enumerate(open(path, encoding="utf-8"), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("|")
        if len(parts) != len(FIELDS):
            errors.append(f"line {n}: {len(parts)} fields, expected {len(FIELDS)}")
            continue
        w = dict(zip(FIELDS, parts))
        w["id"] = slug(w["word"])
        w["level"] = LEVELS.get(w["level"]) or errors.append(f"line {n}: bad level") or ""
        w["tag"] = TAGS.get(w["tag"]) or errors.append(f"line {n}: bad tag") or ""
        w["synonyms"] = [s.strip() for s in w["synonyms"].split(",") if s.strip()]
        w["antonyms"] = [s.strip() for s in w["antonyms"].split(",") if s.strip()]
        if "___" not in w["gap"]:
            errors.append(f"line {n}: gap sentence has no ___")
        w["added"] = added
        words.append(w)
    return words, errors


def main():
    src, out, added = sys.argv[1], sys.argv[2], sys.argv[3]
    words, errors = parse(src, added)
    ids = [w["id"] for w in words]
    errors += [f"duplicate id: {i}" for i in sorted({i for i in ids if ids.count(i) > 1})]
    if errors:
        sys.exit("\n".join(errors))
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"added": added, "words": words}, f, ensure_ascii=False, indent=1)
    by = {}
    for w in words:
        by[(w["level"], w["tag"])] = by.get((w["level"], w["tag"]), 0) + 1
    print(f"{len(words)} words -> {out}")
    for k in sorted(by):
        print(f"  {k[0]:<13} {k[1]:<8} {by[k]}")


if __name__ == "__main__":
    main()
