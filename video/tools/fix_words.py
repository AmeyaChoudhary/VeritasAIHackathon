"""Give the timed words in src/timing.json the script's own spelling and punctuation.

The voice tools return bare or misheard words, and the captions and cues work from the
script. This lines each section's script text up with its timed words and writes the
script's tokens back with times carried across; tokens that did not line up get
interpolated times.
Usage: python3 tools/fix_words.py   (tts_placeholder.py and ingest_audio.py run it for you)
"""
import difflib, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
n = lambda w: re.sub(r"[^a-z0-9]", "", w.lower())
S = {s["id"]: s for s in json.load(open(f"{ROOT}/script/script.json"))}
T = json.load(open(f"{ROOT}/src/timing.json"))

for sec in T["sections"]:
    raw = sec.get("raw") or sec["words"]
    sec["raw"] = raw
    toks = S[sec["id"]]["text"].split()
    a = [n(t) for t in toks]
    b = [n(w["w"]) for w in raw]
    times = [None] * len(toks)
    for blk in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        for k in range(blk.size):
            times[blk.a + k] = (raw[blk.b + k]["s"], raw[blk.b + k]["e"])
    for i, t in enumerate(times):
        if t is None:
            pj = next((j for j in range(i - 1, -1, -1) if times[j]), -1)
            nj = next((j for j in range(i + 1, len(times)) if times[j]), len(times))
            prev = times[pj] if pj >= 0 else (sec["start"], sec["start"])
            nxt = times[nj] if nj < len(times) else (sec["end"], sec["end"])
            gap_n, pos, span = nj - pj - 1, i - pj, nxt[0] - prev[1]
            times[i] = (round(prev[1] + span * (pos - 1) / max(1, gap_n), 3), round(prev[1] + span * pos / max(1, gap_n), 3))
    sec["words"] = [{"w": tok, "s": t[0], "e": t[1]} for tok, t in zip(toks, times)]
    miss = sum(1 for x in a if x not in b)
    print(f"  {sec['id']:8s} {len(toks)} words, {miss} not matched exactly")
json.dump(T, open(f"{ROOT}/src/timing.json", "w"), indent=1)
