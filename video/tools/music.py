#!/usr/bin/env python3
"""A quiet original bed for the Stability video, synthesized from oscillators (no samples, nothing to license).

Reads  src/timing.json         (section starts, total duration)
Writes public/music/score.wav  (48 kHz stereo, narration + 3 s)

Shape: slow pads and a soft two-note pulse. B minor while the problem is on screen, then D major
from the moment Stability appears, and one held chord under the end card. Kept low and mostly below
1 kHz so it sits under a voice. Re-run whenever the narration changes:
    python3 tools/music.py
"""
import json, os, subprocess
import numpy as np
from scipy.io import wavfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = json.load(open(f"{ROOT}/src/timing.json"))
SR, TAIL = 48000, 3.0
total = min(120.0, T["duration"] + TAIL)
N = int(total * SR)
t = np.arange(N) / SR
start = {s["id"]: s["start"] for s in T["sections"]}
dawn = start.get("steady", 12.0) - 0.4          # the key change
close = start.get("close", total - 8.0)

def hz(m):                                       # midi note to frequency
    return 440.0 * 2 ** ((m - 69) / 12)

def env(a, d, n, rel):                           # slow attack, hold, slow release, over n samples
    e = np.ones(n)
    na, nr = max(1, min(n, int(a * SR))), max(1, min(n, int(rel * SR)))
    e[:na] = np.sin(np.linspace(0, np.pi / 2, na)) ** 2
    e[-nr:] *= np.cos(np.linspace(0, np.pi / 2, nr)) ** 2
    return e * d

def pad(notes, at, length, gain=1.0):
    """A soft chord: a few detuned sines per note with a slow shimmer."""
    n = int(length * SR)
    i0 = int(at * SR)
    if i0 >= N:
        return
    n = min(n, N - i0)
    tt = np.arange(n) / SR
    e = env(min(2.4, n / SR / 3), gain, n, min(3.0, n / SR / 2.5))
    for k, m in enumerate(notes):
        f0 = hz(m)
        for det, pan in ((-0.35, 0.3), (0.0, 0.5), (0.4, 0.7)):
            f1 = f0 * 2 ** (det / 1200 * 8)
            sig = np.sin(2 * np.pi * f1 * tt + k) + 0.22 * np.sin(2 * np.pi * 2 * f1 * tt + 1.7 * k)
            sig *= e * (0.55 + 0.45 * np.sin(2 * np.pi * 0.07 * tt + k + det)) / (3.2 * len(notes))
            L[i0:i0 + n] += sig * (1 - pan)
            R[i0:i0 + n] += sig * pan

def pluck(m, at, gain=0.5, pan=0.5):
    """A round, short note with a long soft tail."""
    n = int(2.6 * SR)
    i0 = int(at * SR)
    if i0 >= N:
        return
    n = min(n, N - i0)
    tt = np.arange(n) / SR
    f0 = hz(m)
    sig = (np.sin(2 * np.pi * f0 * tt) + 0.3 * np.sin(2 * np.pi * 2 * f0 * tt) * np.exp(-tt * 6)) * np.exp(-tt * 2.1)
    sig *= np.minimum(1, tt / 0.012) * gain * 0.16
    L[i0:i0 + n] += sig * (1 - pan)
    R[i0:i0 + n] += sig * pan

L, R = np.zeros(N), np.zeros(N)
BAR = 4.8                                         # one chord every 4.8 s (a slow 50 bpm bar)
night = [[47, 54, 59, 62], [43, 50, 59, 62]]      # Bm, G (low, open)
day = [[50, 57, 62, 66], [45, 57, 61, 64], [47, 54, 62, 66], [43, 55, 59, 62]]   # D, A, Bm, G
k, at = 0, 0.0
while at < dawn - 0.5:
    pad(night[k % 2], at, min(BAR + 1.6, dawn - at + 1.2), 0.9)
    at += BAR; k += 1
k, at = 0, dawn
while at < close - 0.5:
    ch = day[k % 4]
    pad(ch, at, min(BAR + 1.6, close - at + 1.2), 1.0)
    for j, step in enumerate((0.0, 1.2, 2.4, 3.6)):   # a soft pulse: fifth and third above the root, alternating sides
        if at + step < close - 0.4:
            pluck(ch[(1, 2, 3, 2)[j]] + 12, at + step, 0.42 if j % 2 == 0 else 0.3, 0.32 if j % 2 == 0 else 0.68)
    at += BAR; k += 1
pad([50, 57, 62, 66, 69], close, total - close, 1.15)   # the last chord, held under the end card
pluck(74, close + 0.2, 0.55, 0.5)

mix = np.stack([L, R], axis=1)
fade_in, fade_out = int(1.2 * SR), int(2.4 * SR)
mix[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
mix[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None] ** 2
mix /= max(1e-9, np.abs(mix).max()) / 0.7
os.makedirs(f"{ROOT}/public/music", exist_ok=True)
raw = f"{ROOT}/public/music/score_raw.wav"
wavfile.write(raw, SR, (mix * 32767).astype(np.int16))
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-af", "lowpass=f=5200,loudnorm=I=-24:TP=-3:LRA=7", "-ar", "48000",
                f"{ROOT}/public/music/score.wav"], check=True)
os.remove(raw)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{ROOT}/public/music/score.wav", "-c:a", "aac", "-b:a", "128k",
                f"{ROOT}/public/music/score.m4a"], check=True)
print(f"music: {total:.1f}s, key change at {dawn:.1f}s, last chord at {close:.1f}s -> public/music/score.wav")
