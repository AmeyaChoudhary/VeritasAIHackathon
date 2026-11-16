"""Your own voice in place of the placeholder.

usage: python3 tools/ingest_audio.py takes/<recording>      (m4a, wav, mp3, mov...)

1. Transcribes the recording on this computer with word times (Whisper).
2. Finds the LAST clean take of every card in script/script.json, so a fluffed line can simply be said again.
3. Joins the takes, cleans and levels the sound, and tightens pauses (then speeds up by at most 6%) if it runs past 1:57.
4. Writes public/voice/voice.wav and src/timing.json. Every animation is cued from that file, so the
   pictures re-time themselves. Render again with: npx remotion render src/index.ts Main out/steady-demo.mp4

Needs ffmpeg and either `pip install openai-whisper` or `pip install faster-whisper`.
"""
import difflib, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = f"{ROOT}/takes/_work"
LIMIT = 120.0 - 3.0          # two minutes, less the end card
LEAD = 0.55       # Whisper often marks a first word late; start this much earlier (never before the previous word ends)
SPEED = 1.10      # default speed-up for cards not listed in CARD_SPEED
CARD_SPEED = {"hook": 1.17, "learn": 1.17, "note": 1.17, "how": 1.17, "close": 1.12,
              "steady": 1.04, "drift": 1.04, "private": 1.04, "proof": 1.04}
MAX_SPEED = 1.15
PAUSE = {"hook": 0.55, "steady": 0.45, "learn": 0.4, "drift": 0.45, "note": 0.5, "private": 0.55,
         "proof": 0.4, "timing": 0.5, "next": 0.55, "close": 0.4}
n = lambda w: re.sub(r"[^a-z0-9]", "", w.lower())


def run(*a):
    subprocess.run(a, check=True)


def transcribe(src):
    os.makedirs(WORK, exist_ok=True)
    cache = f"{WORK}/{os.path.basename(src)}.words.json"
    if os.path.exists(cache) and os.path.getmtime(cache) > os.path.getmtime(src):
        return json.load(open(cache))
    wav = f"{WORK}/{os.path.basename(src)}.16k.wav"
    run("ffmpeg", "-v", "error", "-y", "-i", src, "-ar", "16000", "-ac", "1", wav)
    prompt = "Stability, Maya, PHQ, check-in, self-harm, clinician, Dartmouth."
    words = []
    try:
        from faster_whisper import WhisperModel
        model = WhisperModel("small.en", device="cpu", compute_type="int8")
        segs, _ = model.transcribe(wav, word_timestamps=True, beam_size=5, initial_prompt=prompt)
        for s in segs:
            words += [{"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3)} for w in s.words]
    except ImportError:
        import whisper
        cached = os.path.exists(os.path.expanduser("~/.cache/whisper/large-v3-turbo.pt"))
        model = whisper.load_model("turbo" if cached else "small.en")
        res = model.transcribe(wav, word_timestamps=True, initial_prompt=prompt, fp16=False)
        for s in res["segments"]:
            words += [{"w": w["word"].strip(), "s": round(w["start"], 3), "e": round(w["end"], 3)} for w in s.get("words", [])]
    json.dump(words, open(cache, "w"))
    return words


def main():
    src = os.path.abspath(sys.argv[1])
    words = transcribe(src)
    tn = [n(w["w"]) for w in words]
    script = json.load(open(f"{ROOT}/script/script.json"))
    picks = []
    for sec in script:
        toks = [n(t) for t in sec["text"].split() if n(t)]
        L, cands = len(toks), []
        for i in range(len(words)):
            if tn[i] not in toks[:4]:
                continue
            win = tn[i:i + int(L * 1.3) + 3]
            blocks = [b for b in difflib.SequenceMatcher(None, toks, win, autojunk=False).get_matching_blocks() if b.size]
            if not blocks:
                continue
            cover = sum(b.size for b in blocks) / L
            if cover < 0.55:
                continue
            first, last = i + blocks[0].b, i + blocks[-1].b + blocks[-1].size - 1
            whole = blocks[-1].a + blocks[-1].size >= L - 2 and blocks[0].a <= 2
            cands.append((cover, whole, first, last))
        if not cands:
            sys.exit(f"!! no take found for card '{sec['label']}' ({sec['id']}). Say that card again and re-run.")
        top = max(c[0] for c in cands)
        good = [c for c in cands if c[1] and c[0] >= top - 0.07] or [c for c in cands if c[0] >= top - 0.07]
        cover, _, first, last = max(good, key=lambda c: c[2])   # the latest good take
        picks.append((sec["id"], first, last))
        print(f"{sec['id']:8s} take at {int(words[first]['s'] // 60)}:{words[first]['s'] % 60:05.2f}  match {cover:.0%}")

    MAXGAP = 0.55   # a pause longer than this inside a card (a stumble, a breath) is cut down
    KEEP = 0.28

    def build(scale, k=1.0):
        """parts: (start, end, speed) in the source; timing in output seconds after per-card speed-up."""
        parts, timing, t = [], [], 0.6
        for sid, first, last in picks:
            sp = CARD_SPEED.get(sid, SPEED) * k
            runs, r0 = [], first
            for q in range(first + 1, last + 1):
                if words[q]["s"] - words[q - 1]["e"] > MAXGAP:
                    runs.append((r0, q - 1)); r0 = q
            runs.append((r0, last))
            sw = []
            for j, (a0, a1) in enumerate(runs):
                w0, w1 = words[a0], words[a1]
                prv = words[a0 - 1]["e"] if a0 > 0 else 0
                s0 = max(prv + 0.04, w0["s"] - (LEAD if j == 0 else 0.35))
                if j < len(runs) - 1:
                    e0 = min(words[a1 + 1]["s"] - 0.04, w1["e"] + KEEP)
                else:
                    nxt = words[last + 1]["s"] if last + 1 < len(words) else w1["e"] + 2
                    tail = max(0.25, min(PAUSE.get(sid, 0.45) * scale + 0.25, nxt - w1["e"] - 0.06))
                    e0 = w1["e"] + tail
                parts.append((s0, e0, sp))
                sw += [{"w": w["w"], "s": round(t + (w["s"] - s0) / sp, 3), "e": round(t + (w["e"] - s0) / sp, 3)} for w in words[a0:a1 + 1]]
                t += (e0 - s0) / sp
            timing.append({"id": sid, "start": sw[0]["s"], "end": sw[-1]["e"], "words": sw})
        return parts, timing, t

    parts, timing, total = build(1.0)
    if total > LIMIT:
        parts, timing, total = build(0.45)
    k = 1.0
    if total > LIMIT:
        k = min(1.06, total / LIMIT)
        parts, timing, total = build(0.45, k)
        print(f"extra speed-up x{k:.3f} on every card" + ("  !! STILL OVER TWO MINUTES" if total > LIMIT else ""))
    print("card speeds:", {sid: round(CARD_SPEED.get(sid, SPEED) * k, 3) for sid, _, _ in picks})

    inputs, filt = [], []
    for i, (s0, e0, sp) in enumerate(parts):
        inputs += ["-ss", f"{s0:.3f}", "-to", f"{e0:.3f}", "-i", src]
        filt.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=mono,atempo={sp:.4f},afade=t=in:d=0.015,afade=t=out:st={max(0, (e0 - s0) / sp - 0.04):.3f}:d=0.04[a{i}]")
    filt.append("".join(f"[a{i}]" for i in range(len(parts))) + f"concat=n={len(parts)}:v=0:a=1[j]")
    chain = ("adelay=600,highpass=f=75,afftdn=nf=-30,equalizer=f=180:t=q:w=1:g=1.5,equalizer=f=6500:t=q:w=1.2:g=-2,"
             "acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120,loudnorm=I=-16:TP=-1.5:LRA=9")
    filt.append(f"[j]{chain}[out]")
    os.makedirs(f"{ROOT}/public/voice", exist_ok=True)
    run("ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(filt), "-map", "[out]", "-ar", "48000", "-ac", "1", f"{ROOT}/public/voice/voice.wav")
    run("ffmpeg", "-v", "error", "-y", "-i", f"{ROOT}/public/voice/voice.wav", "-c:a", "aac", "-b:a", "128k", f"{ROOT}/public/voice/voice.m4a")
    json.dump({"source": f"voice:{os.path.basename(src)}", "duration": round(total, 3), "sections": timing},
              open(f"{ROOT}/src/timing.json", "w"), indent=1)
    print(f"narration {total:.1f}s -> public/voice/voice.wav, src/timing.json")
    run(sys.executable, f"{ROOT}/tools/fix_words.py")
    if os.path.exists(f"{ROOT}/tools/music.py"):
        run(sys.executable, f"{ROOT}/tools/music.py")


if __name__ == "__main__":
    main()
