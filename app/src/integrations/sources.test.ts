// Readers for the newer sources, run over fixtures shaped like each real API response and
// export layout. No network. Each messaging source has other people's words in it, with
// risk phrases, that must never be scored or flagged.
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { CONFIG, DAY } from "../engine/config";
import type { ToneModel } from "../engine/tone";
import { utcTime } from "./common";
import { readClassroom } from "./classroom";
import { DRIVE_FIELDS, readDriveActivity } from "./drive";
import { inReplyTo, readOutlook } from "./microsoft";
import { bedtimeMinutes, fitbitAuthUrl, pkcePair, readFitbit } from "./fitbit";
import { readCanvas, readSchoology, schoologyAuthHeader } from "./school";
import { ExportError, PARSERS, exportTime, parseCsv, repairText, wanted } from "./exports";
import { readEntries } from "./zip";
import { parseScreenTime } from "./screentime";
import { liveWeekFrom } from "./live";
import {
  SAMPLE_NOW,
  canvasFixtureGetter,
  classroomFixtureGetter,
  drivePoster,
  fitbitFixtureGetter,
  fixtureEntries,
  microsoftFixtureGetter,
  schoologyFixtureGetter,
} from "./sample";
import instagramFx from "./fixtures/instagram.json";
import tiktokFx from "./fixtures/tiktok.json";
import snapchatFx from "./fixtures/snapchat.json";
import discordFx from "./fixtures/discord.json";
import youtubeFx from "./fixtures/youtube.json";
import fitbitFx from "./fixtures/fitbit.json";
import phoneV2 from "./fixtures/phone_data_android_v2.json";

/** "sad" and "empty" read as low mood. */
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

const now = SAMPLE_NOW; // 2026-11-14T18:00:00Z
const opts = { now, tone: TONE, time: utcTime };
const week = <T extends { weekOf: string }>(ws: T[], k: string) => ws.find((w) => w.weekOf === k)!;

describe("Google Classroom", () => {
  it("counts due, late and missing work by due week, with no titles", async () => {
    const urls: string[] = [];
    const g = classroomFixtureGetter();
    const r = await readClassroom(async (u) => (urls.push(u), g(u)), { now, time: utcTime });
    expect(r.courses).toBe(2);
    expect(week(r.weeks, "2026-10-19")).toMatchObject({ complete: true, contrib: { school: 0 }, show: { due: 1, late: 0, missing: 0, afterMidnight: 1 } });
    expect(week(r.weeks, "2026-10-26")).toMatchObject({ contrib: { school: 1 }, show: { late: 1 } });
    expect(week(r.weeks, "2026-11-02")).toMatchObject({ complete: true, contrib: { school: 3 }, show: { due: 3, late: 1, missing: 2, afterMidnight: 1 } });
    expect(JSON.stringify(r)).not.toMatch(/Lab report|Essay|Worksheet|Quiz prep/);
    for (const u of urls) expect(decodeURIComponent(u)).not.toMatch(/title|description/);
    expect(urls.some((u) => u.includes("studentSubmissions?userId=me"))).toBe(true);
    expect(urls.filter((u) => u.includes("pageToken=more"))).toHaveLength(1);
  });
});

describe("Google Drive activity", () => {
  it("keeps only the teen's own edits, and never asks for file names", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const p = drivePoster();
    const r = await readDriveActivity(async (url, body) => (calls.push({ url, body }), p(url, body)), { now, time: utcTime });
    expect(r.edits).toBe(6); // another person's edit and a comment are skipped
    expect(week(r.weeks, "2026-10-26").show).toMatchObject({ edits: 3, late: 1, daysWithEdits: 3 });
    expect(week(r.weeks, "2026-11-09")).toMatchObject({ contrib: { lateEvents: 1, events: 2 }, show: { daysWithEdits: 1 } });
    expect(DRIVE_FIELDS).not.toMatch(/targets|title|name/);
    expect(decodeURIComponent(calls[0].url)).toContain(`fields=${DRIVE_FIELDS}`);
    expect((calls[0].body as { filter: string }).filter).toContain("detail.action_detail_case:EDIT");
    expect(JSON.stringify(r)).not.toMatch(/Diary/);
  });
});

describe("Microsoft 365", () => {
  it("reads Sent Items only, cuts quoted and forwarded text, and times replies by Message-ID", async () => {
    const urls: string[] = [];
    const g = microsoftFixtureGetter();
    const r = await readOutlook(async (u) => (urls.push(u), g(u)), opts);
    expect(r.read).toBe(5);
    expect(r.flags).toEqual([]); // Coach Lee's quoted "nobody would miss me" is not the teen's
    const w = week(r.weeks, "2026-11-09");
    expect(w.contrib).toMatchObject({ messages: 3, replyHours: 4 }); // replies of 2 h and 6 h
    expect(w.contrib.lowMood).toBeCloseTo(1 / 3, 9);
    expect(week(r.weeks, "2026-11-02").contrib.replyHours).toBeUndefined(); // unknown parent; a reply to self
    expect(r.examWeeks).toEqual(["2026-11-16", "2026-11-30"]);
    const sentUrl = decodeURIComponent(urls.find((u) => u.includes("/mailFolders/sentitems/messages"))!);
    // Changed Nov 15: In-Reply-To comes from one extended property, so no other header downloads.
    expect(sentUrl).toContain("$select=id,sentDateTime,internetMessageId,conversationId,body");
    expect(sentUrl).toContain("$expand=singleValueExtendedProperties($filter=id eq 'String 0x1042')");
    expect(sentUrl).not.toContain("internetMessageHeaders");
    expect(sentUrl).not.toMatch(/subject|toRecipients|from/);
    for (const u of urls.filter((x) => x.includes("/me/messages?"))) expect(decodeURIComponent(u)).toContain("$select=receivedDateTime,from&");
    expect(urls.some((u) => /inbox|mailFolders\/(?!sentitems)/i.test(u))).toBe(false);
  });

  it("a forward of someone else's risk words raises no flag even when it is recent", async () => {
    const r = await readOutlook(microsoftFixtureGetter(), { ...opts, now: Date.UTC(2026, 10, 10, 18) });
    expect(r.flags).toEqual([]);
    expect(inReplyTo({ id: "x", internetMessageHeaders: [{ name: "In-Reply-To", value: " <a@b> " }] })).toBe("<a@b>");
  });
});

describe("Fitbit", () => {
  it("averages main sleep and steps per week, and leaves out naps", async () => {
    const r = await readFitbit(fitbitFixtureGetter(), { now, time: utcTime });
    const nights = (fitbitFx as { sleep: { sleep: { dateOfSleep: string; minutesAsleep: number; isMainSleep: boolean }[] } }).sleep.sleep.filter(
      (s) => s.isMainSleep && s.dateOfSleep >= "2026-10-19" && s.dateOfSleep <= "2026-10-25",
    );
    const w = week(r.weeks, "2026-10-19");
    expect(w.contrib.sleep).toBeCloseTo(nights.reduce((a, s) => a + s.minutesAsleep, 0) / nights.length / 60, 9);
    expect(w.contrib.steps).toBe(8900);
    expect(bedtimeMinutes("2026-11-09T23:30:00.000")).toBe(330);
    expect(bedtimeMinutes("2026-11-10T00:30:00.000")).toBe(390);
  });

  it("signs in with PKCE and no secret", async () => {
    const p = await pkcePair();
    expect(p.verifier.length).toBeGreaterThanOrEqual(43);
    const u = new URL(fitbitAuthUrl("CLIENT", "http://localhost:5210/auth.html", p));
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toBe(p.challenge);
    expect(u.searchParams.get("scope")).toBe("sleep activity");
    expect(u.toString()).not.toMatch(/secret/);
  });
});

describe("Canvas and Schoology (for a phone app or server)", () => {
  it("Canvas: late and missing by due week, for the teen only", async () => {
    const urls: string[] = [];
    const g = canvasFixtureGetter();
    const r = await readCanvas(async (u) => (urls.push(u), g(u)), { base: "https://school.example/", now, time: utcTime });
    expect(urls.filter((u) => u.includes("page=2"))).toHaveLength(1); // followed the Link header
    expect(r.truncated).toBe(false);
    expect(week(r.weeks, "2026-10-19").contrib.school).toBe(1);
    expect(week(r.weeks, "2026-11-02")).toMatchObject({ contrib: { school: 2 }, show: { missing: 2 } });
    expect(urls.some((u) => u.includes("student_ids[]=self"))).toBe(true);
  });

  it("Schoology: missing (exception 3) and late, with two-legged OAuth signing", async () => {
    const r = await readSchoology(schoologyFixtureGetter(), { now, time: utcTime });
    expect(week(r.weeks, "2026-11-02")).toMatchObject({ contrib: { school: 2 }, show: { late: 1, missing: 1 } });
    expect(JSON.stringify(r)).not.toMatch(/Lab report|Essay/);
    const h = schoologyAuthHeader("key", "s&ecret", "n1", 1700000000);
    expect(h).toContain('oauth_signature="s%26ecret%26"');
    expect(h).toContain('oauth_token=""');
    expect(h).toContain('oauth_signature_method="PLAINTEXT"');
  });
});

type Fx = { entries: Record<string, unknown> };

describe("data files", () => {
  it("Instagram: only the owner's messages, text repaired, others skipped unread", async () => {
    expect(repairText("Maya RÃ©")).toBe("Maya Ré");
    const r = await PARSERS.instagram(fixtureEntries((instagramFx as Fx).entries), opts);
    expect(r.othersSkipped).toBe(2); // Jordan's two messages, both with risk words
    expect(r.ownMessages).toBe(4);
    expect(r.flags).toHaveLength(1); // the owner's own recent words
    expect(r.flags[0]).toMatchObject({ at: Date.UTC(2026, 10, 14, 15), level: "concern" });
    expect(week(r.weeks, "2026-11-09")).toMatchObject({ contrib: { messages: 2, lateEvents: 2, events: 3 } });
    expect(week(r.weeks, "2026-11-02").contrib).toMatchObject({ messages: 2, events: 3, lateEvents: 0 });
  });

  it("Instagram without a profile file imports nothing", async () => {
    const entries = { ...(instagramFx as Fx).entries };
    delete entries["personal_information/personal_information/personal_information.json"];
    await expect(PARSERS.instagram(fixtureEntries(entries), opts)).rejects.toThrow(ExportError);
  });

  it("TikTok: the owner's messages and activity; others' messages are never scored, and an old search is only counted", async () => {
    const r = await PARSERS.tiktok(fixtureEntries((tiktokFx as Fx).entries), opts);
    expect(r.othersSkipped).toBe(1);
    expect(r.flags).toEqual([]);
    const w = week(r.weeks, "2026-11-09");
    expect(w.contrib).toMatchObject({ messages: 1, lowMood: 1, lateEvents: 2, events: 4 });
    expect(week(r.weeks, "2026-11-02").contrib).toMatchObject({ messages: 1, events: 3 });
    await expect(PARSERS.tiktok(fixtureEntries({ "user_data_tiktok.json": { Something: {} } }), opts)).rejects.toThrow(/layout|profile/i);
  });

  it("Snapchat: newer and older chat layouts, own chats only", async () => {
    const r = await PARSERS.snapchat(fixtureEntries((snapchatFx as Fx).entries), opts);
    expect(r.othersSkipped).toBe(1);
    expect(r.flags).toEqual([]);
    expect(week(r.weeks, "2026-11-09").contrib).toMatchObject({ messages: 2, lateEvents: 1, events: 2 });
    const old = await PARSERS.snapchat(fixtureEntries((snapchatFx as unknown as { older: Record<string, unknown> }).older), opts);
    expect(old.layout).toContain("older");
    expect(old.othersSkipped).toBe(1);
    expect(old.ownMessages).toBe(2);
  });

  it("Discord: every message is the owner's, quoted lines are cut, older CSV packages work", async () => {
    const r = await PARSERS.discord(fixtureEntries((discordFx as Fx).entries), opts);
    expect(r.flags).toEqual([]); // "> i want to die" is a quote of someone else
    const w = week(r.weeks, "2026-11-09");
    expect(w.contrib).toMatchObject({ messages: 2, lateEvents: 1, lowMood: 0.5 });
    const old = await PARSERS.discord(fixtureEntries((discordFx as unknown as { olderCsv: Record<string, unknown> }).olderCsv), opts);
    expect(old.ownMessages).toBe(2);
    expect(parseCsv('a,b\n1,"x, ""y"""\n')).toEqual([
      ["a", "b"],
      ["1", 'x, "y"'],
    ]);
  });

  it("YouTube: titles are scored and dropped, the rules get times only, and an HTML Takeout imports nothing", async () => {
    const fx = youtubeFx as unknown as Fx & { htmlNames: string[] };
    const r = await PARSERS.youtube(fixtureEntries(fx.entries), opts);
    expect(r.ownMessages).toBe(0);
    expect(r.flags).toEqual([]);
    expect(week(r.weeks, "2026-11-09").contrib).toEqual({ lateEvents: 2, events: 3 });
    await expect(PARSERS.youtube(fixtureEntries({}, fx.htmlNames), opts)).rejects.toThrow(/JSON/);
  });

  it("export times in each app's format", () => {
    expect(exportTime("2026-11-10 21:00:00")).toBe(Date.UTC(2026, 10, 10, 21));
    expect(exportTime("2026-11-12 22:00:00 UTC")).toBe(Date.UTC(2026, 10, 12, 22));
    expect(exportTime("2026-11-12 22:00:00.123456+00:00")).toBe(Date.UTC(2026, 10, 12, 22, 0, 0, 123));
    expect(exportTime(1762905600)).toBe(1762905600000);
  });

  it("reads only the wanted files out of a zip, streaming, and refuses one too big", async () => {
    const fx = (youtubeFx as unknown as Fx).entries;
    const zip = zipSync({
      "Takeout/YouTube and YouTube Music/history/watch-history.json": strToU8(JSON.stringify(fx["Takeout/YouTube and YouTube Music/history/watch-history.json"])),
      "Takeout/Drive/huge.bin": new Uint8Array(200_000),
    });
    const blob = new Blob([zip]);
    const e = await readEntries(blob, "takeout.zip", wanted("youtube"));
    expect([...e.files.keys()]).toEqual(["Takeout/YouTube and YouTube Music/history/watch-history.json"]);
    expect(e.names).toHaveLength(2);
    const small = await readEntries(blob, "takeout.zip", wanted("youtube"), 10);
    expect(small.files.size).toBe(0);
    expect(small.tooBig).toHaveLength(1);
    const r = await PARSERS.youtube(e, opts);
    expect(r.activity).toBe(3);
  });
});

describe("Android phone-data file, version 2", () => {
  it("reads Health Connect, the keyboard and flags, and still reads version 1", () => {
    const r = parseScreenTime(JSON.stringify(phoneV2), CONFIG, "UTC");
    expect(r.version).toBe(2);
    const w = r.weeks[0];
    expect(w).toMatchObject({ weekOf: "2026-10-26", sleep_days: 7, steps_days: 7, kb_days: 7, kb_messages: 235 });
    expect(w.sleep_hours).toBeCloseTo(440 / 60, 9);
    expect(w.kb_chars_per_min).toBeCloseTo(182.5, 9);
    expect(r.weeks[1].sleep_days).toBe(6); // one night has no sleep
    // Changed Nov 15: flags carry the teen's answer from the phone (null when not answered).
    expect(r.flags).toEqual([
      { id: "9f2c1e7a4b6d8e01", at: Date.UTC(2026, 10, 8, 22, 15), level: "concern", answer: "yes" },
      { id: "7e6d5c4b3a291807", at: Date.UTC(2026, 10, 9, 6, 0), level: "concern", answer: null },
    ]);
    expect(r.weeks.map((x) => x.complete)).toEqual([true, true]);
    expect(r.weeks[1].kb_days).toBe(6); // one day the keyboard was not used
    const live = liveWeekFrom({ screentime: { mode: "real", fetchedAt: 0, weeks: r.weeks, source: r.source, version: 2 } }, "2026-10-26");
    expect(live.screentime?.contrib).toMatchObject({ messages: 235, typingSpeed: 182.5, corrections: 0.06 });
    expect(live.screentime?.contrib.lowMood).toBeCloseTo(0.1, 9);
    expect(live.screentime?.contrib.sleep).toBeCloseTo(440 / 60, 9);
  });
});

describe("the window and complete weeks", () => {
  it("live API readers cover 28 days and mark the edge weeks partial", async () => {
    const r = await readClassroom(classroomFixtureGetter(), { now, time: utcTime });
    expect(r.weeks[0]).toMatchObject({ weekOf: "2026-10-12", complete: false });
    expect(r.weeks.at(-1)).toMatchObject({ weekOf: "2026-11-09", complete: false });
    expect(r.weeks.length).toBe(Math.ceil(28 / 7) + 1);
    expect(DAY).toBe(86400000);
  });
});
