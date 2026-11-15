// Spotify listening, from the teen's own Spotify data download, read on this phone. Only weekly
// numbers are kept: how many songs, how long, and how much of it was between midnight and
// 5 a.m. Song titles are read only to count repeats inside a week, then dropped.
//
// Stability does not call the Spotify Web API. Spotify's Developer Policy says apps may not
// analyze Spotify content or the service to create "user metrics" or profiles of users, and
// that is what a listening signal would be. (Since late 2024 new Spotify apps also can't read
// audio features such as valence, and recently-played returns only the last 50 plays.) So
// Spotify reaches Stability two ways that are the teen's own: this data file, and Last.fm,
// which Spotify can send plays to (lastfm.ts).
//
// Time zone: Spotify writes UTC in both formats. Plays are placed in the phone's own time zone
// for the hour and the week, the same as Last.fm plays. A teen who travelled will see those
// weeks shifted by the difference.
//
// Files: the "Account data" zip holds StreamingHistory_music_N.json (podcasts are in
// StreamingHistory_podcast_N.json, skipped). The "Extended streaming history" zip holds
// Streaming_History_Audio_*.json (older: endsong_N.json) and Streaming_History_Video_*.json
// (skipped). Several .json files or one .zip may be chosen at once.

import { CONFIG, type Config } from "../engine/config";
import { spotifyPlays, type SpotifyPlay } from "../engine/importers";
import { exportRange, type AggWeek } from "./agg";
import { isLateNight, localTime, weeksBetween, type TimeFns } from "./common";
import { streamEntries } from "./zip";

export class SpotifyError extends Error {}

export interface SpotifyResult {
  weeks: AggWeek[];
  /** Song plays of 30 seconds or more, across all files. */
  plays: number;
  /** Plays under 30 seconds, left out. */
  short: number;
  /** Podcasts, audiobooks and videos, left out. */
  other: number;
  files: number;
  tooBig: string[];
  truncated: boolean;
  notes: string[];
}

const WANTED = /(^|\/)(StreamingHistory_music_\d+|StreamingHistory\d*|Streaming_History_Audio_[^/]*|endsong_\d+)\.json$/i;

/** Weekly numbers from song plays. A week with no plays, and the first week of the file (which
 *  starts part way through), are not complete, so they never count as a quiet week. */
export function spotifyWeeks(plays: SpotifyPlay[], range: { from: number; to: number }, time: TimeFns = localTime, cfg: Config = CONFIG): AggWeek[] {
  return weeksBetween(range.from, range.to, time).map(({ weekOf, complete }, i) => {
    const xs = plays.filter((p) => time.week(p.at) === weekOf);
    const late = xs.filter((p) => isLateNight(time.hour(p.at), cfg)).length;
    const minutes = xs.reduce((a, p) => a + p.ms, 0) / 60000;
    const skips = xs.filter((p) => p.skipped).length;
    const repeats = xs.length ? 1 - new Set(xs.map((p) => p.key)).size / xs.length : null;
    return {
      weekOf,
      complete: complete && i > 0 && xs.length > 0,
      contrib: xs.length ? { music: late / xs.length } : {},
      show: { plays: xs.length, late, minutes: Math.round(minutes), skips, repeats },
    };
  });
}

/** Read one or more Spotify files (.json, or a .zip of them) and keep weekly numbers. */
export async function importSpotify(
  files: { blob: Blob; name: string }[],
  opts: { now: number; time?: TimeFns; cfg?: Config },
): Promise<SpotifyResult> {
  const cfg = opts.cfg ?? CONFIG;
  const seen = new Set<string>();
  const plays: SpotifyPlay[] = [];
  const tooBig: string[] = [];
  let short = 0;
  let other = 0;
  let read = 0;
  for (const f of files) {
    const isZip = /\.zip$/i.test(f.name);
    const want = (p: string) => WANTED.test(p) || (!isZip && /\.json$/i.test(p));
    const r = await streamEntries(f.blob, f.name, want, (path, text) => {
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new SpotifyError(`${path.split("/").pop()} is not a Spotify history file. Nothing was imported.`);
      }
      let got;
      try {
        got = spotifyPlays(data, path);
      } catch {
        throw new SpotifyError(`${path.split("/").pop()} is not a list of plays. Choose StreamingHistory_music or Streaming_History_Audio files.`);
      }
      read++;
      short += got.short;
      other += got.other;
      // The same play can be in both downloads; count it once.
      for (const p of got.plays) {
        const id = `${Math.round(p.at / 60000)}|${p.key}`;
        if (seen.has(id)) continue;
        seen.add(id);
        plays.push(p);
      }
    });
    tooBig.push(...r.tooBig);
    if (isZip && !r.names.some((n) => WANTED.test(n))) {
      throw new SpotifyError("This zip has no Spotify listening history in it. Look for StreamingHistory_music or Streaming_History_Audio files.");
    }
  }
  if (!plays.length) {
    throw new SpotifyError(
      read ? "No songs played for 30 seconds or more in these files. Podcasts and short plays don't count." : "No Spotify history files found. Nothing was imported.",
    );
  }
  const range = exportRange(plays, opts.now, cfg);
  if (!range) throw new SpotifyError("All the plays in these files are dated in the future. Nothing was imported.");
  const weeks = spotifyWeeks(plays, range, opts.time ?? localTime, cfg);
  const notes: string[] = [];
  if (short) notes.push(`${short} play${short === 1 ? "" : "s"} under 30 seconds left out.`);
  if (other) notes.push(`${other} podcast, audiobook or video play${other === 1 ? "" : "s"} left out.`);
  if (tooBig.length) notes.push("Some files were too big to read, so some weeks may be partial.");
  return { weeks, plays: plays.length, short, other, files: read, tooBig, truncated: tooBig.length > 0, notes };
}

/** A made-up listening history in the extended format, shaped like Maya's twelve weeks: late
 *  listening rises in weeks 5 to 8. Run through the real reader, so sample mode shows exactly
 *  what a real file would. */
export function sampleSpotifyJson(now: number): string {
  const day = 86400000;
  const out: Record<string, unknown>[] = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let d = 84; d >= 1; d--) {
    const week = Math.floor((84 - d) / 7) + 1;
    const lateShare = week >= 5 && week <= 8 ? 0.24 : 0.07;
    const n = 14 + Math.floor(rand() * 8);
    for (let k = 0; k < n; k++) {
      const late = rand() < lateShare;
      const hour = late ? Math.floor(rand() * 4) : 8 + Math.floor(rand() * 14);
      const t = new Date(now - d * day);
      t.setHours(hour, Math.floor(rand() * 60), 0, 0);
      const song = Math.floor(rand() * 60);
      out.push({
        ts: t.toISOString().replace(/\.\d{3}Z$/, "Z"),
        ms_played: rand() < 0.1 ? 12000 : 90000 + Math.floor(rand() * 150000),
        master_metadata_track_name: `Sample song ${song}`,
        master_metadata_album_artist_name: "Sample artist",
        spotify_track_uri: `spotify:track:sample${song}`,
        skipped: rand() < 0.15,
      });
    }
  }
  return JSON.stringify(out);
}

export async function sampleSpotify(now: number, time: TimeFns = localTime): Promise<SpotifyResult> {
  const json = sampleSpotifyJson(now);
  return importSpotify([{ blob: new Blob([json], { type: "application/json" }), name: "Streaming_History_Audio_sample.json" }], { now, time });
}
