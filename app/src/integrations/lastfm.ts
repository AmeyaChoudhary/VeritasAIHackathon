// Last.fm, read with an API key and the teen's Last.fm username. Read-only, no sign-in.
// Spotify's developer policy does not allow building user metrics from listening, so Stability
// reads plays that the teen's Spotify sends to Last.fm. Music data from Last.fm.

import { CONFIG, DAY, type Config } from "../engine/config";
import { isLateNight, localTime, weeksBetween, type Getter, type TimeFns } from "./common";

const BASE = "https://ws.audioscrobbler.com/2.0/";

interface Track {
  name?: string;
  artist?: { "#text"?: string; name?: string };
  date?: { uts?: string };
  "@attr"?: { nowplaying?: string };
}
interface RecentTracks {
  recenttracks?: { track?: Track | Track[]; "@attr"?: { page?: string; totalPages?: string } };
  error?: number;
  message?: string;
}

export interface Play {
  at: number;
  key: string;
}

export interface LastfmWeek {
  weekOf: string;
  /** False when the week was only partly read (window edge, or the page cap). */
  complete: boolean;
  plays: number;
  late_share: number | null;
  /** 1 - unique tracks / plays. Higher means the same songs again and again. */
  repetition: number | null;
}

export interface LastfmResult {
  weeks: LastfmWeek[];
  plays: number;
  /** True when the page cap stopped the read before the oldest plays. */
  truncated: boolean;
}

/** Plays on one page. The track playing now has no date and is skipped. A page with one
 *  track has an object where a list would be. */
export function playsOf(page: RecentTracks): Play[] {
  const raw = page.recenttracks?.track;
  const list = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
  const out: Play[] = [];
  for (const t of list) {
    if (t["@attr"]?.nowplaying === "true") continue;
    const uts = Number(t.date?.uts);
    if (!Number.isFinite(uts) || uts <= 0) continue;
    const artist = (t.artist?.["#text"] ?? t.artist?.name ?? "").toLowerCase();
    out.push({ at: uts * 1000, key: `${artist}\u0000${(t.name ?? "").toLowerCase()}` });
  }
  return out;
}

/** Weekly numbers for every week from range.from to range.to, each marked complete or not. */
export function aggregateLastfm(
  plays: Play[],
  range: { from: number; to: number },
  time: TimeFns = localTime,
  cfg: Config = CONFIG,
): LastfmWeek[] {
  return weeksBetween(range.from, range.to, time).map(({ weekOf, complete }) => {
    const xs = plays.filter((p) => time.week(p.at) === weekOf);
    return {
      weekOf,
      complete,
      plays: xs.length,
      late_share: xs.length ? xs.filter((p) => isLateNight(time.hour(p.at), cfg)).length / xs.length : null,
      repetition: xs.length ? 1 - new Set(xs.map((p) => p.key)).size / xs.length : null,
    };
  });
}

export async function readLastfm(
  get: Getter,
  opts: { user: string; apiKey: string; now: number; time?: TimeFns; cfg?: Config },
): Promise<LastfmResult> {
  const cfg = opts.cfg ?? CONFIG;
  const ic = cfg.integrations;
  // A fixed window, so plays added while paging do not shift the pages.
  const fromMs = opts.now - ic.windowDays * DAY;
  const from = Math.floor(fromMs / 1000);
  const to = Math.floor(opts.now / 1000);
  const seen = new Set<string>();
  const plays: Play[] = [];
  let page = 1;
  let total = 1;
  do {
    const url = `${BASE}?method=user.getrecenttracks&user=${encodeURIComponent(opts.user)}&api_key=${encodeURIComponent(opts.apiKey)}&format=json&from=${from}&to=${to}&limit=${ic.lastfmPageSize}&page=${page}`;
    const j = (await get(url)) as RecentTracks;
    if (j?.error) throw new Error(j.message || "Last.fm could not read that account.");
    for (const p of playsOf(j)) {
      // Only plays inside the window, once each, even when pages overlap.
      if (p.at < from * 1000 || p.at > to * 1000) continue;
      const id = `${p.at}|${p.key}`;
      if (seen.has(id)) continue;
      seen.add(id);
      plays.push(p);
    }
    total = Number(j.recenttracks?.["@attr"]?.totalPages ?? 1) || 1;
    page++;
  } while (page <= total && page <= ic.lastfmMaxPages);
  const truncated = page <= total;
  const covered = truncated && plays.length ? Math.max(fromMs, Math.min(...plays.map((p) => p.at))) : fromMs;
  return { weeks: aggregateLastfm(plays, { from: covered, to: opts.now }, opts.time ?? localTime, cfg), plays: plays.length, truncated };
}
