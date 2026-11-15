"""Build app/public/models/music_mood.json: the music mood list the app looks songs up in.

Source: data/spotify_tracks/dataset.csv, the Spotify Tracks Dataset on Hugging Face
(maharshipandya/spotify-tracks-dataset, BSD licence): about 114,000 tracks with Spotify's audio
features. We use one of them, valence, Spotify's 0 to 1 score for how happy a track sounds.
Run scripts/get_data.sh first to download it.

The file has three lookups, each grouped by valence (0.00 to 1.00 in steps of 0.01), so a value
is stored once and the keys are packed into one string per value:

  ids      the last 8 characters of each Spotify track id (the first characters of an id carry
           little information, the last ones are spread evenly)
  titles   a 6-character hash of the normalised "artist|title", for plays that have no track id
           (Last.fm, and the account-data Spotify file)
  artists  a 6-character hash of the normalised artist, with the mean valence of that artist's
           tracks, used last

The normalising and the hash must match app/src/integrations/musicMood.ts. A test there looks up
known tracks in the built file.

Usage: .venv/bin/python -I scripts/build_music_mood.py
"""

import csv
import json
import math
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "spotify_tracks" / "dataset.csv"
OUT = ROOT / "app" / "public" / "models" / "music_mood.json"

ID_CHARS = 8
HASH_CHARS = 6
ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

FEAT_BRACKET = re.compile(r"[(\[]\s*(?:feat|ft|featuring|with)[.\s][^)\]]*[)\]]")
FEAT_TAIL = re.compile(r"\s(?:feat|ft|featuring)[.\s].*$", re.S)
REMASTER_TAIL = re.compile(r"\s-\s.*remaster.*$", re.S)


def norm(s: str) -> str:
    """Lower case, accents dropped, featured artists and "- Remastered" cut, only letters and
    digits kept, single spaces. The same steps as normName() in musicMood.ts."""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.category(c).startswith("M"))
    s = s.lower()
    s = FEAT_BRACKET.sub(" ", s)
    s = FEAT_TAIL.sub("", s)
    s = REMASTER_TAIL.sub("", s)
    s = "".join(c if unicodedata.category(c)[0] in "LN" else " " for c in s)
    return " ".join(s.split())


def name_hash(s: str) -> str:
    """FNV-1a, 32 bits, over the UTF-8 bytes, written as 6 base-62 characters."""
    h = 0x811C9DC5
    for b in s.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    out = []
    for _ in range(HASH_CHARS):
        out.append(ALPHABET[h % 62])
        h //= 62
    return "".join(reversed(out))


def step(v: float) -> int:
    """Valence as a whole number of hundredths, 0 to 100."""
    return max(0, min(100, int(math.floor(v * 100 + 0.5))))


def pack(table: dict[str, float]) -> list[str]:
    groups: list[list[str]] = [[] for _ in range(101)]
    for key, v in table.items():
        groups[step(v)].append(key)
    return ["".join(sorted(g)) for g in groups]


def main() -> int:
    if not SRC.exists():
        print(f"Missing {SRC.relative_to(ROOT)}. Run scripts/get_data.sh first.", file=sys.stderr)
        return 1

    tracks: dict[str, tuple[float, str, str]] = {}
    with SRC.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            tid = (row.get("track_id") or "").strip()
            artists = row.get("artists") or ""
            title = row.get("track_name") or ""
            try:
                v = float(row["valence"])
            except (KeyError, ValueError):
                continue
            if len(tid) != 22 or not artists or not title or not (0 <= v <= 1):
                continue
            # The same track is listed once per genre; its numbers are the same each time.
            tracks.setdefault(tid, (v, artists.split(";")[0], title))

    ids: dict[str, float] = {}
    for tid, (v, _, _) in tracks.items():
        ids[tid[-ID_CHARS:]] = v
    if len(ids) != len(tracks):
        print(f"{len(tracks) - len(ids)} track ids share their last {ID_CHARS} characters", file=sys.stderr)

    by_title: dict[str, list[float]] = defaultdict(list)
    by_artist: dict[str, list[float]] = defaultdict(list)
    for v, artist, title in tracks.values():
        a = norm(artist)
        t = norm(title)
        if not a:
            continue
        by_artist[name_hash(a)].append(v)
        if t:
            by_title[name_hash(f"{a}|{t}")].append(v)

    titles = {k: sum(vs) / len(vs) for k, vs in by_title.items()}
    artists = {k: sum(vs) / len(vs) for k, vs in by_artist.items()}

    out = {
        "version": 1,
        "about": "Valence (Spotify's 0 to 1 score for how happy a track sounds) from the Spotify Tracks Dataset on Hugging Face (maharshipandya/spotify-tracks-dataset, BSD licence). Built by scripts/build_music_mood.py.",
        "idChars": ID_CHARS,
        "hashChars": HASH_CHARS,
        "counts": {"tracks": len(tracks), "ids": len(ids), "titles": len(titles), "artists": len(artists)},
        "ids": pack(ids),
        "titles": pack(titles),
        "artists": pack(artists),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    size = OUT.stat().st_size
    print(f"{OUT.relative_to(ROOT)}: {size / 1e6:.2f} MB, {len(ids)} ids, {len(titles)} titles, {len(artists)} artists")
    return 0


if __name__ == "__main__":
    sys.exit(main())
