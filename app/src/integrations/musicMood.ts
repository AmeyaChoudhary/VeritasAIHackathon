// Music mood: how happy the songs sound, from Spotify's "valence" score (0 to 1) in a public list
// of about 114,000 tracks (the Spotify Tracks Dataset on Hugging Face, BSD licence), packed into
// public/models/music_mood.json by scripts/build_music_mood.py.
//
// A play is looked up by its Spotify track id first, then by its normalised "artist|title", then
// by the artist's mean valence. The weekly music mood is the mean valence of the plays found, and
// the screen says how many were found.
//
// It is shown to the teen on the Connect screen only. It never reaches the rules or a parent's
// note: there is no data here that links a week's music mood to how a teen answers the questions.
//
// The file is fetched only when a music source is connected. normName() and nameHash() must
// match norm() and name_hash() in scripts/build_music_mood.py.

export interface MoodTable {
  ids: Map<string, number>;
  titles: Map<string, number>;
  artists: Map<string, number>;
  idChars: number;
}

export interface MoodFile {
  version: number;
  idChars: number;
  hashChars: number;
  ids: string[];
  titles: string[];
  artists: string[];
}

export type MoodHit = "id" | "title" | "artist";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function unpack(groups: string[], width: number): Map<string, number> {
  const m = new Map<string, number>();
  groups.forEach((g, i) => {
    for (let k = 0; k + width <= g.length; k += width) m.set(g.slice(k, k + width), i / 100);
  });
  return m;
}

export function moodTableFromJson(j: MoodFile): MoodTable {
  // A width of 0 would never move the unpacking loop forward, so the widths are checked too.
  const width = (n: unknown) => Number.isInteger(n) && (n as number) > 0;
  const groups = (g: unknown) => Array.isArray(g) && g.every((s) => typeof s === "string");
  if (j?.version !== 1 || !width(j.idChars) || !width(j.hashChars) || !groups(j.ids) || !groups(j.titles) || !groups(j.artists))
    throw new Error("Not a music mood file.");
  return { ids: unpack(j.ids, j.idChars), titles: unpack(j.titles, j.hashChars), artists: unpack(j.artists, j.hashChars), idChars: j.idChars };
}

/** Lower case, accents dropped, featured artists and "- Remastered" cut, only letters and
 *  digits kept, single spaces. */
export function normName(s: string): string {
  let t = s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  t = t.replace(/[(\[]\s*(?:feat|ft|featuring|with)[.\s][^)\]]*[)\]]/g, " ");
  t = t.replace(/\s(?:feat|ft|featuring)[.\s].*$/s, "");
  t = t.replace(/\s-\s.*remaster.*$/s, "");
  t = t.replace(/[^\p{L}\p{N}]/gu, " ");
  return t.split(/\s+/).filter(Boolean).join(" ");
}

/** FNV-1a, 32 bits, over the UTF-8 bytes, as 6 base-62 characters. */
export function nameHash(s: string): string {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(s)) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let out = "";
  for (let i = 0; i < 6; i++) {
    out = ALPHABET[h % 62] + out;
    h = Math.floor(h / 62);
  }
  return out;
}

/** The 22-character id from "spotify:track:<id>", an open.spotify.com link, or the id itself. */
export function trackId(v: string | null | undefined): string | null {
  const m = /^(?:spotify:track:|https?:\/\/open\.spotify\.com\/track\/)?([0-9A-Za-z]{22})(?:\?.*)?$/.exec((v ?? "").trim());
  return m ? m[1] : null;
}

/** One song's valence: by track id, then "artist|title", then the artist's mean. */
export function moodOf(t: MoodTable, q: { id?: string | null; artist?: string | null; title?: string | null }): { valence: number; by: MoodHit } | null {
  const id = trackId(q.id);
  if (id) {
    const v = t.ids.get(id.slice(-t.idChars));
    if (v != null) return { valence: v, by: "id" };
  }
  // The first credited artist, as the song list has it.
  const a = normName((q.artist ?? "").split(";")[0]);
  if (!a) return null;
  const ti = normName(q.title ?? "");
  if (ti) {
    const v = t.titles.get(nameHash(`${a}|${ti}`));
    if (v != null) return { valence: v, by: "title" };
  }
  const v = t.artists.get(nameHash(a));
  return v != null ? { valence: v, by: "artist" } : null;
}

/** A play's in-memory key, as the Spotify and Last.fm readers make it: "spotify:track:<id>", or
 *  artist and title joined by a NUL character. */
export function moodOfKey(t: MoodTable, key: string): { valence: number; by: MoodHit } | null {
  if (key.startsWith("spotify:track:")) return moodOf(t, { id: key });
  const i = key.indexOf("\u0000");
  if (i < 0) return null;
  return moodOf(t, { artist: key.slice(0, i), title: key.slice(i + 1) });
}

export interface MoodSummary {
  /** Mean valence of the plays found, 2 decimals, or null when none were found. */
  mood: number | null;
  /** Plays found in the song list. */
  matched: number;
  plays: number;
  by: Record<MoodHit, number>;
}

export function summarizeMood(found: ({ valence: number; by: MoodHit } | null | undefined)[]): MoodSummary {
  const by: Record<MoodHit, number> = { id: 0, title: 0, artist: 0 };
  let sum = 0;
  let n = 0;
  for (const f of found) {
    if (!f) continue;
    by[f.by]++;
    sum += f.valence;
    n++;
  }
  return { mood: n ? Math.round((sum / n) * 100) / 100 : null, matched: n, plays: found.length, by };
}

let loading: Promise<MoodTable | null> | null = null;

/** Fetch the song list once, when a music source is connected. Null if it can't be loaded; the
 *  music numbers still work without it. */
export function loadMusicMood(url = "./models/music_mood.json"): Promise<MoodTable | null> {
  if (!loading) {
    loading = fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => moodTableFromJson(j as MoodFile))
      .catch(() => {
        loading = null;
        return null;
      });
  }
  return loading;
}
