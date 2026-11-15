// Signals from connected accounts: they reach the rules only once connected, and join the
// drift rules only after their own four-week baseline.
import { describe, expect, it } from "vitest";
import { activeSignals, weekEndAt } from "./rules";
import { advance, applyInput, autoSetup, createWorld, nextWeekTarget, type Emitted } from "./runner";
import { SCENARIOS } from "./simulate";
import { Harness, START, W } from "./testkit";
import type { SourceId, WeekData } from "./types";

const withMusic = (music: number, extra: Partial<WeekData> = {}): WeekData => ({ ...W(), ...extra, values: { ...W().values, music } });

describe("connected signals", () => {
  it("are ignored until the account is connected", () => {
    const h = new Harness();
    h.weeks(2, withMusic(0.9));
    expect(h.s.learn.music).toEqual([]);
    expect(h.s.weeks.at(-1)!.data.values.music).toBeUndefined();
    expect(activeSignals(h.s)).toEqual(["sleep", "reaching_out", "activity", "tone"]);
  });

  it("join the drift rules only after their own four-week baseline", () => {
    const h = new Harness().learn(); // weeks 1-4 learn the phone's own signals
    h.do({ kind: "connect", source: "lastfm", mode: "sample" }, h.weekEnd - 3 * 24 * 3600000);
    expect(activeSignals(h.s)).toContain("music");
    h.week(withMusic(0.08)); // week 5: music starts learning
    expect(h.s.weeks.at(-1)!.learning).toEqual(["music"]);
    h.weeks(3, withMusic(0.08)); // weeks 6-8
    expect(h.s.range.music).toBeDefined();
    expect(h.s.runs.music).toBe(0);
    h.week(withMusic(0.3)); // week 9: outside for the first time
    expect(h.s.weeks.at(-1)!.out).toEqual(["music"]);
    h.week(withMusic(0.3)); // week 10: now it counts
    expect(h.s.weeks.at(-1)!.counting).toEqual(["music"]);
  });

  it("a value seen while still learning never counts as outside", () => {
    const h = new Harness().learn();
    h.do({ kind: "connect", source: "lastfm", mode: "real" }, h.weekEnd - 1000);
    h.week(withMusic(0.95));
    expect(h.s.weeks.at(-1)!.out).toEqual([]);
  });

  it("disconnecting forgets what was learned from that account", () => {
    const h = new Harness();
    h.do({ kind: "connect", source: "lastfm", mode: "sample" }, START - 1000);
    h.weeks(4, withMusic(0.08));
    expect(h.s.range.music).toBeDefined();
    h.do({ kind: "disconnect", source: "lastfm" }, h.weekEnd - 1000);
    expect(h.s.range.music).toBeUndefined();
    expect(h.s.learn.music).toEqual([]);
    expect(activeSignals(h.s)).not.toContain("music");
  });

  it("Gmail's low-mood share merges into tone with the keyboard's", () => {
    const h = new Harness();
    h.do({ kind: "connect", source: "gmail", mode: "sample" }, START - 1000);
    h.week({ ...W({ tone: 0.1 }), emailTone: 0.3 });
    expect(h.s.weeks.at(-1)!.data.values.tone).toBeCloseTo(0.2, 9);
    const off = new Harness();
    off.week({ ...W({ tone: 0.1 }), emailTone: 0.3 });
    expect(off.s.weeks.at(-1)!.data.values.tone).toBeCloseTo(0.1, 9);
  });

  it("calendar context shows only when the calendar is connected", () => {
    const h = new Harness();
    h.week({ ...W(), calendar: "Finals" });
    expect(h.s.weeks.at(-1)!.data.calendar).toBeUndefined();
    h.do({ kind: "connect", source: "calendar", mode: "sample" }, h.weekEnd - 1000);
    h.week({ ...W(), calendar: "Finals" });
    expect(h.s.weeks.at(-1)!.data.calendar).toBe("Finals");
  });

  it("Maya with Last.fm and Gmail connected: the heads-up also names late listening and slower replies", () => {
    const scn = SCENARIOS.maya;
    let world = autoSetup(createWorld(scn, "T"), scn).world;
    for (const source of ["lastfm", "gmail"] as SourceId[]) {
      world = applyInput(world, scn, { kind: "connect", source, mode: "sample" }, world.now).world;
    }
    const emitted: Emitted[] = [];
    for (let i = 0; i < 12; i++) {
      const t = nextWeekTarget(world, scn);
      if (t == null) break;
      const r = advance(world, t, scn);
      world = r.world;
      emitted.push(...r.emitted);
    }
    const notes = emitted.filter((e) => e.event.type !== "status");
    expect(notes).toHaveLength(1);
    expect(notes[0].event).toMatchObject({ type: "heads_up", areas: ["sleep", "reaching_out", "music", "replies"], weeks: 4 });
    expect(notes[0].at).toBe(weekEndAt(world.teen, 8) + 30 * 60000);
  });
});
