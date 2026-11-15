// The Android phone-data file contract (version 2), agreed Nov 15, 2026, and the Android
// reviewer's reproductions.
import { afterEach, describe, expect, it } from "vitest";
import { CONFIG, DAY, HOUR, MINUTE } from "../engine/config";
import { Harness, W } from "../engine/testkit";
import type { Accounts } from "./accounts";
import phoneV2Before from "./fixtures/phone_data_android_v2.json";
import { clearLedger, ledgerAdd, ledgerHas } from "./ledger";
import { liveWeekFrom } from "./live";
import { parseScreenTime } from "./screentime";

const file = (days: object[], flags: object[] = [], generated = "2026-11-20T08:00:00Z") =>
  JSON.stringify({ source: "android_usage_stats", version: 2, generated, days, flags });

const day = (date: string, extra: object = {}) => ({ date, screen_minutes: 200, night_minutes: 0, first_use: "07:00", last_use: "22:00", ...extra });

describe("flags from the phone file", () => {
  afterEach(() => clearLedger());

  it("an old flag is not urgent, and its key is kept through the next export", () => {
    const h = new Harness().learn();
    const t0 = h.weekEnd - 2 * DAY;
    const key = "android:3f9a1c07d2e84b6a";
    if (!ledgerHas(key, t0)) {
      ledgerAdd(key, t0);
      h.do({ kind: "emailFlag", level: "plan", sentAt: t0 - 20 * DAY, key, source: "android" }, t0);
    }
    expect(h.of("urgent")).toHaveLength(0);
    h.weeks(2, W());
    expect(ledgerHas(key, t0 + 15 * DAY)).toBe(true); // was 14 days, so the next export flagged it again
    expect(ledgerHas(key, t0 + CONFIG.integrations.ledgerKeepMs + DAY)).toBe(false);
  });

  it('"no" on the phone sends the urgent note at once', () => {
    const h = new Harness();
    const now = Date.UTC(2026, 10, 10, 12);
    h.do({ kind: "emailFlag", level: "concern", sentAt: now - HOUR, key: "a1", source: "android", answer: "no" }, now);
    expect(h.of("urgent")).toHaveLength(1);
  });

  it('"yes" holds it, but still counts toward the 7-day rule', () => {
    const h = new Harness();
    const now = Date.UTC(2026, 10, 10, 12);
    h.do({ kind: "emailFlag", level: "concern", sentAt: now - HOUR, key: "a2", source: "android", answer: "yes" }, now);
    expect(h.of("urgent")).toHaveLength(0);
    expect(h.s.safety.screen).not.toBe("ask");
    h.do({ kind: "typed", level: "concern" }, now + 3 * DAY);
    expect(h.of("urgent")).toHaveLength(1);
  });

  it("no answer yet: the 30 minutes run from the flag time", () => {
    const now = Date.UTC(2026, 10, 10, 12);
    const late = new Harness();
    late.do({ kind: "emailFlag", level: "concern", sentAt: now - 40 * MINUTE, key: "a3", source: "android", answer: null }, now);
    expect(late.of("urgent")).toHaveLength(1);
    const soon = new Harness();
    soon.do({ kind: "emailFlag", level: "concern", sentAt: now - 10 * MINUTE, key: "a4", source: "android", answer: null }, now);
    expect(soon.of("urgent")).toHaveLength(0);
    expect(soon.s.safety.deadline).toBe(now + 20 * MINUTE);
  });

  it("the file passes each flag's answer on", () => {
    const r = parseScreenTime(
      file([day("2026-11-16")], [
        { id: "1111111111111111", time: "2026-11-19T22:00:00Z", level: "concern", answer: "yes" },
        { id: "2222222222222222", time: "2026-11-19T23:00:00Z", level: "concern", answer: "no" },
        { id: "3333333333333333", time: "2026-11-19T23:30:00Z", level: "concern", answer: null },
        { id: "4444444444444444", time: "2026-11-19T23:40:00Z", level: "plan" },
      ]),
    );
    expect(r.flags.map((f) => f.answer)).toEqual(["yes", "no", null, null]);
  });
});

describe("keyboard numbers", () => {
  it("0 means the keyboard was used and nothing was sent; null means not used; the week is the daily mean times 7", () => {
    const days = [
      day("2026-11-09", { kb_messages: 10, kb_chars_per_min: 180, kb_correction_rate: 0.05 }),
      day("2026-11-10", { kb_messages: 0, kb_chars_per_min: null, kb_correction_rate: null }),
      day("2026-11-11", { kb_messages: null }),
      day("2026-11-12", { kb_messages: 20, kb_chars_per_min: 200, kb_correction_rate: 0.07 }),
      day("2026-11-13", { kb_messages: 30, kb_chars_per_min: 190, kb_correction_rate: 0.06 }),
      day("2026-11-14", { kb_messages: null }),
      day("2026-11-15", { kb_messages: 0 }),
    ];
    const w = parseScreenTime(file(days)).weeks[0];
    expect(w.kb_days).toBe(5); // two days without the keyboard
    expect(w.kb_messages).toBe(((10 + 0 + 20 + 30 + 0) / 5) * 7);
    expect(w.kb_chars_per_min).toBeCloseTo(190, 9);
    expect(w.kb_correction_rate).toBeCloseTo(0.06, 9);
  });

  it("a correction rate above 1 (the old scale) is not read", () => {
    const w = parseScreenTime(file([day("2026-11-09", { kb_messages: 5, kb_correction_rate: 3.86 })])).weeks[0];
    expect(w.kb_correction_rate).toBeNull();
  });
});

describe("game minutes", () => {
  const week = [
    day("2026-11-09", { game_minutes: 40, night_game_minutes: 0 }),
    day("2026-11-10", { night_minutes: 60, game_minutes: 120, night_game_minutes: 45 }),
    day("2026-11-11", { game_minutes: null, night_game_minutes: null }), // saved before games were counted
    day("2026-11-12"), // no game keys at all
    day("2026-11-13", { night_minutes: 20, game_minutes: 80, night_game_minutes: 15 }),
  ];

  it("game numbers must fit inside the day's screen and night minutes", () => {
    const w = parseScreenTime(
      file([
        day("2026-11-09", { screen_minutes: 10, game_minutes: 60, night_game_minutes: 0 }), // more games than screen time
        day("2026-11-10", { night_minutes: 0, game_minutes: 30, night_game_minutes: 20 }), // night games with no night use
      ]),
    ).weeks[0];
    expect(w.game_days).toBe(1);
    expect(w.game_minutes).toBeCloseTo(30 * 7, 9);
    expect(w.night_game_minutes).toBeNull();
  });

  it("the night part is left out unless every game day has it, so it never passes the total", () => {
    const days = ["09", "10", "11", "12", "13", "14"].map((d) => day(`2026-11-${d}`, { game_minutes: 10, night_game_minutes: null }));
    days.push(day("2026-11-15", { screen_minutes: 400, night_minutes: 300, game_minutes: 300, night_game_minutes: 300 }));
    const w = parseScreenTime(file(days)).weeks[0];
    expect(w.game_minutes).toBeCloseTo(((6 * 10 + 300) / 7) * 7, 9);
    expect(w.night_game_minutes).toBeNull();
  });

  it("the week is the daily mean times 7, over the days that have game numbers", () => {
    const w = parseScreenTime(file(week)).weeks[0];
    expect(w.game_days).toBe(3);
    expect(w.game_minutes).toBeCloseTo(((40 + 120 + 80) / 3) * 7, 9);
    expect(w.night_game_minutes).toBeCloseTo(((0 + 45 + 15) / 3) * 7, 9);
  });

  it("a version 2 file from before game minutes still reads, with no game numbers", () => {
    const before = parseScreenTime(JSON.stringify(phoneV2Before), CONFIG, "UTC");
    expect(before.version).toBe(2);
    expect(before.weeks.length).toBeGreaterThan(0);
    for (const w of before.weeks) {
      expect(w.game_minutes).toBeNull();
      expect(w.night_game_minutes).toBeNull();
      expect(w.game_days).toBe(0);
    }
    // The same file with game minutes added gives the same numbers for everything else.
    const withGames = {
      ...phoneV2Before,
      days: phoneV2Before.days.map((d) => ({ ...d, game_minutes: 60, night_game_minutes: 0 })),
    };
    const after = parseScreenTime(JSON.stringify(withGames), CONFIG, "UTC");
    const strip = (ws: typeof before.weeks) => ws.map(({ game_minutes, night_game_minutes, game_days, ...rest }) => rest);
    expect(strip(after.weeks)).toEqual(strip(before.weeks));
    expect(after.weeks[0].game_minutes).toBeCloseTo(420, 9);
  });

  it("a version 1 file has no game numbers", () => {
    const v1 = JSON.stringify({ source: "android_usage_stats", version: 1, generated: "2026-11-20T08:00:00Z", days: week });
    expect(parseScreenTime(v1).weeks[0].game_minutes).toBeUndefined();
  });

  it("numbers that cannot be right are not read", () => {
    const w = parseScreenTime(
      file([
        day("2026-11-09", { game_minutes: -5, night_game_minutes: 0 }),
        day("2026-11-10", { game_minutes: 2000, night_game_minutes: 10 }),
        day("2026-11-11", { game_minutes: "90", night_game_minutes: 10 }),
        day("2026-11-12", { game_minutes: 30, night_game_minutes: 45 }), // the night part is over the day's
        day("2026-11-13", { screen_minutes: 450, game_minutes: 400, night_game_minutes: 350 }), // over 5 hours between midnight and 5 a.m.
      ]),
    ).weeks[0];
    expect(w.game_days).toBe(2);
    expect(w.game_minutes).toBeCloseTo(((30 + 400) / 2) * 7, 9);
    expect(w.night_game_minutes).toBeNull();
  });

  it("is display only: the rules get the same numbers with or without game minutes", () => {
    const days = ["09", "10", "11", "12", "13", "14", "15"].map((d) =>
      day(`2026-11-${d}`, { night_minutes: 40, kb_messages: 20, kb_chars_per_min: 180, kb_low_mood_share: 0.2, sleep_minutes: 400, steps: 6000 }),
    );
    const account = (text: string): Accounts => ({
      screentime: { mode: "real", fetchedAt: 0, weeks: parseScreenTime(text).weeks, source: "android_usage_stats", version: 2 },
    });
    const plain = liveWeekFrom(account(file(days)), "2026-11-09");
    const gamed = liveWeekFrom(account(file(days.map((d) => ({ ...d, game_minutes: 180, night_game_minutes: 40 })))), "2026-11-09");
    expect(plain.screentime?.contrib).toBeDefined();
    expect(gamed).toEqual(plain);
    expect(JSON.stringify(gamed)).not.toMatch(/game/i);
  });
});

describe("the native app's sample file", () => {
  const files = import.meta.glob("../../../native/sample/steady_android_v2_sample.json", { eager: true, query: "?raw", import: "default" }) as Record<string, string>;
  const text = Object.values(files)[0];
  const days: { kb_correction_rate?: number | null }[] = text ? JSON.parse(text).days ?? [] : [];
  const oldScale = days.some((d) => typeof d.kb_correction_rate === "number" && d.kb_correction_rate > 1);

  it.skipIf(!text || oldScale)(
    `reads native/sample/steady_android_v2_sample.json${!text ? " (skipped: the file is not there)" : oldScale ? " (skipped: it still uses the old correction scale, above 1)" : ""}`,
    () => {
      const r = parseScreenTime(text, undefined, "America/Los_Angeles");
      expect(r.version).toBe(2);
      expect(r.days).toBeGreaterThan(0);
      for (const w of r.weeks) {
        if (w.kb_correction_rate != null) expect(w.kb_correction_rate).toBeLessThanOrEqual(1);
        if (w.kb_messages != null) expect(w.kb_messages).toBeGreaterThanOrEqual(0);
        if (w.game_minutes != null && w.night_game_minutes != null) expect(w.night_game_minutes).toBeLessThanOrEqual(w.game_minutes);
      }
      expect(r.weeks.some((w) => (w.game_minutes ?? 0) > 0)).toBe(true);
      for (const f of r.flags) expect([null, "yes", "no"]).toContain(f.answer);
    },
  );
});
