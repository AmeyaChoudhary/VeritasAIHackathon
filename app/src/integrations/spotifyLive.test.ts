// The live Spotify sign-in (PKCE) and the read of recent plays and top songs.

import { describe, expect, it } from "vitest";
import { utcTime } from "./common";
import { liveWeekFrom } from "./live";
import { moodTableFromJson, type MoodFile } from "./musicMood";
import { SPOTIFY_SCOPES, SPOTIFY_TOKEN_URL, spotifyAuthUrl, spotifyNeeds127, spotifyPkce, spotifyRedirectUri, spotifyToken, spotifyTokenBody } from "./spotifyAuth";
import { RECENT_URL, readSpotifyLive, recentPlays, spotifyGetter, topSongs, topUrl } from "./spotifyLive";
import recentFx from "./fixtures/spotify_recent.json";
import topFx from "./fixtures/spotify_top.json";
import moodJson from "../../public/models/music_mood.json";

const NOW = Date.parse(recentFx.referenceTime);
const mood = moodTableFromJson(moodJson as MoodFile);
const week = <T extends { weekOf: string }>(ws: T[], k: string) => ws.find((w) => w.weekOf === k)!;

/** Answers Spotify API addresses from the fixtures. */
const fixtureGet = async (url: string): Promise<unknown> => {
  if (url === RECENT_URL) return recentFx.page;
  if (url === topUrl("short_term")) return topFx.short_term;
  if (url === topUrl("medium_term")) return topFx.medium_term;
  throw new Error(`No fixture for ${url}`);
};

describe("Spotify sign-in with PKCE", () => {
  it("makes a verifier, its S256 challenge and a Spotify state", async () => {
    const p = await spotifyPkce();
    expect(p.verifier).toMatch(/^[A-Za-z0-9_-]{64}$/);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(p.verifier)));
    const expected = btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(expected).toHaveLength(43);
    expect(p.challenge).toBe(expected);
    expect(p.state.startsWith("steadysp.")).toBe(true);
    const q = await spotifyPkce();
    expect(q.verifier).not.toBe(p.verifier);
    expect(q.state).not.toBe(p.state);
  });

  it("asks Spotify for a code with the challenge, the two read scopes and the registered address", () => {
    const url = new URL(spotifyAuthUrl("client123", "http://127.0.0.1:5210/auth.html", { challenge: "abc_-", state: "steadysp.xyz" }));
    expect(url.origin + url.pathname).toBe("https://accounts.spotify.com/authorize");
    const q = Object.fromEntries(url.searchParams);
    expect(q).toEqual({
      response_type: "code",
      client_id: "client123",
      scope: "user-read-recently-played user-top-read",
      code_challenge_method: "S256",
      code_challenge: "abc_-",
      redirect_uri: "http://127.0.0.1:5210/auth.html",
      state: "steadysp.xyz",
    });
    expect(SPOTIFY_SCOPES.split(" ")).toEqual(["user-read-recently-played", "user-top-read"]);
  });

  it("comes back to auth.html at exactly the two registered addresses", () => {
    expect(spotifyRedirectUri("http://127.0.0.1:5210/#/teen")).toBe("http://127.0.0.1:5210/auth.html");
    expect(spotifyRedirectUri("http://127.0.0.1:5210/?x=1#/")).toBe("http://127.0.0.1:5210/auth.html");
    expect(spotifyRedirectUri("https://ameyachoudhary.github.io/VeritasAIHackathon/app/#/teen")).toBe(
      "https://ameyachoudhary.github.io/VeritasAIHackathon/app/auth.html",
    );
    expect(spotifyRedirectUri("https://ameyachoudhary.github.io/VeritasAIHackathon/app/index.html")).toBe(
      "https://ameyachoudhary.github.io/VeritasAIHackathon/app/auth.html",
    );
    expect(spotifyNeeds127("http://localhost:5210/#/teen")).toBe(true);
    expect(spotifyNeeds127("http://127.0.0.1:5210/#/teen")).toBe(false);
  });

  it("swaps the code with the verifier and no client secret", async () => {
    const body = spotifyTokenBody("client123", "http://127.0.0.1:5210/auth.html", "the-code", "the-verifier");
    expect(Object.fromEntries(body)).toEqual({
      grant_type: "authorization_code",
      code: "the-code",
      redirect_uri: "http://127.0.0.1:5210/auth.html",
      client_id: "client123",
      code_verifier: "the-verifier",
    });
    expect(body.has("client_secret")).toBe(false);

    let sent: { url: string; init: RequestInit } | null = null;
    const ok = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response(JSON.stringify({ access_token: "tok", refresh_token: "not kept", expires_in: 3600 }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await spotifyToken("client123", "http://127.0.0.1:5210/auth.html", "the-code", "the-verifier", ok)).toBe("tok");
    expect(sent!.url).toBe(SPOTIFY_TOKEN_URL);
    expect(sent!.init.method).toBe("POST");
    expect(String(sent!.init.body)).toContain("code_verifier=the-verifier");

    const bad = (async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "Invalid authorization code" }), { status: 400 })) as unknown as typeof fetch;
    await expect(spotifyToken("c", "r", "x", "v", bad)).rejects.toThrow(/Invalid authorization code/);
  });

  it("says plainly when Spotify refuses an account in development mode", async () => {
    const refused = (async () => new Response("User not registered in the Developer Dashboard", { status: 403 })) as unknown as typeof fetch;
    await expect(spotifyGetter("tok", refused)(RECENT_URL)).rejects.toThrow(/development mode/);
  });
});

describe("Spotify recent plays and top songs", () => {
  it("reads recent plays, skipping episodes and items with no time", () => {
    const plays = recentPlays(recentFx.page);
    expect(plays).toHaveLength(10);
    expect(plays.every((p) => Number.isFinite(p.at))).toBe(true);
    expect(plays.find((p) => p.song.artist === "Fixture Band")!.song.id).toBeNull();
    expect(recentPlays({})).toEqual([]);
    expect(recentPlays({ items: [{ track: null, played_at: "2026-11-01T00:00:00Z" }] })).toEqual([]);
  });

  it("reads top songs for both spans", () => {
    expect(topSongs(topFx.short_term)).toHaveLength(4);
    expect(topSongs(topFx.medium_term).map((s) => s.title)).toEqual(["One Kiss (with Dua Lipa)", "Second Song"]);
    expect(topSongs({})).toEqual([]);
  });

  it("makes the same weekly numbers as the data file, plus music mood", async () => {
    const r = await readSpotifyLive(fixtureGet, { now: NOW, time: utcTime, mood });
    expect(r.plays).toBe(10);
    expect(r.since).toBe(Date.parse("2026-11-01T22:00:00.000Z"));
    expect(r.weeks.map((w) => [w.weekOf, w.complete])).toEqual([
      ["2026-10-26", false],
      ["2026-11-02", true],
      ["2026-11-09", false],
    ]);
    const full = week(r.weeks, "2026-11-02");
    // Sweater Weather, Woman, Woman, Another Love; Woman at 01:00 and Another Love at 03:00 are late.
    expect(full.show).toMatchObject({ plays: 4, late: 2, repeats: 0.25, minutes: null, skips: null, mood: 0.57, moodMatched: 4 });
    expect(full.contrib).toEqual({ music: 0.5 });
    const now = week(r.weeks, "2026-11-09");
    // Fixture Band is not in the list; Unholy is found by artist and title, the unknown Tom Odell song by artist.
    expect(now.show).toMatchObject({ plays: 5, late: 2, mood: 0.25, moodMatched: 4 });
    expect(r.moodMatched).toBe(9);
    expect(r.moodBy).toEqual({ id: 7, title: 1, artist: 1 });
    expect(r.topShort).toMatchObject({ mood: 0.47, matched: 3, plays: 4 });
    expect(r.topMedium).toMatchObject({ mood: 0.59, matched: 1, plays: 2 });
  });

  it("keeps no song names, artists or ids, and music mood never reaches the rules", async () => {
    const r = await readSpotifyLive(fixtureGet, { now: NOW, time: utcTime, mood });
    expect(JSON.stringify(r)).not.toMatch(/Another Love|Tom Odell|Fixture Band|3JvKfv6T31zO0ini8iNItO|spotify:track/);
    const acc = { spotify: { mode: "real" as const, fetchedAt: NOW, weeks: r.weeks } };
    expect(liveWeekFrom(acc, "2026-11-02").spotify).toEqual({ complete: true, contrib: { music: 0.5 } });
    for (const w of r.weeks) expect(Object.keys(w.contrib).every((k) => k === "music")).toBe(true);
  });

  it("works without the music mood list", async () => {
    const r = await readSpotifyLive(fixtureGet, { now: NOW, time: utcTime });
    expect(week(r.weeks, "2026-11-02").show.mood).toBeUndefined();
    expect(r.topShort).toBeNull();
    expect(r.moodMatched).toBeUndefined();
  });

  it("says so when the account has no songs at all", async () => {
    const empty = async () => ({ items: [] });
    await expect(readSpotifyLive(empty, { now: NOW, time: utcTime, mood })).rejects.toThrow(/no songs/);
  });
});
