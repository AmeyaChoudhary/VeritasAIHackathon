// Music mood: the song list lookup (track id, then artist and title, then artist), and the weekly
// music mood on the Spotify data file and Last.fm. Shown to the teen only.

import { describe, expect, it } from "vitest";
import { utcTime } from "./common";
import { aggregateLastfm, playsOf, readLastfm } from "./lastfm";
import { liveWeekFrom } from "./live";
import { moodOf, moodOfKey, moodTableFromJson, nameHash, normName, summarizeMood, trackId, type MoodFile } from "./musicMood";
import { lastfmFixtureGetter } from "./sample";
import { importSpotify, sampleSpotify } from "./spotify";
import moodJson from "../../public/models/music_mood.json";

const NOW = Date.parse("2026-11-15T12:00:00Z");
const real = moodTableFromJson(moodJson as MoodFile);
const file = (name: string, data: unknown) => ({ blob: new Blob([JSON.stringify(data)]), name });

/** A tiny list in the file's own format: one track id at 0.80, one artist|title at 0.30, and
 *  that artist's mean at 0.45. */
function tiny() {
  const groups = () => Array.from({ length: 101 }, () => "");
  const ids = groups();
  const titles = groups();
  const artists = groups();
  ids[80] = "ABCDEFGH";
  titles[30] = nameHash("night bus|last stop");
  artists[45] = nameHash("night bus");
  return moodTableFromJson({ version: 1, idChars: 8, hashChars: 6, ids, titles, artists });
}

describe("the music mood list", () => {
  it("normalises names the same way as the build script", () => {
    expect(normName("Unholy (feat. Kim Petras)")).toBe("unholy");
    expect(normName("One Kiss (with Dua Lipa)")).toBe("one kiss");
    expect(normName("Héroes - Remastered 2011")).toBe("heroes");
    expect(normName("Beyoncé feat. JAY-Z")).toBe("beyonce");
    expect(normName("  Don't   Stop  Me Now ")).toBe("don t stop me now");
    // Values printed by scripts/build_music_mood.py for the same strings.
    expect(nameHash("sam smith")).toBe("39kYKd");
    expect(nameHash("daft punk")).toBe("3uJsxo");
    expect(nameHash("beyonce")).toBe("1o1PWY");
  });

  it("reads a track id from a uri, a link or the id itself", () => {
    expect(trackId("spotify:track:3JvKfv6T31zO0ini8iNItO")).toBe("3JvKfv6T31zO0ini8iNItO");
    expect(trackId("https://open.spotify.com/track/3JvKfv6T31zO0ini8iNItO?si=x")).toBe("3JvKfv6T31zO0ini8iNItO");
    expect(trackId("3JvKfv6T31zO0ini8iNItO")).toBe("3JvKfv6T31zO0ini8iNItO");
    expect(trackId("spotify:episode:3JvKfv6T31zO0ini8iNItO")).toBeNull();
    expect(trackId("short")).toBeNull();
  });

  it("looks up by track id, then artist and title, then artist", () => {
    const t = tiny();
    expect(moodOf(t, { id: "spotify:track:00000000000000ABCDEFGH" })).toEqual({ valence: 0.8, by: "id" });
    expect(moodOf(t, { id: "spotify:track:0000000000000000000000", artist: "Night Bus", title: "Last Stop (feat. Someone)" })).toEqual({ valence: 0.3, by: "title" });
    expect(moodOf(t, { artist: "Night Bus;Other", title: "A New Song" })).toEqual({ valence: 0.45, by: "artist" });
    expect(moodOf(t, { artist: "Someone Else", title: "Last Stop" })).toBeNull();
    expect(moodOf(t, {})).toBeNull();
    expect(moodOfKey(t, "night bus\u0000last stop")).toEqual({ valence: 0.3, by: "title" });
    expect(moodOfKey(t, "spotify:track:00000000000000ABCDEFGH")).toEqual({ valence: 0.8, by: "id" });
    expect(moodOfKey(t, "no separator")).toBeNull();
  });

  it("finds known songs in the built file", () => {
    expect(moodOf(real, { id: "spotify:track:3JvKfv6T31zO0ini8iNItO" })).toEqual({ valence: 0.13, by: "id" });
    expect(moodOf(real, { artist: "Tom Odell", title: "Another Love" })).toEqual({ valence: 0.13, by: "title" });
    expect(moodOf(real, { artist: "Sam Smith", title: "Unholy (feat. Kim Petras)" })).toEqual({ valence: 0.24, by: "title" });
    expect(moodOf(real, { artist: "Tom Odell", title: "A Song Not In The List" })).toEqual({ valence: 0.23, by: "artist" });
    expect(moodOf(real, { artist: "Fixture Band", title: "Nothing" })).toBeNull();
    expect(real.ids.size).toBeGreaterThan(89000);
  });

  it("stays under 3 MB", () => {
    expect(JSON.stringify(moodJson).length).toBeLessThan(3_000_000);
  });

  it("averages the songs found and counts how many were found", () => {
    const s = summarizeMood([{ valence: 0.2, by: "id" }, null, { valence: 0.6, by: "artist" }, undefined]);
    expect(s).toEqual({ mood: 0.4, matched: 2, plays: 4, by: { id: 1, title: 0, artist: 1 } });
    expect(summarizeMood([null]).mood).toBeNull();
  });
});

describe("music mood on the Spotify data file", () => {
  /** Plays every day for three weeks at 15:00 UTC, in the extended format. */
  const extended = (uri: string | null, artist: string, title: string) =>
    Array.from({ length: 21 }, (_, d) => ({
      ts: new Date(Date.parse("2026-10-20T15:00:00Z") + d * 86400000).toISOString().replace(/\.\d{3}Z$/, "Z"),
      ms_played: 200000,
      master_metadata_track_name: title,
      master_metadata_album_artist_name: artist,
      spotify_track_uri: uri,
    }));

  it("uses spotify_track_uri in extended history", async () => {
    const r = await importSpotify([file("Streaming_History_Audio_2026.json", extended("spotify:track:3JvKfv6T31zO0ini8iNItO", "Tom Odell", "Another Love"))], {
      now: NOW,
      time: utcTime,
      mood: real,
    });
    const full = r.weeks.find((w) => w.complete)!;
    expect(full.show.mood).toBe(0.13);
    expect(full.show.moodMatched).toBe(full.show.plays);
    expect(r.moodBy).toEqual({ id: 21, title: 0, artist: 0 });
    // Music mood is shown only. The rules get the late share and nothing else.
    expect(full.contrib).toEqual({ music: 0 });
    expect(Object.keys(liveWeekFrom({ spotify: { mode: "real", fetchedAt: NOW, weeks: r.weeks } }, full.weekOf).spotify!.contrib)).toEqual(["music"]);
    expect(JSON.stringify(r)).not.toMatch(/Tom Odell|Another Love|spotify:track/);
  });

  it("falls back to artist and title when the track id is not in the list", async () => {
    const r = await importSpotify([file("Streaming_History_Audio_2026.json", extended("spotify:track:AAAAAAAAAAAAAAAAAAAAAA", "Sam Smith", "Unholy (feat. Kim Petras)"))], {
      now: NOW,
      time: utcTime,
      mood: real,
    });
    expect(r.moodBy).toEqual({ id: 0, title: 21, artist: 0 });
    expect(r.weeks.find((w) => w.complete)!.show.mood).toBe(0.24);
  });

  it("uses artist and title in the account-data format", async () => {
    const plays = Array.from({ length: 21 }, (_, d) => ({
      endTime: new Date(Date.parse("2026-10-20T15:00:00Z") + d * 86400000).toISOString().slice(0, 16).replace("T", " "),
      artistName: d % 3 ? "Tom Odell" : "Fixture Band",
      trackName: d % 3 ? "Another Love" : "Unknown",
      msPlayed: 180000,
    }));
    const r = await importSpotify([file("StreamingHistory_music_0.json", plays)], { now: NOW, time: utcTime, mood: real });
    expect(r.moodBy).toEqual({ id: 0, title: 14, artist: 0 });
    expect(r.moodMatched).toBe(14);
    const full = r.weeks.find((w) => w.complete)!;
    expect(full.show.mood).toBe(0.13);
    expect(full.show.moodMatched).toBeLessThan(full.show.plays as number);
  });

  it("leaves music mood out when the list is not loaded", async () => {
    const r = await importSpotify([file("Streaming_History_Audio_2026.json", extended("spotify:track:3JvKfv6T31zO0ini8iNItO", "Tom Odell", "Another Love"))], { now: NOW, time: utcTime });
    expect(r.weeks.every((w) => !("mood" in w.show))).toBe(true);
    expect(r.moodMatched).toBeUndefined();
  });

  it("sample mode has real track ids, so it shows a music mood", async () => {
    const r = await sampleSpotify(NOW, utcTime, real);
    expect(r.moodMatched).toBe(r.weeks.reduce((t, w) => t + ((w.show.moodMatched as number) ?? 0), 0));
    expect(r.moodBy?.id).toBe(r.moodMatched);
    expect(r.moodMatched! / r.plays).toBeGreaterThan(0.95);
  });
});

describe("music mood on Last.fm", () => {
  it("looks plays up by artist and title, or artist, week by week", () => {
    const at = (iso: string) => String(Date.parse(iso) / 1000);
    const plays = playsOf({
      recenttracks: {
        track: [
          { name: "Another Love", artist: { "#text": "Tom Odell" }, date: { uts: at("2026-11-03T15:00:00Z") } },
          { name: "Sweater Weather", artist: { "#text": "The Neighbourhood" }, date: { uts: at("2026-11-04T15:00:00Z") } },
          { name: "A Song Not In The List", artist: { "#text": "Tom Odell" }, date: { uts: at("2026-11-05T15:00:00Z") } },
          { name: "Last Stop", artist: { "#text": "Night Bus" }, date: { uts: at("2026-11-06T15:00:00Z") } },
        ],
      },
    });
    const weeks = aggregateLastfm(plays, { from: Date.parse("2026-11-02T00:00:00Z"), to: Date.parse("2026-11-09T00:00:00Z") }, utcTime, undefined, real);
    const w = weeks.find((x) => x.weekOf === "2026-11-02")!;
    // 0.13, 0.40 and Tom Odell's mean 0.23; Night Bus is not in the list.
    expect(w.mood).toBe(0.25);
    expect(w.mood_matched).toBe(3);
    expect(liveWeekFrom({ lastfm: { mode: "real", fetchedAt: 0, weeks, plays: 4, truncated: false } }, "2026-11-02").lastfm!.contrib).toEqual({ music: 0 });
  });

  it("the Last.fm fixture's made-up bands are not in the list", async () => {
    const r = await readLastfm(lastfmFixtureGetter(), { user: "maya_fixture", apiKey: "sample", now: Date.parse("2026-11-14T18:00:00Z"), time: utcTime, mood: real });
    const played = r.weeks.filter((w) => w.plays > 0);
    expect(played.length).toBeGreaterThan(0);
    for (const w of played) expect(w.mood_matched).toBe(0);
  });
});

describe("music mood file checks", () => {
  it("a file with a zero or missing key width is refused instead of looping", () => {
    const bad = (j: object) => () => moodTableFromJson(j as MoodFile);
    expect(bad({ version: 1, idChars: 0, hashChars: 6, ids: [""], titles: [], artists: [] })).toThrow("Not a music mood file.");
    expect(bad({ version: 1, hashChars: 6, ids: [], titles: [], artists: [] })).toThrow("Not a music mood file.");
    expect(bad({ version: 1, idChars: 8, hashChars: 6, ids: [5], titles: [], artists: [] })).toThrow("Not a music mood file.");
  });
});
