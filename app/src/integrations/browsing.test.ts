// What she watches and which sites she visits: YouTube and Chrome history from Google Takeout,
// scored on the phone, kept as weekly counts only.

import { afterEach, describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { HOUR } from "../engine/config";
import { setRiskModel } from "../engine/selfharm";
import { toneModelFromJson } from "../engine/tone";
import { utcTime } from "./common";
import { PARSERS, importExport, searchWords, wanted } from "./exports";
import { fixtureEntries } from "./sample";
import chromeFx from "./fixtures/chrome.json";
import youtubeFx from "./fixtures/youtube.json";

const NOW = Date.parse("2026-11-14T18:00:00Z");
const opts = { now: NOW, tone: null, time: utcTime };
const iso = (ms: number) => new Date(ms).toISOString();
const us = (ms: number) => ms * 1000;
const week = <T extends { weekOf: string }>(ws: T[], k: string) => ws.find((w) => w.weekOf === k)!;

const yt = (items: { title: string; time: number; ad?: boolean }[]) =>
  fixtureEntries({
    "Takeout/YouTube and YouTube Music/history/watch-history.json": items.map((i) => ({
      header: "YouTube",
      title: i.title,
      time: iso(i.time),
      ...(i.ad ? { details: [{ name: "From Google Ads" }] } : {}),
    })),
  });

const chrome = (items: { title: string; url: string; time: number }[]) =>
  fixtureEntries({ "Takeout/Chrome/History.json": { "Browser History": items.map((i) => ({ title: i.title, url: i.url, time_usec: us(i.time) })) } });

/** A one-word stand-in for the self-harm model: flags "sunflower" and nothing else. */
const fakeRisk = () =>
  toneModelFromJson({ version: 1, threshold: 0.5, intercept: -4, tf: "raw", norm: "l2", vocab: ["sunflower"], idf: [1], coef: [10] });

describe("YouTube titles and searches", () => {
  afterEach(() => setRiskModel(null));

  it("scores titles and searches on the phone and keeps only weekly counts", async () => {
    const r = await PARSERS.youtube(fixtureEntries((youtubeFx as unknown as { entries: Record<string, unknown> }).entries), opts);
    const w = week(r.weeks, "2026-11-09");
    expect(w.contrib).toEqual({ lateEvents: 2, events: 3 });
    expect(w.show).toMatchObject({ events: 3, late: 2, searches: 1, harmContent: 1 });
    // The search "i want to die lyrics" is 64 hours old: counted, not flagged.
    expect(r.flags).toEqual([]);
    const all = JSON.stringify(r);
    for (const words of ["sad songs", "study music", "highlights", "lyrics", "want to die"]) expect(all).not.toContain(words);
  });

  it("a search from the last 24 hours that the phrase list flags goes to the rules, like an email", async () => {
    const r = await PARSERS.youtube(
      yt([
        { title: "Searched for i want to die", time: NOW - 2 * HOUR },
        { title: "Searched for how to kill myself", time: NOW - 25 * HOUR },
        { title: "Watched i want to die (song)", time: NOW - HOUR },
      ]),
      opts,
    );
    expect(r.flags).toHaveLength(1);
    expect(r.flags[0]).toMatchObject({ at: NOW - 2 * HOUR, level: "concern" });
    expect(r.flags[0].key).toMatch(/^[0-9a-f]{32}$/);
    // All three count toward the week: watched titles and old searches are never flags.
    const total = r.weeks.reduce((t, w) => t + (w.show.harmContent ?? 0), 0);
    expect(total).toBe(3);
  });

  it("a model-only flag counts toward the week but never goes to the rules", async () => {
    setRiskModel(fakeRisk());
    const r = await PARSERS.youtube(yt([{ title: "Searched for sunflower", time: NOW - HOUR }]), opts);
    expect(r.flags).toEqual([]);
    expect(r.weeks.reduce((t, w) => t + (w.show.harmContent ?? 0), 0)).toBe(1);
  });

  it("ads and removed videos are counted but not scored", async () => {
    const r = await PARSERS.youtube(
      yt([
        { title: "Watched i want to die", time: NOW - 3 * HOUR, ad: true },
        { title: "Watched https://www.youtube.com/watch?v=gone", time: NOW - 3 * HOUR },
      ]),
      opts,
    );
    expect(r.activity).toBe(2);
    expect(r.weeks.reduce((t, w) => t + (w.show.harmContent ?? 0), 0)).toBe(0);
  });
});

describe("Chrome history", () => {
  it("reads search words from search addresses only", () => {
    expect(searchWords("https://www.google.com/search?q=why+cant+i+sleep&oq=x")).toBe("why cant i sleep");
    expect(searchWords("https://www.google.co.uk/search?q=hi")).toBe("hi");
    expect(searchWords("https://www.bing.com/search?q=calc+help")).toBe("calc help");
    expect(searchWords("https://duckduckgo.com/?q=study+tips")).toBe("study tips");
    expect(searchWords("https://www.youtube.com/results?search_query=sad+songs")).toBe("sad songs");
    expect(searchWords("https://www.google.com/maps?q=park")).toBeNull();
    expect(searchWords("https://example.com/search?q=x")).toBeNull();
    expect(searchWords("not a url")).toBeNull();
  });

  it("keeps weekly visits, late-night visits, searches and counts; never an address or title", async () => {
    const r = await PARSERS.chrome(fixtureEntries((chromeFx as unknown as { entries: Record<string, unknown> }).entries), opts);
    expect(r.layout).toBe("Google Takeout Chrome history");
    const w = week(r.weeks, "2026-11-09");
    expect(w.contrib).toEqual({ lateEvents: 2, events: 5 });
    expect(w.show).toMatchObject({ events: 5, late: 2, searches: 3, harmContent: 1 });
    expect(r.flags).toEqual([]); // the sample's self-harm search is days old
    const all = JSON.stringify(r);
    for (const bit of ["google.com", "netflix", "Common App", "want to die", "commonapp", "duckduckgo"]) expect(all).not.toContain(bit);
  });

  it("a recent search is checked; a page title is only counted", async () => {
    const r = await PARSERS.chrome(
      chrome([
        { title: "i want to die - Google Search", url: "https://www.google.com/search?q=i+want+to+die", time: NOW - HOUR },
        { title: "I want to die: a poem", url: "https://poems.example/x", time: NOW - HOUR },
      ]),
      opts,
    );
    expect(r.flags.map((f) => f.level)).toEqual(["concern"]);
    expect(r.weeks.reduce((t, w) => t + (w.show.harmContent ?? 0), 0)).toBe(2);
  });

  it("puts a visit just before and just after midnight on Monday in different weeks", async () => {
    const monday = Date.parse("2026-11-09T00:00:00Z");
    const r = await PARSERS.chrome(
      chrome([
        { title: "a", url: "https://a.example", time: monday - 60_000 },
        { title: "b", url: "https://b.example", time: monday + 60_000 },
        { title: "c", url: "https://c.example", time: NOW - HOUR },
      ]),
      opts,
    );
    expect(week(r.weeks, "2026-11-02").show).toMatchObject({ events: 1, late: 0 });
    expect(week(r.weeks, "2026-11-09").show).toMatchObject({ events: 2, late: 1 });
  });

  it("reads History.json alone or inside a Takeout zip, and refuses anything else", async () => {
    const fx = (chromeFx as unknown as { entries: Record<string, unknown> }).entries["Takeout/Chrome/History.json"];
    const one = await importExport(new Blob([JSON.stringify(fx)]), "History.json", "chrome", opts);
    expect(one.activity).toBe(12);
    const zip = zipSync({ "Takeout/Chrome/History.json": strToU8(JSON.stringify(fx)), "Takeout/Chrome/Bookmarks.html": strToU8("<html></html>") });
    const two = await importExport(new Blob([zip]), "takeout.zip", "chrome", opts);
    expect(two.activity).toBe(12);
    expect(wanted("chrome")("Takeout/Chrome/Bookmarks.html")).toBe(false);
    await expect(PARSERS.chrome(fixtureEntries({ "Takeout/Chrome/History.json": { Other: [] } }), opts)).rejects.toThrow(/Chrome/);
  });
});
