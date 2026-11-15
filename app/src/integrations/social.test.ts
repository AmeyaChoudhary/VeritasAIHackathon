// Instagram and TikTok data files beyond messages: searches are scored on the phone like YouTube
// searches and dropped; posts and videos viewed are counted by time only.

import { afterEach, describe, expect, it } from "vitest";
import { HOUR } from "../engine/config";
import { setRiskModel } from "../engine/selfharm";
import { toneModelFromJson } from "../engine/tone";
import { utcTime } from "./common";
import { PARSERS, wanted } from "./exports";
import { fixtureEntries } from "./sample";

const NOW = Date.parse("2026-11-14T18:00:00Z");
const MONDAY = Date.parse("2026-11-09T00:00:00Z");
const opts = { now: NOW, tone: null, time: utcTime };
const sec = (ms: number) => Math.round(ms / 1000);
const week = <T extends { weekOf: string }>(ws: T[], k: string) => ws.find((w) => w.weekOf === k)!;
const total = (ws: { show: Record<string, number | null> }[], k: string) => ws.reduce((t, w) => t + (w.show[k] ?? 0), 0);

const IG_PROFILE = {
  "personal_information/personal_information/personal_information.json": {
    profile_user: [{ string_map_data: { Name: { value: "Maya R", timestamp: 0 }, Username: { value: "maya.fixture", timestamp: 0 } } }],
  },
};
/** Older layout: string_map_data with Search and Time. */
const oldSearch = (words: string, at: number) => ({ title: "", media_list_data: [], string_map_data: { Search: { href: "", value: words, timestamp: 0 }, Time: { href: "", value: "", timestamp: sec(at) } } });
/** Newer layout: string_list_data with value and timestamp. */
const newSearch = (words: string, at: number) => ({ title: "", media_list_data: [], string_list_data: [{ href: "", value: words, timestamp: sec(at) }] });
const view = (author: string, at: number) => ({ string_map_data: { Author: { value: author, timestamp: 0 }, Time: { value: "", timestamp: sec(at) } } });

const igFull = () =>
  fixtureEntries({
    ...IG_PROFILE,
    "recent_searches/word_or_phrase_searches.json": { searches_keyword: [oldSearch("i want to die", NOW - 2 * HOUR), oldSearch("how to kill myself", NOW - 30 * HOUR)] },
    "logged_information/recent_searches/profile_searches.json": { searches_user: [newSearch("jordan_secret_handle", NOW - 3 * HOUR)] },
    "ads_information/ads_and_topics/posts_viewed.json": { impressions_history_posts_seen: [view("viewed_author_x", MONDAY - 60_000), view("viewed_author_x", MONDAY + 60_000)] },
    "ads_information/ads_and_topics/videos_watched.json": { impressions_history_videos_watched: [view("video_author_y", NOW - HOUR)] },
  });

const tt = (activity: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  fixtureEntries({
    "TikTok_Data/user_data_tiktok.json": { Profile: { "Profile Information": { ProfileMap: { userName: "maya.tt" } } }, Activity: activity, ...extra },
  });
const ttDate = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

/** A one-word stand-in for the self-harm model: flags "sunflower" and nothing else. */
const fakeRisk = () => toneModelFromJson({ version: 1, threshold: 0.5, intercept: -4, tf: "raw", norm: "l2", vocab: ["sunflower"], idf: [1], coef: [10] });

describe("Instagram searches and views", () => {
  afterEach(() => setRiskModel(null));

  it("scores searches on the phone, counts views by time, and keeps only weekly numbers", async () => {
    const r = await PARSERS.instagram(igFull(), opts);
    const w = week(r.weeks, "2026-11-09");
    // three searches and two views this week; one view was at 00:01
    expect(w.contrib).toMatchObject({ messages: 0, events: 5, lateEvents: 1 });
    expect(w.show).toMatchObject({ searches: 3, harmContent: 2, viewed: 2, late: 1 });
    // a view one minute before Monday midnight belongs to the week before
    expect(week(r.weeks, "2026-11-02").show).toMatchObject({ viewed: 1, searches: 0, events: 1 });
    const all = JSON.stringify(r);
    for (const bit of ["want to die", "kill myself", "jordan_secret_handle", "viewed_author_x", "video_author_y", "maya.fixture"]) expect(all).not.toContain(bit);
  });

  it("a search from the last 24 hours that the phrase list flags goes to the rules; an older one is only counted", async () => {
    const r = await PARSERS.instagram(igFull(), opts);
    expect(r.flags).toHaveLength(1);
    expect(r.flags[0]).toMatchObject({ at: NOW - 2 * HOUR, level: "concern" });
    expect(r.flags[0].key).toMatch(/^[0-9a-f]{32}$/);
    expect(total(r.weeks, "harmContent")).toBe(2);
  });

  it("a model-only flag counts toward the week but never goes to the rules", async () => {
    setRiskModel(fakeRisk());
    const r = await PARSERS.instagram(fixtureEntries({ ...IG_PROFILE, "recent_searches/word_or_phrase_searches.json": { searches_keyword: [oldSearch("sunflower", NOW - HOUR)] } }), opts);
    expect(r.flags).toEqual([]);
    expect(total(r.weeks, "harmContent")).toBe(1);
  });

  it("views are never flags, whatever the author is called", async () => {
    const r = await PARSERS.instagram(fixtureEntries({ ...IG_PROFILE, "ads_information/ads_and_topics/posts_viewed.json": { impressions_history_posts_seen: [view("i want to die", NOW - HOUR)] } }), opts);
    expect(r.flags).toEqual([]);
    expect(total(r.weeks, "harmContent")).toBe(0);
    expect(total(r.weeks, "viewed")).toBe(1);
  });

  it("reads old and new folder layouts, and skips what is not there", async () => {
    const want = wanted("instagram");
    expect(want("recent_searches/account_searches.json")).toBe(true);
    expect(want("logged_information/recent_searches/word_or_phrase_searches.json")).toBe(true);
    expect(want("your_instagram_activity/recent_searches/profile_searches.json")).toBe(true);
    expect(want("ads_information/ads_and_topics/videos_watched.json")).toBe(true);
    expect(want("ads_information/ads_and_topics/suggested_profiles_viewed.json")).toBe(true);
    expect(want("ads_information/ads_and_topics/ads_viewed.json")).toBe(false);
    expect(want("logged_information/recent_searches/word_or_phrase_searches.html")).toBe(false);
    // messages only: no searches, no views, still imports
    const msgs = await PARSERS.instagram(
      fixtureEntries({
        ...IG_PROFILE,
        "your_instagram_activity/messages/inbox/jo_1/message_1.json": { participants: [{ name: "Maya R" }, { name: "Jo" }], messages: [{ sender_name: "Maya R", timestamp_ms: NOW - HOUR, content: "see you at 4" }] },
      }),
      opts,
    );
    expect(msgs.ownMessages).toBe(1);
    expect(total(msgs.weeks, "searches")).toBe(0);
    expect(total(msgs.weeks, "viewed")).toBe(0);
    // an empty or odd search file is skipped quietly
    const odd = await PARSERS.instagram(
      fixtureEntries({ ...IG_PROFILE, "recent_searches/word_or_phrase_searches.json": { searches_keyword: [{}, { string_map_data: { Search: { value: "no time" } } }] }, "ads_information/ads_and_topics/videos_watched.json": { impressions_history_videos_watched: [view("a", NOW - HOUR)] } }),
      opts,
    );
    expect(total(odd.weeks, "searches")).toBe(0);
    expect(total(odd.weeks, "viewed")).toBe(1);
  });
});

describe("TikTok searches and watch history", () => {
  it("scores searches, counts videos by time, and drops links and search words", async () => {
    const r = await PARSERS.tiktok(
      tt({
        "Search History": { SearchList: [{ Date: ttDate(NOW - 2 * HOUR), SearchTerm: "i want to die" }, { Date: ttDate(NOW - 30 * HOUR), SearchTerm: "how to kill myself" }, { Date: ttDate(NOW - 4 * HOUR), SearchTerm: "pasta recipe" }] },
        "Watch History": { VideoList: [{ Date: ttDate(MONDAY - 60_000), Link: "https://www.tiktokv.com/share/video/777secret/" }, { Date: ttDate(MONDAY + 60_000), Link: "https://www.tiktokv.com/share/video/888secret/" }] },
        "Like List": { ItemFavoriteList: [{ date: ttDate(NOW - 5 * HOUR), link: "https://www.tiktokv.com/share/video/999secret/" }] },
      }),
      opts,
    );
    expect(r.flags).toHaveLength(1);
    expect(r.flags[0]).toMatchObject({ at: NOW - 2 * HOUR, level: "concern" });
    const w = week(r.weeks, "2026-11-09");
    expect(w.contrib).toMatchObject({ messages: 0, events: 5, lateEvents: 1 });
    expect(w.show).toMatchObject({ searches: 3, harmContent: 2, viewed: 1 });
    expect(week(r.weeks, "2026-11-02").show).toMatchObject({ viewed: 1, searches: 0 });
    const all = JSON.stringify(r);
    for (const bit of ["want to die", "kill myself", "pasta", "secret", "tiktokv", "maya.tt"]) expect(all).not.toContain(bit);
  });

  it("reads the older Video Browsing History key, and an export with messages only", async () => {
    const older = await PARSERS.tiktok(tt({ "Video Browsing History": { VideoList: [{ Date: ttDate(NOW - HOUR), Link: "https://x.example/1" }] } }), opts);
    expect(total(older.weeks, "viewed")).toBe(1);
    expect(total(older.weeks, "searches")).toBe(0);
    const dmOnly = await PARSERS.tiktok(
      tt({}, { "Direct Message": { "Direct Messages": { ChatHistory: { "Chat History with jo:": [{ Date: ttDate(NOW - HOUR), From: "maya.tt", Content: "ok" }] } } } }),
      opts,
    );
    expect(dmOnly.ownMessages).toBe(1);
    expect(total(dmOnly.weeks, "viewed")).toBe(0);
    expect(dmOnly.flags).toEqual([]);
  });
});
