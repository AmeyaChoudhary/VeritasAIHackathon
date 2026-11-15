// News sites in Chrome history: weekly visits and how many were between midnight and 5 a.m.
// Shown to the teen only; never part of the rules.

import { describe, expect, it } from "vitest";
import { HOUR } from "../engine/config";
import { utcTime } from "./common";
import { PARSERS, isNewsVisit, NEWS_SITES } from "./exports";
import { fixtureEntries } from "./sample";
import chromeFx from "./fixtures/chrome.json";

const NOW = Date.parse("2026-11-14T18:00:00Z");
const opts = { now: NOW, tone: null, time: utcTime };
const chrome = (items: { title: string; url: string; time: number }[]) =>
  fixtureEntries({ "Takeout/Chrome/History.json": { "Browser History": items.map((i) => ({ title: i.title, url: i.url, time_usec: i.time * 1000 })) } });
const week = <T extends { weekOf: string }>(ws: T[], k: string) => ws.find((w) => w.weekOf === k)!;

describe("news sites", () => {
  it("matches each listed site and its subdomains", () => {
    for (const site of NEWS_SITES) expect(isNewsVisit(`https://${site}/${site.includes("/") ? "story" : ""}`)).toBe(true);
    expect(isNewsVisit("https://edition.cnn.com/2026/11/13/politics/x")).toBe(true);
    expect(isNewsVisit("https://www.bbc.co.uk/news/articles/x")).toBe(true);
    expect(isNewsVisit("http://www.nytimes.com/")).toBe(true);
    expect(isNewsVisit("https://abcnews.go.com/US/story")).toBe(true);
    expect(isNewsVisit("https://news.google.com/home")).toBe(true);
  });

  it("does not match lookalikes, other Google or MSN pages, or other schemes", () => {
    expect(isNewsVisit("https://notcnn.com/")).toBe(false);
    expect(isNewsVisit("https://cnn.com.example.net/")).toBe(false);
    expect(isNewsVisit("https://www.google.com/search?q=news")).toBe(false);
    expect(isNewsVisit("https://go.com/")).toBe(false);
    expect(isNewsVisit("https://www.msn.com/en-us/news/world/x")).toBe(true);
    expect(isNewsVisit("https://www.msn.com/en-us/weather")).toBe(false);
    expect(isNewsVisit("https://www.msn.com/news/x")).toBe(true);
    expect(isNewsVisit("https://www.msn.com/money/news/x")).toBe(false);
    expect(isNewsVisit("https://www.yahoo.com/")).toBe(false);
    expect(isNewsVisit("chrome://history")).toBe(false);
    expect(isNewsVisit("not a url")).toBe(false);
  });

  it("counts news visits per week, and those between midnight and 5 a.m., as shown numbers only", async () => {
    const tue = Date.parse("2026-11-10T00:00:00Z");
    const r = await PARSERS.chrome(
      chrome([
        { title: "Election live", url: "https://www.cnn.com/politics/live", time: tue + 1 * HOUR },
        { title: "World", url: "https://www.bbc.co.uk/news/world", time: tue + 3 * HOUR },
        { title: "Markets", url: "https://www.wsj.com/markets", time: tue + 14 * HOUR },
        { title: "Homework help", url: "https://homework.example/", time: tue + 2 * HOUR },
        { title: "Search", url: "https://www.google.com/search?q=election+results", time: tue + 15 * HOUR },
        { title: "Old news", url: "https://apnews.com/article/x", time: Date.parse("2026-11-03T12:00:00Z") },
        { title: "c", url: "https://c.example", time: NOW - HOUR },
      ]),
      opts,
    );
    const w = week(r.weeks, "2026-11-09");
    expect(w.show).toMatchObject({ news: 3, newsLate: 2, events: 6, late: 3 });
    expect(week(r.weeks, "2026-11-02").show).toMatchObject({ news: 1, newsLate: 0 });
    // Never part of what reaches the rules.
    expect(Object.keys(w.contrib).sort()).toEqual(["events", "lateEvents"]);
    const kept = JSON.stringify(r);
    for (const bit of ["cnn", "bbc", "wsj", "apnews", "Election"]) expect(kept).not.toContain(bit);
  });

  it("the Chrome sample still reads, with a news count in every week", async () => {
    const r = await PARSERS.chrome(fixtureEntries((chromeFx as unknown as { entries: Record<string, unknown> }).entries), opts);
    expect(r.weeks.every((w) => typeof w.show.news === "number" && typeof w.show.newsLate === "number")).toBe(true);
  });

  it("other exports have no news count", async () => {
    const r = await PARSERS.youtube(
      fixtureEntries({ "Takeout/YouTube and YouTube Music/history/watch-history.json": [{ title: "Watched a video", time: new Date(NOW - HOUR).toISOString() }] }),
      opts,
    );
    expect(r.weeks.every((w) => !("news" in w.show))).toBe(true);
  });
});
