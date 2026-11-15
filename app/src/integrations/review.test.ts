// One test (or more) per finding in the Codex review of connected accounts (Nov 14, 2026).
import { afterEach, describe, expect, it } from "vitest";
import { CONFIG, DAY, HOUR, MINUTE, type Config } from "../engine/config";
import { checkSelfHarm } from "../engine/selfharm";
import { weekEndAt } from "../engine/rules";
import { advance, applyInput, autoSetup, createWorld, nextWeekTarget, type Emitted, type LiveLookup, type World } from "../engine/runner";
import { SCENARIOS } from "../engine/simulate";
import { MemoryTransport, allowlisted } from "../engine/transport";
import { Harness, START, W } from "../engine/testkit";
import type { SourceId } from "../engine/types";
import type { Wire } from "../engine/transport";
import quotes from "./fixtures/gmail_quotes.json";
import lastfmLive from "./fixtures/lastfm_live.json";
import { utcTime } from "./common";
import { emailKey, ownWords, plainTextOf, readGmail, replyHoursFor, type GmailMessage, type MessagePart } from "./gmail";
import { readLastfm } from "./lastfm";
import { parseScreenTime, phoneFreeHours } from "./screentime";
import { clearAccounts, getAccounts, saveAccount } from "./accounts";
import { clearLedger, ledgerAdd, ledgerHas } from "./ledger";
import { liveWeekFrom } from "./live";
import { gmailFixtureGetter, lastfmFixtureGetter, sampleLastfm, SAMPLE_NOW } from "./sample";
import gmailFx from "./fixtures/gmail.json";

const fx = gmailFx as unknown as { threads: Record<string, { messages: GmailMessage[] }> };

describe("1. quoted and forwarded text is never scored as the teen's", () => {
  const cases = quotes as unknown as Record<string, { payload: MessagePart; own: string | null }>;

  for (const [name, c] of Object.entries(cases)) {
    it(`${name}`, () => {
      const raw = plainTextOf(c.payload);
      expect(raw).not.toBeNull();
      const own = ownWords(raw!);
      if (c.own === null) {
        expect(own.separable).toBe(false);
      } else {
        expect(own).toEqual({ text: c.own, separable: true });
        expect(checkSelfHarm(own.text).level).toBe("none");
      }
    });
  }

  it("a recent forward with someone else's risk words raises no flag", async () => {
    // m8s, sent 9 hours before the reference time, forwards "I want to die" under "FYI".
    const r = await readGmail(gmailFixtureGetter(), { now: SAMPLE_NOW, tone: null, time: utcTime });
    expect(r.flags).toEqual([]);
  });

  it("the sent-email download asks only for what scoring needs", async () => {
    const urls: string[] = [];
    const get = gmailFixtureGetter();
    await readGmail(async (u) => (urls.push(u), get(u)), { now: SAMPLE_NOW, tone: null, time: utcTime });
    const full = urls.filter((u) => u.includes("format=full"));
    expect(full.length).toBeGreaterThan(0);
    for (const u of full) {
      const fields = new URL(u).searchParams.get("fields")!;
      expect(fields).toContain("payload(mimeType,body/data,parts(");
      expect(fields).not.toMatch(/headers|snippet|threadId/);
    }
  });
});

describe("2. one email is flagged once, through a disconnect and reconnect", () => {
  afterEach(() => clearLedger());

  it("the engine ignores an email flag it has already seen", () => {
    const h = new Harness();
    const sentAt = START + 2 * DAY;
    h.do({ kind: "connect", source: "gmail", mode: "real" }, START + 3 * DAY);
    h.do({ kind: "emailFlag", level: "concern", sentAt, key: "k1" }, START + 3 * DAY);
    h.do({ kind: "safe", answer: "yes" }, START + 3 * DAY + MINUTE);
    h.do({ kind: "disconnect", source: "gmail" }, START + 3 * DAY + HOUR);
    h.do({ kind: "connect", source: "gmail", mode: "real" }, START + 3 * DAY + 2 * HOUR);
    h.do({ kind: "emailFlag", level: "concern", sentAt, key: "k1" }, START + 3 * DAY + 2 * HOUR);
    expect(h.of("urgent")).toHaveLength(0);
    expect(h.s.safety.flags).toHaveLength(1);
  });

  it("an email flag counts at the email's own sent time", () => {
    const h = new Harness();
    const now = START + 10 * DAY;
    // Changed Nov 15: item flags older than 24 hours no longer reach the urgent path, so the
    // email here is 20 hours old instead of 3 days.
    h.do({ kind: "emailFlag", level: "concern", sentAt: now - 20 * HOUR, key: "k2" }, now);
    h.do({ kind: "safe", answer: "yes" }, now + MINUTE);
    expect(h.s.safety.flags[0].at).toBe(now - 20 * HOUR);
    h.do({ kind: "typed", level: "concern" }, now - 20 * HOUR + 7 * DAY); // 7 days after the email was sent
    expect(h.of("urgent")).toHaveLength(1);
  });

  it("the phone's ledger keeps opaque keys for at least 7 days, through a disconnect", async () => {
    const key = await emailKey("maya.r@example.com", "m5s");
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(key).not.toContain("m5s");
    expect(await emailKey("someone@example.com", "m5s")).not.toBe(key);
    const t = Date.UTC(2026, 10, 4);
    ledgerAdd(key, t);
    saveAccount("gmail", undefined); // disconnect
    expect(ledgerHas(key, t + 7 * DAY)).toBe(true);
    expect(ledgerHas(key, t + CONFIG.integrations.ledgerKeepMs + DAY)).toBe(false);
  });
});

/** Play the Maya story with accounts and live data, through a transport. */
function playMaya(connect: { source: SourceId; mode: "real" | "sample" }[], live?: LiveLookup) {
  const scn = SCENARIOS.maya;
  let world: World = autoSetup(createWorld(scn, "T"), scn).world;
  for (const c of connect) world = applyInput(world, scn, { kind: "connect", ...c }, world.now).world;
  const tr = new MemoryTransport();
  const emitted: Emitted[] = [];
  for (let i = 0; i < 12; i++) {
    const t = nextWeekTarget(world, scn);
    if (t == null) break;
    const r = advance(world, t, scn, { live });
    world = r.world;
    emitted.push(...r.emitted);
    for (const e of r.emitted) tr.send(e.event, { at: e.at, from: "teen", to: ["Mom"] });
  }
  return { world, emitted, tr };
}

describe("3. real accounts feed the engine their own numbers, by week", () => {
  afterEach(() => clearAccounts());

  it("connecting real accounts never switches on the scenario's made-up values", () => {
    const { tr } = playMaya([
      { source: "gmail", mode: "real" },
      { source: "lastfm", mode: "real" },
    ]);
    const notes = tr.list().filter((r) => r.event.type === "heads_up");
    expect(notes.map((n) => n.json)).toEqual(['{"type":"heads_up","areas":["sleep","reaching_out"],"weeks":4,"sent_at":"2026-12-27T21:30:00Z"}']);
  });

  it("reader output goes through account storage to the engine and out through the transport", async () => {
    const now = Date.parse((lastfmLive as { referenceTime: string }).referenceTime);
    const r = await readLastfm(lastfmFixtureGetter(lastfmLive as { pages: unknown[] }), { user: "x", apiKey: "k", now, time: utcTime });
    saveAccount("lastfm", { mode: "real", fetchedAt: now, weeks: r.weeks, plays: r.plays, truncated: r.truncated });
    const live: LiveLookup = (weekOf) => liveWeekFrom(getAccounts(), weekOf);
    const { world, tr } = playMaya([{ source: "lastfm", mode: "real" }], live);
    const music = world.teen.weeks.map((w) => w.data.values.music);
    // Weeks 2, 3 and 4 of the story are the complete real weeks of Nov 9, 16 and 23.
    expect(music.slice(0, 5)).toEqual([undefined, 0.2, 0.5, 0, undefined]);
    expect(music.slice(5).every((m) => m === undefined)).toBe(true);
    // Three weeks are not a baseline, so music never joins the rules, and the note is unchanged.
    expect(world.teen.range.music).toBeUndefined();
    const hu = tr.list().filter((x) => x.event.type === "heads_up");
    expect(hu).toHaveLength(1);
    expect(hu[0].json).toBe('{"type":"heads_up","areas":["sleep","reaching_out"],"weeks":4,"sent_at":"2026-12-27T21:30:00Z"}');
    expect(hu[0].at).toBe(weekEndAt(world.teen, 8) + 30 * MINUTE);
  });

  it("an incomplete week is not an observation", () => {
    saveAccount("lastfm", {
      mode: "real",
      fetchedAt: 0,
      plays: 5,
      truncated: false,
      weeks: [{ weekOf: "2026-11-09", complete: false, plays: 5, late_share: 0.9, repetition: 0 }],
    });
    expect(liveWeekFrom(getAccounts(), "2026-11-09").lastfm?.complete).toBe(false);
    const h = new Harness();
    h.do({ kind: "connect", source: "lastfm", mode: "real" }, START - 1000);
    // The scenario's own value (0.1) is dropped in real mode, and the incomplete real week adds nothing.
    h.do({ kind: "weekEnd", data: { ...W(), values: { ...W().values, music: 0.1 } }, live: liveWeekFrom(getAccounts(), "2026-11-09") }, weekEndAt(h.s, 1));
    expect(h.s.weeks[0].data.values.music).toBeUndefined();
  });
});

describe("4. disconnecting forgets everything derived from the account", () => {
  it("Gmail: tone goes back to the keyboard's, and its history and range are gone", () => {
    const h = new Harness();
    h.do({ kind: "connect", source: "gmail", mode: "sample" }, START - 1000);
    h.weeks(4, { ...W({ tone: 0.1 }), emailTone: 0.9 });
    expect(h.s.range.tone!.mean).toBeCloseTo(0.5, 9);
    h.do({ kind: "disconnect", source: "gmail" }, h.weekEnd - 1000);
    expect(h.s.range.tone).toBeUndefined();
    expect(h.s.learn.tone).toEqual([]);
    for (const w of h.s.weeks) {
      expect(w.data.values.tone).toBeCloseTo(0.1, 9);
      expect(w.data.emailTone).toBeUndefined();
      expect(w.data.keyboardTone).toBeUndefined();
    }
  });

  it("Last.fm: no week keeps a music value, mark or range", () => {
    const h = new Harness();
    h.do({ kind: "connect", source: "lastfm", mode: "sample" }, START - 1000);
    const m = (v: number) => ({ ...W(), values: { ...W().values, music: v } });
    h.weeks(4, m(0.08));
    h.weeks(2, m(0.4));
    expect(h.s.weeks.at(-1)!.out).toContain("music");
    h.do({ kind: "disconnect", source: "lastfm" }, h.weekEnd - 1000);
    expect(h.s.weeks.some((w) => w.data.values.music !== undefined || w.out.includes("music") || w.ranges.music)).toBe(false);
  });

  it("a question set asked because of that account is dropped, not skipped", () => {
    const h = new Harness();
    h.do({ kind: "connect", source: "lastfm", mode: "sample" }, START - 1000);
    const m = (v: number, sleep = 7.5) => ({ ...W({ sleep }), values: { ...W({ sleep }).values, music: v } });
    h.weeks(4, m(0.08));
    h.weeks(2, m(0.4, 6.5)); // sleep and music outside for two weeks: asked
    expect(h.s.ask?.reason).toBe("signals");
    expect(h.s.episode).not.toBeNull();
    h.do({ kind: "disconnect", source: "lastfm" }, h.weekEnd - 1000);
    expect(h.s.ask).toBeNull();
    expect(h.s.episode).toBeNull();
    // only the monthly ask at week 4 counts as skipped; the set asked because of the account was dropped
    expect(h.s.asks.filter((a) => a.result === "skipped").map((a) => a.id)).toEqual(["check-w4"]);
  });

  it("safety handling that already happened stays", () => {
    const h = new Harness();
    h.do({ kind: "connect", source: "gmail", mode: "real" }, START);
    h.do({ kind: "emailFlag", level: "concern", sentAt: START, key: "k" }, START + HOUR);
    h.do({ kind: "disconnect", source: "gmail" }, START + HOUR + 10 * MINUTE); // the question is still open
    expect(h.s.safety.flags).toHaveLength(1);
    expect(h.s.safety.deadline).not.toBeNull();
  });
});

describe("5. tone learns again when Gmail joins it", () => {
  it("a new mix is never compared with the keyboard's old range", () => {
    const h = new Harness().learn(); // keyboard tone 0.1 learned
    h.do({ kind: "connect", source: "gmail", mode: "sample" }, h.weekEnd - 1000);
    expect(h.s.range.tone).toBeUndefined();
    h.week({ ...W({ tone: 0.1 }), emailTone: 0.9 });
    expect(h.s.weeks.at(-1)!.out).not.toContain("tone");
    expect(h.s.weeks.at(-1)!.learning).toContain("tone");
  });

  it("a week without Gmail's share uses the keyboard's tone alone, compared with the keyboard-only range", () => {
    // Changed Nov 15: a source that covers the week but lacks a number drops out of that
    // week's mix (it used to erase the signal). Ranges are kept per mix, so this week is
    // compared with the keyboard-only range, never with the mixed one.
    const h = new Harness();
    h.do({ kind: "connect", source: "gmail", mode: "sample" }, START - 1000);
    h.week(W({ tone: 0.1 }));
    expect(h.s.weeks[0].data.values.tone).toBe(0.1);
    expect(h.s.weeks[0].data.mix?.tone).toBe("phone");
    expect(h.s.weeks[0].data.keyboardTone).toBe(0.1);
  });
});

describe("6. iPhone screen minutes come as buckets too", () => {
  it("reads >=180 and <60 for screen minutes", () => {
    const text = JSON.stringify({
      source: "ios_device_activity",
      version: 1,
      generated: "2026-11-02T08:00:00Z",
      days: [{ date: "2026-10-26", screen_minutes: ">=180", night_minutes: ">=30", first_use: null, last_use: null }],
    });
    expect(parseScreenTime(text).weeks[0]).toMatchObject({ screen_minutes: 180, night_minutes: 30, screen_days: 1 });
  });
});

describe("7. reply time uses Message-ID and In-Reply-To", () => {
  it("a reply to the earlier of two messages counts from that one", () => {
    expect(replyHoursFor(fx.threads.t7, "m7s")).toBeCloseTo(2, 9); // not 1 hour from the later message
  });
  it("an answered message that can't be found is unknown", () => {
    expect(replyHoursFor(fx.threads.t9, "m9s")).toBeNull();
    expect(replyHoursFor(fx.threads.t8, "m8s")).toBeNull();
  });
});

describe("8. the phone-free window follows the exporter's dates", () => {
  const day = (date: string, first: string | null, last: string | null) => ({ date, screen_minutes: 100, night_minutes: 0, first_use: first, last_use: last });

  it("last_use belongs to its own date", () => {
    // Use ended at 01:00 on Nov 9, first use 07:00 on Nov 10: 30 hours apart, not a night.
    expect(phoneFreeHours(day("2026-11-09", "07:00", "01:00"), day("2026-11-10", "07:00", "23:00"), CONFIG, "UTC")).toBeNull();
  });
  it("use past midnight, or a first use at night, gives no estimate", () => {
    expect(phoneFreeHours(day("2026-11-09", "07:00", "23:59"), day("2026-11-10", "07:00", "23:00"), CONFIG, "UTC")).toBeNull();
    expect(phoneFreeHours(day("2026-11-09", "07:00", "23:00"), day("2026-11-10", "01:15", "23:00"), CONFIG, "UTC")).toBeNull();
  });
  it("counts the hour when clocks change", () => {
    // Los Angeles leaves daylight saving time at 2 a.m. on Nov 1, 2026.
    expect(phoneFreeHours(day("2026-10-31", "07:00", "23:00"), day("2026-11-01", "07:00", "23:00"), CONFIG, "America/Los_Angeles")).toBe(9);
    expect(phoneFreeHours(day("2026-11-09", "07:00", "23:00"), day("2026-11-10", "07:00", "23:00"), CONFIG, "America/Los_Angeles")).toBe(8);
  });
});

describe("9. paging is bounded, de-duplicated and says when it is incomplete", () => {
  const now = Date.parse((lastfmLive as { referenceTime: string }).referenceTime);
  const get = () => lastfmFixtureGetter(lastfmLive as { pages: unknown[] });

  it("Last.fm: a fixed window, one count per play, and plays outside it dropped", async () => {
    const urls: string[] = [];
    const g = get();
    const r = await readLastfm(async (u) => (urls.push(u), g(u)), { user: "x", apiKey: "k", now, time: utcTime });
    expect(r.plays).toBe(32); // the play repeated across pages counts once; the future and old plays are out
    expect(new URL(urls[0]).searchParams.get("to")).toBe(String(Math.floor(now / 1000)));
    expect(r.weeks.map((w) => [w.weekOf, w.complete, w.plays])).toEqual([
      ["2026-11-02", false, 3],
      ["2026-11-09", true, 10],
      ["2026-11-16", true, 10],
      ["2026-11-23", true, 8],
      ["2026-11-30", false, 1],
    ]);
    expect(r.weeks[2].repetition).toBeCloseTo(0.7, 9);
    expect(r.truncated).toBe(false);
  });

  it("Last.fm: stopping at the page cap is reported, and older weeks are incomplete", async () => {
    const cfg: Config = { ...CONFIG, integrations: { ...CONFIG.integrations, lastfmMaxPages: 1 } };
    const r = await readLastfm(get(), { user: "x", apiKey: "k", now, time: utcTime, cfg });
    expect(r.truncated).toBe(true);
    expect(r.weeks[0]).toMatchObject({ weekOf: "2026-11-16", complete: false });
  });

  it("Gmail: the cap on sent emails is reported, and the weeks it cut are incomplete", async () => {
    const cfg: Config = { ...CONFIG, integrations: { ...CONFIG.integrations, maxSentEmails: 4 } };
    const r = await readGmail(gmailFixtureGetter(), { now: SAMPLE_NOW, tone: null, time: utcTime, cfg });
    expect(r.truncated).toBe(true);
    expect(r.read).toBe(4);
    expect(r.weeks.every((w) => !w.complete)).toBe(true);
  });
});

describe("10. the Last.fm username is not kept", () => {
  afterEach(() => clearAccounts());
  it("nothing stored names the profile", async () => {
    const r = await sampleLastfm(utcTime);
    saveAccount("lastfm", { mode: "sample", fetchedAt: 0, ...r });
    expect(JSON.stringify(getAccounts())).not.toMatch(/maya_fixture|"user"/);
  });
});

describe("11. screen-time files are validated", () => {
  const file = (days: unknown[]) => JSON.stringify({ source: "android_usage_stats", version: 1, generated: "2026-11-02T08:00:00Z", days });

  it("a date listed twice is refused", () => {
    const d = { date: "2026-10-26", screen_minutes: 60, night_minutes: 0, first_use: "07:00", last_use: "23:00" };
    expect(() => parseScreenTime(file([d, d, { ...d, date: "2026-10-27", screen_minutes: 180 }]))).toThrow(/twice/);
  });

  it("days are counted per measurement, and impossible dates and values are left out", () => {
    const r = parseScreenTime(
      file([
        { date: "2026-10-26", screen_minutes: 60, night_minutes: null, first_use: null, last_use: null },
        { date: "2026-10-27", screen_minutes: 180, night_minutes: 10, first_use: null, last_use: null },
        { date: "2026-10-28", screen_minutes: 2000, night_minutes: 999, first_use: null, last_use: null },
        { date: "2026-02-30", screen_minutes: 100, night_minutes: 0, first_use: null, last_use: null },
      ]),
    );
    expect(r.days).toBe(3);
    expect(r.weeks[0]).toMatchObject({ days: 3, screen_minutes: 120, screen_days: 2, night_minutes: 10, night_days: 1 });
  });
});

describe("12. account numbers stay in memory when storage fails", () => {
  const g = globalThis as { localStorage?: unknown };
  afterEach(() => {
    delete g.localStorage;
    clearAccounts();
  });
  it("a failed write keeps the numbers for this page", () => {
    g.localStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => undefined,
    };
    saveAccount("calendar", { mode: "sample", fetchedAt: 1, weeks: [{ weekOf: "2026-11-16", exam: true }], events: 3 });
    expect(getAccounts().calendar?.events).toBe(3);
  });
});

describe("only schema fields are ever sent", () => {
  it("drops extra fields and keeps schema order", () => {
    const tr = new MemoryTransport();
    const r = tr.send({ sent_at: "2026-11-14T21:30:00Z", weeks: 2, areas: ["sleep"], type: "heads_up", text: "secret" } as unknown as Wire, {
      at: 0,
      from: "teen",
      to: ["Mom"],
    });
    expect(r.json).toBe('{"type":"heads_up","areas":["sleep"],"weeks":2,"sent_at":"2026-11-14T21:30:00Z"}');
    expect(allowlisted({ type: "status", enough_data: true, keyboard_used: false, sent_at: "2026-11-14T00:00:00Z", extra: 1 } as unknown as Wire)).toEqual({
      type: "status",
      enough_data: true,
      keyboard_used: false,
      sent_at: "2026-11-14T00:00:00Z",
    });
  });

  it("refuses malformed events", () => {
    expect(() => allowlisted({ type: "urgent", sent_at: "yesterday" } as unknown as Wire)).toThrow();
    expect(() => allowlisted({ type: "heads_up", areas: ["sleep", "messages"], weeks: 2, sent_at: "2026-11-14T21:30:00Z" } as unknown as Wire)).toThrow();
    expect(() => allowlisted({ type: "heads_up", areas: ["sleep"], sent_at: "2026-11-14T21:30:00Z" } as unknown as Wire)).toThrow();
    expect(() => allowlisted({ type: "note", sent_at: "2026-11-14T21:30:00Z" } as unknown as Wire)).toThrow();
  });
});
