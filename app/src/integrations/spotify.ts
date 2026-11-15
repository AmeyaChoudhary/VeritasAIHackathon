// Spotify listening, read on this phone two ways: the teen's own Spotify data download (this
// file), and a live sign-in to Spotify (spotifyAuth.ts and spotifyLive.ts). Only weekly numbers
// are kept: how many songs, how long (file only), how much of it was between midnight and 5 a.m.,
// how often songs repeat, and the music mood (musicMood.ts). Song titles and ids are read only to
// count repeats and look up the music mood, then dropped.
//
// The live sign-in runs in Spotify's development mode: the app's owner and up to 5 users added
// in its dashboard can sign in. A public launch would need Spotify's approval, because Spotify's
// Developer Policy restricts using its API to build user metrics or profiles from listening, and
// a listening signal is that. Spotify's API also returns only the last 50 plays. The data file
// and Last.fm (lastfm.ts), which Spotify can send plays to, stay as the paths anyone can use.
//
// Time zone: Spotify writes UTC in both formats. Plays are placed in the phone's own time zone
// for the hour and the week, the same as Last.fm plays. A teen who travelled will see those
// weeks shifted by the difference.
//
// Files: the "Account data" zip holds StreamingHistory_music_N.json (podcasts are in
// StreamingHistory_podcast_N.json, skipped). The "Extended streaming history" zip holds
// Streaming_History_Audio_*.json (older: endsong_N.json) and Streaming_History_Video_*.json
// (skipped). Several .json files or one .zip may be chosen at once. Extended history rows carry
// spotify_track_uri, so their music mood is looked up by track id; account-data rows by artist
// and title.

import { CONFIG, type Config } from "../engine/config";
import { spotifyPlays, type SpotifyPlay } from "../engine/importers";
import { exportRange, type AggWeek } from "./agg";
import { isLateNight, localTime, weeksBetween, type TimeFns } from "./common";
import { streamEntries } from "./zip";
import { moodOf, moodOfKey, summarizeMood, type MoodHit, type MoodTable } from "./musicMood";

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
  /** Plays found in the music mood list, and how (track id, artist and title, or artist). */
  moodMatched?: number;
  moodBy?: Record<MoodHit, number>;
}

/** A play with its music mood looked up while the names were still in memory. */
export type MoodPlay = SpotifyPlay & { mood?: { valence: number; by: MoodHit } | null };

const WANTED = /(^|\/)(StreamingHistory_music_\d+|StreamingHistory\d*|Streaming_History_Audio_[^/]*|endsong_\d+)\.json$/i;

/** Weekly numbers from song plays. A week with no plays, and the first week of the file (which
 *  starts part way through), are not complete, so they never count as a quiet week.
 *  Music mood goes in show only: it is shown to the teen and never reaches the rules.
 *  The live read has no listening time or skips, so it passes timed: false. */
export function spotifyWeeks(
  plays: MoodPlay[],
  range: { from: number; to: number },
  time: TimeFns = localTime,
  cfg: Config = CONFIG,
  opts: { mood?: boolean; timed?: boolean } = {},
): AggWeek[] {
  const timed = opts.timed !== false;
  return weeksBetween(range.from, range.to, time).map(({ weekOf, complete }, i) => {
    const xs = plays.filter((p) => time.week(p.at) === weekOf);
    const late = xs.filter((p) => isLateNight(time.hour(p.at), cfg)).length;
    const minutes = xs.reduce((a, p) => a + p.ms, 0) / 60000;
    const skips = xs.filter((p) => p.skipped).length;
    const repeats = xs.length ? 1 - new Set(xs.map((p) => p.key)).size / xs.length : null;
    const show: AggWeek["show"] = { plays: xs.length, late, minutes: timed ? Math.round(minutes) : null, skips: timed ? skips : null, repeats };
    if (opts.mood) {
      const m = summarizeMood(xs.map((p) => p.mood));
      show.mood = m.mood;
      show.moodMatched = m.matched;
    }
    return {
      weekOf,
      complete: complete && i > 0 && xs.length > 0,
      contrib: xs.length ? { music: late / xs.length } : {},
      show,
    };
  });
}

const text = (v: unknown) => (typeof v === "string" ? v : "");

/** Music mood for each song in one file's rows, by the same key the importer gives a play. The
 *  names are read here while the file is in memory, so an extended-history play whose track id
 *  is not in the list can still be found by artist and title. */
function moodByKey(data: unknown, mood: MoodTable): Map<string, { valence: number; by: MoodHit } | null> {
  const out = new Map<string, { valence: number; by: MoodHit } | null>();
  if (!Array.isArray(data)) return out;
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const artist = text(o.master_metadata_album_artist_name ?? o.artistName);
    const title = text(o.master_metadata_track_name ?? o.trackName);
    const uri = text(o.spotify_track_uri);
    const key = uri || `${artist}\u0000${title}`.toLowerCase();
    if (!out.has(key)) out.set(key, moodOf(mood, { id: uri, artist, title }));
  }
  return out;
}

/** Read one or more Spotify files (.json, or a .zip of them) and keep weekly numbers. */
export async function importSpotify(
  files: { blob: Blob; name: string }[],
  opts: { now: number; time?: TimeFns; cfg?: Config; mood?: MoodTable | null },
): Promise<SpotifyResult> {
  const cfg = opts.cfg ?? CONFIG;
  const mood = opts.mood ?? null;
  const seen = new Set<string>();
  const plays: MoodPlay[] = [];
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
      const found = mood ? moodByKey(data, mood) : null;
      // The same play can be in both downloads; count it once.
      for (const p of got.plays) {
        const id = `${Math.round(p.at / 60000)}|${p.key}`;
        if (seen.has(id)) continue;
        seen.add(id);
        plays.push(mood ? { ...p, mood: found?.get(p.key) ?? moodOfKey(mood, p.key) } : p);
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
  const weeks = spotifyWeeks(plays, range, opts.time ?? localTime, cfg, { mood: !!mood });
  const notes: string[] = [];
  if (short) notes.push(`${short} play${short === 1 ? "" : "s"} under 30 seconds left out.`);
  if (other) notes.push(`${other} podcast, audiobook or video play${other === 1 ? "" : "s"} left out.`);
  if (tooBig.length) notes.push("Some files were too big to read, so some weeks may be partial.");
  const m = mood ? summarizeMood(plays.filter((p) => p.at >= range.from && p.at <= range.to).map((p) => p.mood)) : null;
  return {
    weeks,
    plays: plays.length,
    short,
    other,
    files: read,
    tooBig,
    truncated: tooBig.length > 0,
    notes,
    ...(m ? { moodMatched: m.matched, moodBy: m.by } : {}),
  };
}

/** Sixty real track ids from the public song list (popular songs, picked by id order, not by
 *  mood), so sample mode shows a music mood. No names are stored. */
const SAMPLE_TRACKS = [
  "003vvx7Niy0yvhvHt4a68B", "08Isz2ETWSBhvIl8UpKYsp", "0Fs9cdPDhptWEDJmiCbkEW", "0MnTkIEP4zZN1IUSu8MvIz", "0TDLuuLlV54CkRRUOahJb4", "0Z2J91b2iTGLVTZC4fKgxf",
  "0gmbgwZ8iqyMPmXefof8Yf", "0nrRP2bk19rLc0orkWPQk2", "0tgVpDi06FyKpA1z0VMD4v", "10SRMwb9EuVS1K9rYsBfHQ", "1EzrEOXmMH3G43AXT1y7pA", "1RF02Cf80mTaeNXG2P2boR",
  "1ZdhOMWyFR8Iv9eylMGYg2", "1i1fxkWeaMmKEB4T7zqbzK", "1xzi1Jcr7mEi9K2RfzLOqS", "21szgNA72iLwvBxHQLgwBh", "28n8z9IQKyjMPxmvYMBqZa", "2Ch7LmS7r2Gy2kc64wv3Bz",
  "2HZLXBOnaSRhXStMLrq9fD", "2P4OICZRVAQcYAV2JReRfj", "2V65y3PX4DkRhy1djlxd9p", "2dpaYNEQHiRxtZbfNsse99", "2iUmqdfGZcHIhS3b9E9EWq", "2rurDawMfoKP4uHyb2kJBt",
  "2vmfvSoZBFAt9hhRoEByLi", "32OlwWuMpZ6b0aN2RZOeMS", "3B54sVLJ402zGa6Xm4YGNe", "3GZD6HmiNUhxXYf8Gch723", "3PpWCS95gDUDRPko3u1MZ9", "3WMj8moIAXJhHsyLaqIIHI",
  "3afkJSKX0EAMsJXTZnDXXJ", "3eekarcy7kvN4yt5ZFzltW", "3kUq4sBcmxhnOtNysZ9yrp", "3w3y8KPTfNeOKPiqUTakBh", "41wtwzCZkXwpnakmwJ239F", "48AJSd42lXpicsGqcgopof",
  "4HlFJV71xXKIGcU3kRyttv", "4RCWB3V8V0dignt99LZ8vH", "4a9tbd947vo9K8Vti9JwcI", "4gzsuuZypVbxs0Af1LSZyB", "4qu63nuBpdn0qHUHuObEj1", "4woTEX1wYOTGDqNXuavlRC",
  "57bgtoPSgt236HzfBOd8kj", "5DqdesEfbRyOlSS3Tf6c29", "5OCJzvD7sykQEKHH7qAC3C", "5UWwZ5lm5PKu6eKsHAGxOk", "5fVZC9GiM4e8vu99W0Xf6J", "5qaEfEh1AtSdrdrByCP7qR",
  "60a0Rd6pjrkxjPbaKzXjfq", "68Dni7IE4VyPkTOH9mRWHr", "6Dy1jexKYriXAVG6evyUTJ", "6Im9k8u9iIzKMrmV7BWtlF", "6RtPijgfPKROxEzTHNRiDp", "6WrI0LAC5M1Rw2MnX2ZvEg",
  "6dBUzqjtbnIa1TwYbyw5CM", "6habFhsOp2NvshLv26DqMb", "6ojZtz3sZr6ynvejLOqgCj", "75FEaRjZTKLhTrFGsfMUXR", "7BqBn9nzAq8spo5e7cZ0dJ", "7Ie9W94M7OjPoZVV216Xus",
];

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
        spotify_track_uri: `spotify:track:${SAMPLE_TRACKS[song]}`,
        skipped: rand() < 0.15,
      });
    }
  }
  return JSON.stringify(out);
}

export async function sampleSpotify(now: number, time: TimeFns = localTime, mood: MoodTable | null = null): Promise<SpotifyResult> {
  const json = sampleSpotifyJson(now);
  return importSpotify([{ blob: new Blob([json], { type: "application/json" }), name: "Streaming_History_Audio_sample.json" }], { now, time, mood });
}
