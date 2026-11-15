// The live Spotify read, after sign-in (spotifyAuth.ts). Two kinds of answer:
//
//   GET /v1/me/player/recently-played?limit=50   the last 50 plays, each with played_at. Spotify
//                                                gives no more than these 50.
//   GET /v1/me/top/tracks?time_range=short_term   top songs of about the last 4 weeks
//   GET /v1/me/top/tracks?time_range=medium_term  top songs of about the last 6 months
//
// Recent plays become the same weekly numbers as the data file: plays, how many between midnight
// and 5 a.m. (the music signal), and repeats, plus the music mood. Spotify gives no listening
// time or skips here. The weeks run from the oldest of the 50 plays to now, so a week is complete
// only when all of it lies inside that span. Top songs have no times, so they only give a music
// mood for each span, shown to the teen. Song names and ids are used for repeats and the music
// mood lookup, then dropped.

import { CONFIG, type Config } from "../engine/config";
import { HttpError, localTime, type Getter, type TimeFns } from "./common";
import { moodOf, summarizeMood, type MoodHit, type MoodSummary, type MoodTable } from "./musicMood";
import { spotifyWeeks, type MoodPlay } from "./spotify";
import type { AggWeek } from "./agg";

const API = "https://api.spotify.com/v1";
export const RECENT_URL = `${API}/me/player/recently-played?limit=50`;
export const topUrl = (range: "short_term" | "medium_term") => `${API}/me/top/tracks?time_range=${range}&limit=50`;

interface ApiTrack {
  id?: string | null;
  name?: string;
  type?: string;
  duration_ms?: number;
  is_local?: boolean;
  artists?: { name?: string }[];
}
interface RecentPage {
  items?: { track?: ApiTrack | null; played_at?: string }[];
}
interface TopPage {
  items?: ApiTrack[];
}

export interface Song {
  id: string | null;
  artist: string;
  title: string;
}

const songOf = (t: ApiTrack): Song => ({ id: typeof t.id === "string" && t.id ? t.id : null, artist: t.artists?.[0]?.name ?? "", title: t.name ?? "" });
const isSong = (t: ApiTrack | null | undefined): t is ApiTrack => !!t && (t.type == null || t.type === "track") && !!(t.id || t.name);

/** Recent plays: time, length and the song. Episodes and empty items are skipped. */
export function recentPlays(page: RecentPage): { at: number; ms: number; song: Song }[] {
  const out: { at: number; ms: number; song: Song }[] = [];
  for (const it of page?.items ?? []) {
    const at = Date.parse(it?.played_at ?? "");
    if (!Number.isFinite(at) || !isSong(it.track)) continue;
    out.push({ at, ms: typeof it.track.duration_ms === "number" ? it.track.duration_ms : 0, song: songOf(it.track) });
  }
  return out;
}

export function topSongs(page: TopPage): Song[] {
  return (page?.items ?? []).filter(isSong).map(songOf);
}

/** The key a play is counted by for repeats: the track id, or artist and title. In memory only. */
const keyOf = (s: Song) => (s.id ? `spotify:track:${s.id}` : `${s.artist}\u0000${s.title}`.toLowerCase());

export interface SpotifyLiveResult {
  weeks: AggWeek[];
  plays: number;
  /** When the oldest of the recent plays was, or null with no plays. */
  since: number | null;
  moodMatched?: number;
  moodBy?: Record<MoodHit, number>;
  topShort: MoodSummary | null;
  topMedium: MoodSummary | null;
  layout: string;
  notes: string[];
}

/** Weeks from recent plays, from the oldest play to now. */
export function liveWeeks(
  plays: { at: number; ms: number; song: Song }[],
  now: number,
  opts: { mood?: MoodTable | null; time?: TimeFns; cfg?: Config } = {},
): { weeks: AggWeek[]; mood: MoodSummary | null } {
  const inRange = plays.filter((p) => p.at <= now);
  if (!inRange.length) return { weeks: [], mood: null };
  const mood = opts.mood ?? null;
  const ps: MoodPlay[] = inRange.map((p) => ({ at: p.at, ms: p.ms, skipped: false, key: keyOf(p.song), mood: mood ? moodOf(mood, p.song) : undefined }));
  const from = Math.min(...ps.map((p) => p.at));
  const weeks = spotifyWeeks(ps, { from, to: now }, opts.time ?? localTime, opts.cfg ?? CONFIG, { mood: !!mood, timed: false });
  return { weeks, mood: mood ? summarizeMood(ps.map((p) => p.mood)) : null };
}

/** A Getter for Spotify's API that says plainly why a call was refused. */
export function spotifyGetter(token: string, fetchImpl: typeof fetch = fetch): Getter {
  return async (url) => {
    let r: Response;
    try {
      r = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      throw new Error("Can't reach Spotify right now.");
    }
    if (r.status === 403)
      throw new HttpError(403, "Spotify refused. While this app is in Spotify's development mode, only accounts its owner has added in the Spotify dashboard can use it.");
    if (r.status === 401) throw new HttpError(401, "Spotify's sign-in ran out. Try connecting again.");
    if (r.status === 429) throw new HttpError(429, "Spotify asked us to slow down. Try again in a minute.");
    if (!r.ok) throw new HttpError(r.status, `Spotify answered ${r.status}.`);
    return r.json();
  };
}

export async function readSpotifyLive(get: Getter, opts: { now: number; time?: TimeFns; cfg?: Config; mood?: MoodTable | null }): Promise<SpotifyLiveResult> {
  const recent = recentPlays((await get(RECENT_URL)) as RecentPage);
  const short = topSongs((await get(topUrl("short_term"))) as TopPage);
  const medium = topSongs((await get(topUrl("medium_term"))) as TopPage);
  if (!recent.length && !short.length && !medium.length) throw new Error("Spotify shows no songs on this account yet. Nothing was saved.");
  const mood = opts.mood ?? null;
  const { weeks, mood: m } = liveWeeks(recent, opts.now, { mood, time: opts.time, cfg: opts.cfg });
  const top = (songs: Song[]) => (mood && songs.length ? summarizeMood(songs.map((s) => moodOf(mood, s))) : null);
  const since = recent.length ? Math.min(...recent.map((p) => p.at)) : null;
  const notes = ["Spotify gives only your last 50 plays, so weeks before them are not read, and a week they only partly cover is marked part of the week."];
  return {
    weeks,
    plays: recent.filter((p) => p.at <= opts.now).length,
    since,
    ...(m ? { moodMatched: m.matched, moodBy: m.by } : {}),
    topShort: top(short),
    topMedium: top(medium),
    layout: "Spotify sign-in",
    notes,
  };
}
