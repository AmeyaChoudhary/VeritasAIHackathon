// Parser and weekly-number tests for connected accounts. No network: every response comes
// from fixtures shaped like the real Gmail, Calendar and Last.fm APIs.
import { describe, expect, it } from "vitest";
import { DAY, HOUR } from "../engine/config";
import type { ToneModel } from "../engine/tone";
import gmailFx from "./fixtures/gmail.json";
import lastfmFx from "./fixtures/lastfm.json";
import calendarFx from "./fixtures/calendar.json";
import screenAndroid from "./fixtures/screen_time_android.json";
import screenIos from "./fixtures/screen_time_ios.json";
import { mondayOfYmd, utcTime, type Getter } from "./common";
import { decodeBase64Url, ownWords, plainTextOf, readGmail, replyHoursFor, type GmailMessage } from "./gmail";
import { flagKey } from "./agg";
import { textHash } from "../engine/hash";
import { examWeeks, isExam, readCalendar } from "./calendar";
import { playsOf, readLastfm } from "./lastfm";
import { parseBucket, parseScreenTime } from "./screentime";
import { gmailFixtureGetter, lastfmFixtureGetter, SAMPLE_NOW } from "./sample";

/** A tiny stand-in tone model: "sad" and "empty" read as low mood. */
const TONE: ToneModel = {
  version: 1,
  threshold: 0.5,
  intercept: -2,
  sublinearTf: false,
  index: new Map([
    ["sad", 0],
    ["empty", 1],
  ]),
  idf: Float64Array.from([1, 1]),
  coef: Float64Array.from([6, 6]),
};

function recording(get: Getter): { get: Getter; urls: string[] } {
  const urls: string[] = [];
  return { urls, get: (u) => (urls.push(u), get(u)) };
}

type Fx = { messages: Record<string, GmailMessage>; threads: Record<string, { messages: GmailMessage[] }> };
const fx = gmailFx as unknown as Fx;

describe("Gmail", () => {
  it("decodes base64url bodies and finds the text/plain part", () => {
    expect(decodeBase64Url("SGVsbG8sIGZyaWVuZCE")).toBe("Hello, friend!");
    expect(plainTextOf(fx.messages.m3s1.payload)).toBe("Does anyone have the notes from chemistry today?");
    expect(plainTextOf(fx.messages.m6s.payload)).toBeNull(); // HTML only: not scored
  });

  it("keeps only the teen's own words under a reply", () => {
    expect(ownWords(plainTextOf(fx.messages.m1s.payload)!)).toEqual({ text: "Yes! I'll be there around 2. Can you bring the speaker?", separable: true });
    // "On ..." and "wrote:" on two lines
    expect(ownWords(plainTextOf(fx.messages.m2s.payload)!).text).toBe("Thank you for the extension. I will send the essay by Friday.");
    expect(ownWords("thanks!\n> page 4 to 9\n").text).toBe("thanks!");
  });

  it("times a reply from the message it answers, by In-Reply-To", () => {
    expect(replyHoursFor(fx.threads.t1, "m1s")).toBeCloseTo(2.5, 5);
    expect(replyHoursFor(fx.threads.t3, "m3s1")).toBeNull(); // starts the thread
    expect(replyHoursFor(fx.threads.t3, "m3s2")).toBeCloseTo(0.5, 5);
    expect(replyHoursFor(fx.threads.t6, "m6s")).toBeNull();
  });

  it("keeps weekly numbers only, and never opens other people's emails", async () => {
    const { get, urls } = recording(gmailFixtureGetter());
    const r = await readGmail(get, { now: SAMPLE_NOW, tone: TONE, time: utcTime });
    expect(r.read).toBe(10);
    expect(r.truncated).toBe(false);
    expect(r.weeks.map((w) => [w.weekOf, w.complete])).toEqual([
      ["2026-10-12", false],
      ["2026-10-19", true],
      ["2026-10-26", true],
      ["2026-11-02", true],
      ["2026-11-09", false],
    ]);
    const w1 = r.weeks[3];
    const w2 = r.weeks[4];
    expect(w1).toMatchObject({ emails_sent: 3, low_mood_share: 0 });
    expect(w1.median_reply_hours).toBeCloseTo((Date.UTC(2026, 10, 6, 1, 20) - Date.UTC(2026, 10, 5, 13)) / HOUR, 5);
    expect(w1.share_after_midnight).toBeCloseTo(1 / 3, 5); // one sent at 01:20
    expect(w2).toMatchObject({ emails_sent: 7, share_after_midnight: 0, median_reply_hours: 2 });
    expect(w2.low_mood_share).toBeCloseTo(1 / 6, 5); // six scored, one reads low; the HTML one is not scored
    expect(r.weeks[1]).toMatchObject({ emails_sent: 0, median_reply_hours: null, low_mood_share: null });
    expect(Object.keys(w1).sort()).toEqual(["complete", "emails_sent", "low_mood_share", "median_reply_hours", "share_after_midnight", "weekOf"]);
    // Full bodies only for the teen's sent messages; threads by Message-ID and In-Reply-To only.
    const full = urls.filter((u) => u.includes("format=full")).map((u) => /messages\/([^?]+)/.exec(u)![1]);
    expect(full.sort()).toEqual(["m1s", "m2s", "m3s1", "m3s2", "m4s", "m5s", "m6s", "m7s", "m8s", "m9s"]);
    for (const u of urls.filter((x) => x.includes("/threads/"))) {
      expect(u).toContain("format=metadata&metadataHeaders=Message-ID&metadataHeaders=In-Reply-To&fields=");
      expect(u).not.toMatch(/metadataHeaders=(From|To|Date|Subject)/);
    }
    expect(decodeURIComponent(urls.find((u) => u.includes("/messages?"))!)).toContain("q=in:sent newer_than:28d");
    expect(urls.filter((u) => u.includes("pageToken=p2"))).toHaveLength(1);
  });

  it("runs the self-harm check only on emails sent in the last 24 hours", async () => {
    const r = await readGmail(gmailFixtureGetter(), { now: SAMPLE_NOW, tone: null, time: utcTime });
    expect(r.flags).toEqual([]); // the email with concern words is 11 days old
    expect(r.weeks[3].low_mood_share).toBeNull(); // no tone model
    const now = Date.UTC(2026, 10, 4, 12);
    const early = await readGmail(gmailFixtureGetter(), { now, tone: null, time: utcTime });
    // Changed Nov 15: keys are built from the account, the time and a hash of the own words.
    const at = Date.UTC(2026, 10, 3, 19);
    const hash = textHash("lol nobody would miss me if i skipped the party anyway");
    expect(early.flags).toEqual([{ at, level: "concern", key: await flagKey("gmail", "maya.r@example.com", at, hash), textHash: hash }]);
    expect(early.read).toBe(2); // later emails are outside the window
  });
});

describe("Google Calendar", () => {
  it("flags exam weeks and keeps no titles", async () => {
    expect(isExam("Chemistry midterm")).toBe(true);
    expect(isExam("AP Bio unit test")).toBe(true);
    expect(isExam("ACT practice")).toBe(true);
    expect(isExam("Contest entry due")).toBe(false);
    expect(isExam("we act fast")).toBe(false);
    expect(isExam("latest news")).toBe(false);
    expect(isExam(undefined)).toBe(false);
    const urls: string[] = [];
    const r = await readCalendar(async (u) => (urls.push(u), (calendarFx as { pages: unknown[] }).pages[0]), { now: SAMPLE_NOW, time: utcTime });
    expect(r.events).toBe(7);
    expect(r.weeks).toEqual([
      { weekOf: "2026-11-16", exam: true },
      { weekOf: "2026-11-23", exam: true },
      { weekOf: "2026-11-30", exam: true },
    ]);
    expect(JSON.stringify(r)).not.toMatch(/midterm|Bio|ACT|practice/i);
    const u = new URL(urls[0]);
    expect(u.searchParams.get("timeMin")).toBe(new Date(SAMPLE_NOW - 28 * DAY).toISOString());
    expect(u.searchParams.get("timeMax")).toBe(new Date(SAMPLE_NOW + 28 * DAY).toISOString());
    expect(u.searchParams.get("singleEvents")).toBe("true");
  });

  it("puts all-day events in the right week with no time zone shift", () => {
    expect(examWeeks([{ summary: "Final", start: { date: "2026-11-22" } }])).toEqual([{ weekOf: "2026-11-16", exam: true }]);
    expect(mondayOfYmd("2026-11-23")).toBe("2026-11-23");
  });
});

describe("Last.fm", () => {
  it("reads every page, skips the track playing now, and keeps weekly numbers", async () => {
    const { get, urls } = recording(lastfmFixtureGetter());
    const r = await readLastfm(get, { user: "maya_fixture", apiKey: "k", now: SAMPLE_NOW, time: utcTime });
    expect(r.plays).toBe(7);
    expect(urls).toHaveLength(2);
    const u = new URL(urls[0]);
    expect(u.searchParams.get("method")).toBe("user.getrecenttracks");
    expect(u.searchParams.get("limit")).toBe("200");
    expect(u.searchParams.get("from")).toBe(String(Math.floor((SAMPLE_NOW - 28 * DAY) / 1000)));
    const [w1, w2] = r.weeks.slice(-2);
    expect(w1).toMatchObject({ weekOf: "2026-11-02", complete: true, plays: 3, repetition: 0 });
    expect(w1.late_share).toBeCloseTo(1 / 3, 5);
    expect(w2).toMatchObject({ weekOf: "2026-11-09", complete: false, plays: 4, late_share: 0.5, repetition: 0.5 });
    expect(r.truncated).toBe(false);
    expect(u.searchParams.get("to")).toBe(String(Math.floor(SAMPLE_NOW / 1000)));
  });

  it("handles a page with one track and an error answer", async () => {
    expect(playsOf((lastfmFx as unknown as { single: Parameters<typeof playsOf>[0] }).single)).toHaveLength(1);
    await expect(readLastfm(async () => (lastfmFx as { error: unknown }).error, { user: "x", apiKey: "k", now: SAMPLE_NOW })).rejects.toThrow("User not found");
  });
});

describe("Screen time", () => {
  it("reads iPhone buckets", () => {
    expect(parseBucket(">=30")).toBe(30);
    expect(parseBucket(">60")).toBe(60);
    expect(parseBucket("<5")).toBe(2.5);
    expect(parseBucket("<=5")).toBe(2.5);
    expect(parseBucket("5-15")).toBe(10);
    expect(parseBucket("7")).toBe(7);
    expect(parseBucket(12)).toBe(12);
    expect(parseBucket("lots")).toBeNull();
    expect(parseBucket(null)).toBeNull();
    const r = parseScreenTime(JSON.stringify(screenIos));
    expect(r.source).toBe("ios_device_activity");
    // iPhone gives both measurements as buckets: ">=180", "<60", ">=120" and a missing day
    expect(r.weeks[0]).toMatchObject({ weekOf: "2026-10-26", screen_minutes: 110, screen_days: 3, night_days: 3, phone_free_hours: null, free_nights: 0 });
    expect(r.weeks[0].night_minutes).toBeCloseTo((30 + 7.5 + 15) / 3, 5);
  });

  it("gives minutes a day and the phone-free window from an Android file", () => {
    const r = parseScreenTime(JSON.stringify(screenAndroid), undefined, "UTC");
    expect(r.days).toBe(14);
    const [w1, w2] = r.weeks;
    expect(w1).toMatchObject({ weekOf: "2026-10-19", days: 7, screen_days: 6, night_days: 7, free_nights: 5 });
    expect(w1.screen_minutes).toBeCloseTo(1605 / 6, 5); // one day has no screen minutes
    expect(w1.night_minutes).toBeCloseTo(55 / 7, 5);
    // Nights ending 23:20, 23:05, 23:40, 22:50 and 23:00. Use past midnight (23:59) and a
    // first use at 01:15 can't give a window, so those nights are left out.
    expect(w1.phone_free_hours).toBeCloseTo((455 + 485 + 530 + 650 + 485) / 60 / 5, 5);
    expect(w2.phone_free_hours).toBeCloseTo((455 + 485 + 530 + 650) / 60 / 4, 5); // the last night has no morning
  });

  it("rejects files that are not from the screen-time app", () => {
    expect(() => parseScreenTime("not json")).toThrow();
    expect(() => parseScreenTime(JSON.stringify({ source: "other", version: 1, days: [] }))).toThrow();
    // Version 2 is read now (Health Connect and the keyboard); a version after it is refused.
    expect(() => parseScreenTime(JSON.stringify({ source: "android_usage_stats", version: 3, days: [] }))).toThrow();
  });

  it("reads the native app's sample file when it is there", () => {
    const files = import.meta.glob("../../../native/sample/*.json", { eager: true, query: "?raw", import: "default" }) as Record<string, string>;
    for (const [path, text] of Object.entries(files)) {
      if (!/screen_time/.test(path)) continue;
      const r = parseScreenTime(text);
      expect(r.days, path).toBeGreaterThan(0);
      expect(r.weeks.length, path).toBeGreaterThan(0);
    }
  });
});
