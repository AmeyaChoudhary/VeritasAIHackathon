"""Placeholder narration: one edge-tts clip per script section, joined with short gaps.
Writes public/voice/voice.wav and src/timing.json (sections + word times in seconds).

The voice is a stand-in until the team records their own (see tools/ingest_audio.py).
Usage: python3 tools/tts_placeholder.py        (needs `pip install edge-tts` and ffmpeg)
       VOICE=en-US-AndrewNeural RATE=+10% python3 tools/tts_placeholder.py
"""
import asyncio, json, os, subprocess
import edge_tts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE = os.environ.get("VOICE", "en-US-AvaNeural")
RATE = os.environ.get("RATE", "+29%")
GAP = {"hook": 0.4, "steady": 0.35, "learn": 0.35, "drift": 0.4, "note": 0.45, "private": 0.45,
       "how": 0.4, "proof": 0.45, "close": 1.0}
LEAD = 0.7
script = json.load(open(f"{ROOT}/script/script.json"))
os.makedirs(f"{ROOT}/public/voice/parts", exist_ok=True)


async def one(sec):
    audio, words = bytearray(), []
    for attempt in range(8):
        try:
            c = edge_tts.Communicate(sec["text"], VOICE, rate=RATE, boundary="WordBoundary")
            audio, words = bytearray(), []
            async for ch in c.stream():
                if ch["type"] == "audio":
                    audio += ch["data"]
                elif ch["type"] == "WordBoundary":
                    words.append({"w": ch["text"], "s": ch["offset"] / 1e7, "e": (ch["offset"] + ch["duration"]) / 1e7})
            if audio and words:
                break
        except Exception as e:  # the service drops a request now and then
            print("retry", sec["id"], attempt, e)
            await asyncio.sleep(1.5)
    p = f"{ROOT}/public/voice/parts/{sec['id']}.mp3"
    open(p, "wb").write(audio)
    return p, words


async def main():
    out, t, parts = [], LEAD, []
    for sec in script:
        p, words = await one(sec)
        wav = p.replace(".mp3", ".wav")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", p, "-ar", "48000", "-ac", "1", wav], check=True)
        dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav],
                                   capture_output=True, text=True).stdout)
        out.append({"id": sec["id"], "start": round(t, 3), "end": round(t + dur, 3),
                    "words": [{"w": w["w"], "s": round(t + w["s"], 3), "e": round(t + w["e"], 3)} for w in words]})
        parts.append((wav, t))
        t += dur + GAP.get(sec["id"], 0.5)
    total = t
    inputs, filt = [], []
    for i, (wav, off) in enumerate(parts):
        inputs += ["-i", wav]
        filt.append(f"[{i}:a]adelay={int(off * 1000)}|{int(off * 1000)}[a{i}]")
    filt.append("".join(f"[a{i}]" for i in range(len(parts))) + f"amix=inputs={len(parts)}:normalize=0,apad=whole_dur={total}[out]")
    subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(filt), "-map", "[out]",
                    "-ar", "48000", f"{ROOT}/public/voice/voice.wav"], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{ROOT}/public/voice/voice.wav", "-c:a", "aac", "-b:a", "128k",
                    f"{ROOT}/public/voice/voice.m4a"], check=True)
    json.dump({"source": f"tts:{VOICE}", "duration": round(total, 3), "sections": out},
              open(f"{ROOT}/src/timing.json", "w"), indent=1)
    print("total", round(total, 1), "s")
    for s in out:
        print(f"  {s['id']:8s} {s['start']:6.2f} - {s['end']:6.2f}  ({len(s['words'])} words)")


import sys
asyncio.run(main())
subprocess.run([sys.executable, f"{ROOT}/tools/fix_words.py"], check=True)
