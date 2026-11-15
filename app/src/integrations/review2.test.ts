// Regression tests from the two reviews of the newer sources (Nov 15, 2026). Each started as a
// reproduction in the reviewers' scratch folder and failed before its fix.
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { CONFIG, DAY, HOUR, MINUTE, type Config } from "../engine/config";
import { checkSelfHarm } from "../engine/selfharm";
import { combine } from "../engine/sources";
import { textHash } from "../engine/hash";
import { Harness, START } from "../engine/testkit";
import { mondayOfYmd, utcTime, type TimeFns } from "./common";
import { ownWords } from "./gmail";
import { dueAt, readClassroom, schoolItems } from "./classroom";
import { fitbitWeeks } from "./fitbit";
import { importExport, PARSERS, repairText, wanted } from "./exports";
import { readEntries, streamEntries } from "./zip";
import { parseScreenTime } from "./screentime";
import { liveWeekFrom } from "./live";
import { linkNext, readSchoology } from "./school";
import { classroomFixtureGetter, fixtureEntries, schoologyFixtureGetter, SAMPLE_NOW } from "./sample";

const NOW = START + 3 * DAY;

function phoneFile(flags: { id: string; time: string; level: string; answer?: string | null }[]) {
  return JSON.stringify({
    source: "android_usage_stats",
    version: 2,
    generated: new Date(NOW).toISOString(),
    days: [{ date: "2026-11-02", screen_minutes: 100, night_minutes: 0, first_use: "07:00", last_use: "22:00" }],
    flags,
  });
}

const ig = (name: string, msgs: { s: string; t: number; c: string }[], participants: string[] = ["Sam", name], thread = "sam_1") => ({
  "personal_information/personal_information/personal_information.json": { profile_user: [{ string_map_data: { Name: { value: name }, Username: { value: "maya.real" } } }] },
  [`your_instagram_activity/messages/inbox/${thread}/message_1.json`]: {
    participants: participants.map((n) => ({ name: n })),
    messages: msgs.map((m) => ({ sender_name: m.s, timestamp_ms: m.t, content: m.c })),
  },
});

const opts = { now: NOW, tone: null, time: utcTime };

describe("1. old flags from files never reach the urgent path", () => {
  it("a 27-day-old plan flag sends nothing", () => {
    const r = parseScreenTime(phoneFile([{ id: "aaaaaaaaaaaaaaaa", time: new Date(NOW - 27 * DAY).toISOString(), level: "plan" }]));
    const h = new Harness();
    for (const f of r.flags) h.do({ kind: "emailFlag", level: f.level, sentAt: f.at, key: "android:" + f.id, source: "android", answer: f.answer }, NOW);
    expect(h.of("urgent")).toHaveLength(0);
    expect(h.s.trace.at(-1)!.text).toMatch(/^The Stability keyboard on Android .*not from the last 24 hours/);
  });

  it("two old concern flags (10 and 9 days ago) send nothing", () => {
    const r = parseScreenTime(
      phoneFile([
        { id: "bbbbbbbbbbbbbbbb", time: new Date(NOW - 10 * DAY).toISOString(), level: "concern" },
        { id: "cccccccccccccccc", time: new Date(NOW - 9 * DAY).toISOString(), level: "concern" },
      ]),
    );
    const h = new Harness();
    for (const f of r.flags) h.do({ kind: "emailFlag", level: f.level, sentAt: f.at, key: "android:" + f.id, source: "android" }, NOW);
    expect(h.of("urgent")).toHaveLength(0);
    expect(h.s.safety.flags).toHaveLength(0);
  });

  it("a flag from the future is refused", () => {
    const h = new Harness();
    h.do({ kind: "emailFlag", level: "plan", sentAt: NOW + HOUR, key: "f", source: "instagram" }, NOW);
    expect(h.of("urgent")).toHaveLength(0);
  });

  it("the trace names the real source", () => {
    const h = new Harness();
    h.do({ kind: "emailFlag", level: "plan", sentAt: NOW - HOUR, key: "ig1", source: "instagram" }, NOW);
    expect(h.of("urgent")).toHaveLength(1);
    expect(h.s.trace.at(-1)!.text).toMatch(/^An Instagram message has words that state a plan/);
  });

  it("the ledger keeps keys for at least 35 days", () => {
    expect(CONFIG.integrations.ledgerKeepMs).toBeGreaterThanOrEqual(35 * DAY);
  });
});

describe("2. stable keys, and one message counted once across sources", () => {
  it("re-exporting with a newer message in front gives the same key", async () => {
    const risky = { s: "Maya", t: NOW - 2 * HOUR, c: "i want to die" };
    const a = await PARSERS.instagram(fixtureEntries(ig("Maya", [risky])), opts);
    const b = await PARSERS.instagram(fixtureEntries(ig("Maya", [{ s: "Maya", t: NOW - HOUR, c: "ok" }, risky], undefined, "renamed_thread_9")), opts);
    expect(a.flags[0].key).toBe(b.flags[0].key);
    const h = new Harness();
    h.do({ kind: "emailFlag", level: a.flags[0].level, sentAt: a.flags[0].at, key: a.flags[0].key, textHash: a.flags[0].textHash, source: "instagram" }, NOW);
    h.do({ kind: "safe", answer: "yes" }, NOW + MINUTE);
    h.do({ kind: "emailFlag", level: b.flags[0].level, sentAt: b.flags[0].at, key: b.flags[0].key, textHash: b.flags[0].textHash, source: "instagram" }, NOW + HOUR);
    expect(h.of("urgent")).toHaveLength(0);
  });

  it("the same words from the keyboard and an email within 2 minutes are one message", () => {
    const h = new Harness();
    const hash = textHash("I just feel like nobody would miss me");
    h.do({ kind: "typed", level: "concern", textHash: hash }, NOW);
    h.do({ kind: "safe", answer: "yes" }, NOW + 30 * 1000);
    h.do({ kind: "emailFlag", level: "concern", sentAt: NOW + 60 * 1000, key: "g1", textHash: textHash("i just  feel like NOBODY would miss me"), source: "gmail" }, NOW + 2 * MINUTE);
    expect(h.of("urgent")).toHaveLength(0); // without the dedupe this was a "second flag within 7 days"
    expect(h.s.safety.flags).toHaveLength(1);
  });
});

describe("3. Instagram finds the owner per conversation", () => {
  it("a friend with the same display name makes the conversation unreadable, not the owner's", async () => {
    const files = {
      ...ig("Sam", [{ s: "Sam", t: NOW - HOUR, c: "i want to die" }], ["Sam", "Sam"]),
      "your_instagram_activity/messages/inbox/jo_3/message_1.json": { participants: [{ name: "Jo" }, { name: "Sam" }], messages: [{ sender_name: "Sam", timestamp_ms: NOW - 2 * HOUR, content: "see you" }] },
    };
    const r = await PARSERS.instagram(fixtureEntries(files), opts);
    expect(r.flags).toHaveLength(0);
    expect(r.unreadable).toBe(1);
    expect(r.ownMessages).toBe(1);
    expect(r.notes.join(" ")).toMatch(/1 conversation was skipped/);
    // With nothing else readable, nothing is imported and the teen is told why.
    await expect(PARSERS.instagram(fixtureEntries(ig("Sam", [{ s: "Sam", t: NOW - HOUR, c: "i want to die" }], ["Sam", "Sam"])), opts)).rejects.toThrow(/couldn't tell which messages were yours/);
  });

  it("a conversation the owner is not part of is skipped", async () => {
    const files = {
      ...ig("Maya", [{ s: "Maya", t: NOW - HOUR, c: "hi" }]),
      "your_instagram_activity/messages/inbox/other_2/message_1.json": { participants: [{ name: "Jo" }, { name: "Al" }], messages: [{ sender_name: "Jo", timestamp_ms: NOW - HOUR, content: "i want to die" }] },
    };
    const r = await PARSERS.instagram(fixtureEntries(files), opts);
    expect(r.unreadable).toBe(1);
    expect(r.flags).toHaveLength(0);
  });

  it("a chat line that starts with From: is still the teen's own words", async () => {
    const r = await PARSERS.instagram(fixtureEntries(ig("Maya", [{ s: "Maya", t: NOW - HOUR, c: "from: me\nto: you\ni want to die" }])), opts);
    expect(r.flags).toHaveLength(1);
    // Emails still cut header blocks; chats do not.
    expect(ownWords("from: me\nto: you\ni want to die").text).toBe("");
    const wrote = await PARSERS.instagram(fixtureEntries(ig("Maya", [{ s: "Maya", t: NOW - HOUR, c: "Sam wrote: lol\nhonestly i want to die" }])), opts);
    expect(wrote.flags).toHaveLength(1);
  });

  it("repaired Instagram text is checked the same as the original", () => {
    const moji = (s: string) => Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join("");
    for (const s of ["I’ll end my life tonight \u{1F622}", "i’m gonna kms fr \u{1F480}", "Tonight I’m going to kill myself", "ok é"]) {
      expect(repairText(moji(s))).toBe(s);
      expect(checkSelfHarm(repairText(moji(s)))).toEqual(checkSelfHarm(s));
    }
  });
});

describe("4 and 5. partial weeks and the export's own coverage", () => {
  it("an export holding two weeks of messages makes no empty complete weeks before them", async () => {
    const msgs = Array.from({ length: 40 }, (_, i) => ({ s: "Maya", t: NOW - i * 8 * HOUR, c: "hey" }));
    const r = await PARSERS.instagram(fixtureEntries(ig("Maya", msgs)), opts);
    expect(r.weeks.filter((w) => w.complete && w.contrib.messages === 0)).toHaveLength(0);
    expect(r.weeks[0].complete).toBe(false); // the first week starts with the first message
    expect(r.weeks.at(-1)!.complete).toBe(false); // the week of the latest message
    expect(r.weeks[0].weekOf).toBe(utcTime.week(NOW - 39 * 8 * HOUR));
  });

  it("the phone file's week that was still going is partial, and keyboard messages are a weekly rate", () => {
    const days = [];
    for (let d = 2; d <= 12; d++)
      days.push({ date: `2026-11-${String(d).padStart(2, "0")}`, screen_minutes: 200, night_minutes: 5, first_use: "07:00", last_use: "22:00", kb_messages: 20, kb_chars_per_min: 180, kb_correction_rate: 0.05, kb_low_mood_share: 0.1 });
    const r = parseScreenTime(JSON.stringify({ source: "android_usage_stats", version: 2, generated: "2026-11-12T20:00:00Z", days }));
    const acc = { screentime: { mode: "real" as const, fetchedAt: 0, weeks: r.weeks, source: r.source, version: 2 as const } };
    const full = liveWeekFrom(acc, "2026-11-02").screentime!;
    const part = liveWeekFrom(acc, "2026-11-09").screentime!;
    expect(full).toMatchObject({ complete: true, contrib: { messages: 140 } });
    expect(part.complete).toBe(false);
    expect(r.weeks[1].kb_messages).toBe(140); // 20 a day, not 80 for four days
  });
});

describe("6. Classroom due times, late work and cut lists", () => {
  it("a dueTime of {} is 00:00 UTC; no dueTime is 23:59 on the teen's clock", () => {
    expect(dueAt({ id: "x", dueDate: { year: 2026, month: 11, day: 16 }, dueTime: {} })).toBe(Date.UTC(2026, 10, 16, 0, 0));
    expect(dueAt({ id: "y", dueDate: { year: 2026, month: 11, day: 16 }, dueTime: { hours: 13 } })).toBe(Date.UTC(2026, 10, 16, 13, 0));
    expect(dueAt({ id: "z", dueDate: { year: 2026, month: 11, day: 16 } }, "America/Los_Angeles")).toBe(Date.UTC(2026, 10, 17, 7, 59));
  });

  it("late counts only work turned in or returned", () => {
    const work = [{ id: "a", dueDate: { year: 2026, month: 11, day: 3 }, dueTime: { hours: 7 } }];
    const items = schoolItems(work, [{ courseWorkId: "a", state: "NEW", late: true }], SAMPLE_NOW);
    expect(items[0]).toMatchObject({ late: false, missing: true });
  });

  it("a cut submissions list leaves weeks partial and invents no missing work", async () => {
    const work = [{ id: "a", dueDate: { year: 2026, month: 11, day: 3 }, dueTime: { hours: 7 } }];
    expect(schoolItems(work, [], SAMPLE_NOW, { subsComplete: false })).toEqual([]);
    const cfg: Config = { ...CONFIG, integrations: { ...CONFIG.integrations, maxPages: 1 } };
    const r = await readClassroom(classroomFixtureGetter(), { now: SAMPLE_NOW, time: utcTime, cfg });
    expect(r.truncated).toBe(true);
    expect(r.weeks.every((w) => !w.complete)).toBe(true);
  });
});

describe("7. a covering source lacking one number drops out of that signal's mix", () => {
  it("a Fitbit week with steps only keeps the phone's sleep", () => {
    const h = new Harness();
    h.do({ kind: "connect", source: "fitbit", mode: "real", provides: ["sleep", "steps"] }, START - 1000);
    const { values, mix } = combine(h.s, { phone: { sleep: 7.5, steps: 8000, messages: 10, lowMood: 0.1 }, fitbit: { steps: 9000 } });
    expect(values.sleep).toBe(7.5);
    expect(mix.sleep).toBe("phone");
    expect(values.activity).toBe(8500);
  });

  it("an Instagram week with no scored messages keeps the keyboard's tone", () => {
    const h = new Harness();
    h.do({ kind: "connect", source: "instagram", mode: "real", provides: ["messages", "lowMood", "lateEvents", "events"] }, START - 1000);
    const { values, mix } = combine(h.s, { phone: { sleep: 7.5, steps: 8000, messages: 10, lowMood: 0.1 }, instagram: { messages: 0, lateEvents: 0, events: 3 } });
    expect(values.tone).toBe(0.1);
    expect(mix.tone).toBe("phone");
    expect(values.reaching_out).toBe(10);
  });
});

describe("8. oversize entries are reported, capped and never HTML", () => {
  const profile = ig("Maya", [])["personal_information/personal_information/personal_information.json"];
  const zip = () =>
    new Blob([
      zipSync({
        "personal_information/personal_information/personal_information.json": strToU8(JSON.stringify(profile)),
        "messages/inbox/a_1/message_1.json": strToU8(JSON.stringify({ participants: [{ name: "Jo" }, { name: "Maya" }], messages: [{ sender_name: "Maya", timestamp_ms: NOW - DAY, content: "hi" }] })),
        "messages/inbox/b_2/message_1.json": strToU8(
          JSON.stringify({ participants: [{ name: "Jo" }, { name: "Maya" }], messages: Array.from({ length: 200 }, (_, i) => ({ sender_name: "Maya", timestamp_ms: NOW - i * HOUR, content: "x".repeat(50) })) }),
        ),
        "messages/inbox/b_2/message_1.html": strToU8("<html>someone's words</html>"),
      }),
    ]);

  it("one oversize conversation makes the import partial, with a message", async () => {
    const cfg: Config = { ...CONFIG, integrations: { ...CONFIG.integrations, maxEntryBytes: 5000 } };
    const r = await importExport(zip(), "x.zip", "instagram", { ...opts, cfg });
    expect(r.tooBig).toEqual(["messages/inbox/b_2/message_1.json"]);
    expect(r.truncated).toBe(true);
    expect(r.weeks.every((w) => !w.complete)).toBe(true);
    expect(r.notes[0]).toMatch(/too big to read/);
    // The same through files already unpacked.
    const ent = await readEntries(zip(), "x.zip", () => true, 5000);
    expect(ent.tooBig).toHaveLength(1);
    const p = await PARSERS.instagram(ent, { ...opts, cfg });
    expect(p.truncated).toBe(true);
    expect(p.weeks.filter((w) => w.complete)).toHaveLength(0);
  });

  it("a total cap stops unpacking", async () => {
    const seen: string[] = [];
    const r = await streamEntries(zip(), "x.zip", () => true, (p) => void seen.push(p), { maxTotal: 300 });
    expect(r.tooBig.length).toBeGreaterThan(0);
  });

  it("HTML files are never unpacked", async () => {
    expect(wanted("instagram")("messages/inbox/b_2/message_1.html")).toBe(false);
    expect(wanted("youtube")("Takeout/YouTube and YouTube Music/history/watch-history.html")).toBe(false);
    const e = await readEntries(zip(), "x.zip", wanted("instagram"));
    expect([...e.files.keys()].some((k) => k.endsWith(".html"))).toBe(false);
    expect(e.names.some((k) => k.endsWith(".html"))).toBe(true);
  });
});

describe("9. Fitbit dates are local dates", () => {
  it("a Sunday night stays in its own week whatever the clock offset", () => {
    // A clock 13 hours ahead of UTC, as in Auckland.
    const ahead: TimeFns = { ...utcTime, week: (ms) => utcTime.week(ms + 13 * HOUR), hour: (ms) => utcTime.hour(ms + 13 * HOUR) };
    const wk = fitbitWeeks([{ date: "2026-11-15", hours: 7, bedtime: 300 }], [], { from: Date.UTC(2026, 10, 1), to: Date.UTC(2026, 10, 25) }, ahead);
    const holder = wk.find((w) => (w.show.nights as number) > 0)!;
    expect(holder.weekOf).toBe(mondayOfYmd("2026-11-15"));
    expect(holder.weekOf).toBe("2026-11-09");
  });
});

describe("10. paging for Canvas and Schoology", () => {
  it("reads rel=next from a Link header", () => {
    expect(linkNext('<https://x.example/api/v1/a?page=2>; rel="next", <https://x.example/api/v1/a?page=9>; rel="last"')).toBe("https://x.example/api/v1/a?page=2");
    expect(linkNext('<https://x.example/api/v1/a?page=1>; rel="first"')).toBeNull();
  });

  it("Schoology follows links.next and says when the cap cut it", async () => {
    const r = await readSchoology(schoologyFixtureGetter(), { now: SAMPLE_NOW, time: utcTime });
    expect(r.truncated).toBe(false);
    expect(r.weeks.find((w) => w.weekOf === "2026-11-02")!.contrib.school).toBe(2);
    const cut = await readSchoology(schoologyFixtureGetter(), { now: SAMPLE_NOW, time: utcTime, cfg: { ...CONFIG, integrations: { ...CONFIG.integrations, maxPages: 1 } } });
    expect(cut.truncated).toBe(true);
    expect(cut.weeks.every((w) => !w.complete)).toBe(true);
  });
});
