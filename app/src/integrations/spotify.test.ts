import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { MIN_PLAY_MS, parseSpotify, spotifyPlays } from "../engine/importers";
import { utcTime } from "./common";
import { importSpotify, sampleSpotify, SpotifyError } from "./spotify";
import { liveWeekFrom } from "./live";

const NOW = Date.parse("2026-11-15T12:00:00Z");
const file = (name: string, data: unknown) => ({ blob: new Blob([typeof data === "string" ? data : JSON.stringify(data)]), name });
const read = (files: { blob: Blob; name: string }[]) => importSpotify(files, { now: NOW, time: utcTime });

/** Plays every day for three weeks, so there are complete weeks to look at. */
function accountDays(extra: object[] = []) {
  const out: object[] = [];
  for (let d = 1; d <= 21; d++) {
    const day = new Date(Date.parse("2026-10-19T00:00:00Z") + d * 86400000).toISOString().slice(0, 10);
    out.push({ endTime: `${day} 15:00`, artistName: "Secret Artist", trackName: "Secret Song", msPlayed: 180000 });
  }
  return [...out, ...extra];
}

describe("Spotify data files", () => {
  it("reads the account-data format and leaves out podcasts and plays under 30 seconds", async () => {
    const r = await read([
      file("MyData/StreamingHistory_music_0.json", accountDays([{ endTime: "2026-11-03 15:00", artistName: "A", trackName: "B", msPlayed: 20000 }])),
      file("MyData/StreamingHistory_podcast_0.json", [{ endTime: "2026-11-03 16:00", podcastName: "Pod", episodeName: "Ep", msPlayed: 900000 }]),
    ]);
    expect(r.plays).toBe(21);
    expect(r.short).toBe(1);
    expect(r.other).toBe(1);
    expect(r.files).toBe(2);
    expect(r.weeks.some((w) => w.complete && w.contrib.music === 0)).toBe(true);
  });

  it("reads the extended format, skips spoken audio, and keeps the skip count", async () => {
    const plays = [];
    for (let d = 1; d <= 21; d++) {
      const t = new Date(Date.parse("2026-10-19T00:00:00Z") + d * 86400000 + 2 * 3600000).toISOString().replace(/\.\d{3}Z$/, "Z");
      plays.push({ ts: t, ms_played: 200000, master_metadata_track_name: "Secret Song", master_metadata_album_artist_name: "Secret Artist", spotify_track_uri: "spotify:track:secret", skipped: d % 2 === 0 });
    }
    plays.push({ ts: "2026-11-04T02:00:00Z", ms_played: 1800000, master_metadata_track_name: null, spotify_track_uri: null, episode_name: "A podcast" });
    const r = await read([file("Spotify Extended Streaming History/Streaming_History_Audio_2026.json", plays)]);
    expect(r.plays).toBe(21);
    expect(r.other).toBe(1);
    const full = r.weeks.filter((w) => w.complete);
    expect(full.length).toBeGreaterThan(0);
    // every play is at 02:00 UTC, so all of them are after midnight
    for (const w of full) expect(w.contrib.music).toBe(1);
    expect(full.reduce((a, w) => a + (w.show.skips ?? 0), 0)).toBeGreaterThan(0);
  });

  it("counts a play from 30 seconds on, not before", () => {
    const at = "2026-11-03T15:00:00Z";
    const r = spotifyPlays([
      { ts: at, ms_played: MIN_PLAY_MS - 1, master_metadata_track_name: "x", spotify_track_uri: "spotify:track:1" },
      { ts: at, ms_played: MIN_PLAY_MS, master_metadata_track_name: "y", spotify_track_uri: "spotify:track:2" },
    ]);
    expect(r.plays).toHaveLength(1);
    expect(r.short).toBe(1);
  });

  it("puts a play in the week of the phone's own date, across midnight", async () => {
    // Sunday 23:50 and Monday 00:10 (UTC here) fall in different weeks; the Monday one is after midnight.
    const days = accountDays([
      { endTime: "2026-11-08 23:50", artistName: "A", trackName: "B", msPlayed: 60000 },
      { endTime: "2026-11-09 00:10", artistName: "A", trackName: "B", msPlayed: 60000 },
    ]);
    const r = await read([file("StreamingHistory_music_0.json", days)]);
    const wk = (weekOf: string) => r.weeks.find((w) => w.weekOf === weekOf)!;
    expect(wk("2026-11-02").show.late).toBe(0);
    expect(wk("2026-11-09").show.late).toBe(1);
  });

  it("keeps no song names, artists or track ids", async () => {
    const r = await read([file("StreamingHistory_music_0.json", accountDays())]);
    const kept = JSON.stringify(r);
    expect(kept).not.toMatch(/Secret|spotify:track/);
    expect(r.weeks.length).toBeGreaterThan(0);
  });

  it("reads several files at once and counts a play in both downloads once", async () => {
    const a = accountDays();
    const r = await read([file("StreamingHistory_music_0.json", a), file("StreamingHistory_music_1.json", a)]);
    expect(r.plays).toBe(21);
  });

  it("reads a zip, and skips the video history inside it", async () => {
    const zip = zipSync({
      "Spotify Extended Streaming History/Streaming_History_Audio_2026.json": strToU8(JSON.stringify(accountDays().map((p) => ({ ...p, ts: undefined })))),
      "Spotify Extended Streaming History/Streaming_History_Video_2026.json": strToU8(JSON.stringify([{ ts: "2026-11-03T01:00:00Z", ms_played: 600000 }])),
      "Spotify Extended Streaming History/ReadMeFirst.pdf": strToU8("pdf"),
    });
    const r = await read([{ blob: new Blob([zip]), name: "my_spotify_data.zip" }]);
    expect(r.plays).toBe(21);
  });

  it("says plainly when a file is not Spotify history", async () => {
    await expect(read([file("notes.json", "not json")])).rejects.toBeInstanceOf(SpotifyError);
    await expect(read([file("StreamingHistory_music_0.json", { a: 1 })])).rejects.toThrow(/list of plays/);
    const zip = zipSync({ "photos/cat.json": strToU8("[]") });
    await expect(read([{ blob: new Blob([zip]), name: "other.zip" }])).rejects.toThrow(/no Spotify listening history/);
  });

  it("joins the rules as the music signal, only from complete weeks", async () => {
    const r = await read([file("StreamingHistory_music_0.json", accountDays())]);
    const acc = { spotify: { mode: "real" as const, fetchedAt: NOW, weeks: r.weeks } };
    const full = r.weeks.find((w) => w.complete)!;
    expect(liveWeekFrom(acc, full.weekOf).spotify).toEqual({ complete: true, contrib: { music: 0 } });
    const first = r.weeks[0];
    expect(liveWeekFrom(acc, first.weekOf).spotify?.complete).toBe(false);
  });

  it("sample mode goes through the same reader", async () => {
    const r = await sampleSpotify(NOW, utcTime);
    expect(r.plays).toBeGreaterThan(500);
    expect(r.short).toBeGreaterThan(0);
    expect(r.weeks.filter((w) => w.complete).length).toBeGreaterThanOrEqual(10);
    expect(JSON.stringify(r)).not.toMatch(/Sample song|spotify:track/);
  });

  it("the quick look applies the same rules", () => {
    const r = parseSpotify(JSON.stringify([
      { endTime: "2026-10-05 23:30", msPlayed: 3600000 },
      { endTime: "2026-10-06 01:30", msPlayed: 10000 },
    ]));
    expect(r.plays).toBe(1);
  });
});
