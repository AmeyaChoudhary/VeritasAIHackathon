// Read the student's own files in the browser. Nothing is uploaded.
// Spotify: StreamingHistory*.json (endTime, msPlayed) or the extended history (ts, ms_played).
// Only song plays of 30 seconds or more count; titles are never kept.
// Sleep and steps: a CSV with the header date,sleep_hours,steps.

export interface ImportedWeek {
  /** Monday of the week, YYYY-MM-DD (local time). */
  weekOf: string;
  days: number;
}

export interface MusicWeek extends ImportedWeek {
  hours: number;
  /** Share of listening between midnight and 5 am. */
  afterMidnight: number;
}

export interface BodyWeek extends ImportedWeek {
  sleep: number | null;
  steps: number | null;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Monday of the week that holds this local date. */
export function mondayOf(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - dow);
  return ymd(x);
}

/** One song play from a Spotify data file. key identifies the song only so repeats can be
 *  counted; it lives in memory while a file is read and is never stored. */
export interface SpotifyPlay {
  at: number;
  ms: number;
  skipped: boolean;
  key: string;
}

/** A play counts as listening from 30 seconds on, the same line Spotify uses for a stream. */
export const MIN_PLAY_MS = 30_000;

/** Spotify gives UTC in both formats: endTime "2024-01-05 23:41" (account data) and ts
 *  "2024-01-05T23:41:07Z" (extended history). Returns ms, or NaN. */
export function spotifyTime(v: unknown): number {
  if (typeof v !== "string" || !v) return NaN;
  const s = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v) ? `${v.replace(" ", "T")}:00Z` : v;
  return Date.parse(s);
}

const text = (v: unknown) => (typeof v === "string" ? v : "");

/** Song plays from one Spotify file, in either format. Podcasts, audiobooks and videos are left
 *  out, and so are plays under 30 seconds. Song titles are used only for the in-memory key.
 *  Account data: StreamingHistory_music_N.json (older: StreamingHistoryN.json), entries with
 *  endTime, msPlayed, artistName, trackName. Extended history: Streaming_History_Audio_*.json
 *  (older: endsong_N.json), entries with ts, ms_played, master_metadata_track_name,
 *  spotify_track_uri, skipped, reason_end, and episode_name or audiobook_title for spoken audio. */
export function spotifyPlays(data: unknown, path = ""): { plays: SpotifyPlay[]; short: number; other: number } {
  if (!Array.isArray(data)) throw new Error("Expected a list of plays, as in StreamingHistory_music_0.json.");
  if (/podcast|video/i.test(path.split("/").pop() ?? "")) return { plays: [], short: 0, other: data.length };
  const plays: SpotifyPlay[] = [];
  let short = 0;
  let other = 0;
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const spoken =
      !!o.episode_name || !!o.audiobook_title || !!o.podcastName || !!o.episodeName ||
      ("master_metadata_track_name" in o && o.master_metadata_track_name == null && !o.spotify_track_uri);
    if (spoken) {
      other++;
      continue;
    }
    const at = spotifyTime(o.ts ?? o.endTime);
    const msRaw = o.ms_played ?? o.msPlayed;
    const ms = typeof msRaw === "number" ? msRaw : Number(msRaw);
    if (!Number.isFinite(at) || !Number.isFinite(ms) || ms <= 0) continue;
    if (ms < MIN_PLAY_MS) {
      short++;
      continue;
    }
    const key = text(o.spotify_track_uri) || `${text(o.master_metadata_album_artist_name ?? o.artistName)}\u0000${text(o.master_metadata_track_name ?? o.trackName)}`.toLowerCase();
    plays.push({ at, ms, skipped: o.skipped === true, key });
  }
  return { plays, short, other };
}

/** A quick look at one Spotify file (the Import screen). Weeks in the phone's own time. */
export function parseSpotify(text: string): { weeks: MusicWeek[]; plays: number } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file is not JSON. Spotify sends StreamingHistory files as .json.");
  }
  const { plays } = spotifyPlays(data);
  const byWeek = new Map<string, { ms: number; late: number; days: Set<string> }>();
  for (const p of plays) {
    const d = new Date(p.at);
    const key = mondayOf(d);
    const w = byWeek.get(key) ?? { ms: 0, late: 0, days: new Set<string>() };
    w.ms += p.ms;
    if (d.getHours() < 5) w.late += p.ms;
    w.days.add(ymd(d));
    byWeek.set(key, w);
  }
  if (!plays.length) throw new Error("No song plays of 30 seconds or more. Each entry needs ts or endTime, and ms_played or msPlayed.");
  const weeks = [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekOf, w]) => ({ weekOf, days: w.days.size, hours: w.ms / 3.6e6, afterMidnight: w.ms ? w.late / w.ms : 0 }));
  return { weeks, plays: plays.length };
}

export const CSV_TEMPLATE = `date,sleep_hours,steps
2026-10-05,7.5,8200
2026-10-06,7.2,9100
2026-10-07,6.9,7600
`;

export function parseBodyCsv(text: string): { weeks: BodyWeek[]; rows: number } {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) throw new Error("The file is empty.");
  const head = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const iDate = head.indexOf("date");
  const iSleep = head.indexOf("sleep_hours");
  const iSteps = head.indexOf("steps");
  if (iDate < 0 || (iSleep < 0 && iSteps < 0)) throw new Error("The first line should be: date,sleep_hours,steps");
  const byWeek = new Map<string, { sleep: number[]; steps: number[]; days: Set<string> }>();
  let rows = 0;
  for (const line of lines.slice(1)) {
    const cells = line.split(",").map((c) => c.trim());
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cells[iDate] ?? "");
    if (!m) continue;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const sleep = iSleep >= 0 ? Number(cells[iSleep]) : NaN;
    const steps = iSteps >= 0 ? Number(cells[iSteps]) : NaN;
    const okSleep = Number.isFinite(sleep) && sleep > 0 && sleep < 24;
    const okSteps = Number.isFinite(steps) && steps >= 0;
    if (!okSleep && !okSteps) continue;
    rows++;
    const key = mondayOf(d);
    const w = byWeek.get(key) ?? { sleep: [], steps: [], days: new Set<string>() };
    if (okSleep) w.sleep.push(sleep);
    if (okSteps) w.steps.push(steps);
    w.days.add(ymd(d));
    byWeek.set(key, w);
  }
  if (!rows) throw new Error("No usable rows. Dates should look like 2026-10-05.");
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const weeks = [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekOf, w]) => ({ weekOf, days: w.days.size, sleep: mean(w.sleep), steps: mean(w.steps) }));
  return { weeks, rows };
}
