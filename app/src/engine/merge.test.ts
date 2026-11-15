// The newer signals, and signals built from several sources.
import { describe, expect, it } from "vitest";
import { DAY } from "./config";
import { activeSignals, weekEndAt } from "./rules";
import { advance, applyInput, autoSetup, createWorld, nextWeekTarget, type Emitted } from "./runner";
import { SCENARIOS } from "./simulate";
import { Harness, START, W } from "./testkit";
import type { Contrib, PartId, SourceId, WeekData } from "./types";

const withParts = (parts: Partial<Record<PartId, Contrib>>, base: WeekData = W()): WeekData => ({ ...base, parts: { ...base.parts, ...parts } });

function connected(...sources: SourceId[]): Harness {
  const h = new Harness();
  for (const source of sources) h.do({ kind: "connect", source, mode: "sample" }, START - 1000);
  return h;
}

describe("new signals", () => {
  it("school joins after its own baseline, and more late or missing work is worse", () => {
    const h = connected("classroom");
    expect(activeSignals(h.s)).toContain("school");
    h.weeks(4, withParts({ classroom: { school: 0 } }));
    expect(h.s.range.school).toBeDefined();
    h.weeks(2, withParts({ classroom: { school: 3 } }));
    expect(h.s.weeks.at(-1)!.counting).toContain("school");
    expect(h.s.weeks.at(-1)!.data.mix?.school).toBe("classroom");
  });

  it("school adds Classroom, Canvas and Schoology together", () => {
    const h = connected("classroom", "canvas");
    h.week(withParts({ classroom: { school: 2 }, canvas: { school: 1 } }));
    expect(h.s.weeks[0].data.values.school).toBe(3);
  });

  it("night activity pools own activity after midnight across sources", () => {
    const h = connected("drive", "youtube");
    h.week(withParts({ drive: { lateEvents: 2, events: 40 }, youtube: { lateEvents: 8, events: 60 } }));
    expect(h.s.weeks[0].data.values.night_activity).toBeCloseTo(0.1, 9);
    expect(h.s.weeks[0].data.mix?.night_activity).toBe("drive+youtube");
    h.weeks(3, withParts({ drive: { lateEvents: 2, events: 40 }, youtube: { lateEvents: 8, events: 60 } }));
    h.weeks(2, withParts({ drive: { lateEvents: 20, events: 40 }, youtube: { lateEvents: 30, events: 60 } }));
    expect(h.s.weeks.at(-1)!.counting).toContain("night_activity");
  });

  it("slower typing and more corrections are worse", () => {
    const h = connected("screentime");
    const kb = (typingSpeed: number, corrections: number) => withParts({ screentime: { typingSpeed, corrections, messages: 100, lowMood: 0.1, sleep: 7.5, steps: 8000, screen: 240, night: 10 } });
    h.weeks(4, kb(180, 0.06));
    h.week(kb(150, 0.1));
    expect(h.s.weeks.at(-1)!.out).toEqual(expect.arrayContaining(["typing_speed", "typing_corrections"]));
    expect(h.s.weeks.at(-1)!.z.typing_speed).toBeGreaterThan(1);
    h.week(kb(200, 0.04)); // faster and cleaner is not outside
    expect(h.s.weeks.at(-1)!.out).not.toContain("typing_speed");
  });
});

describe("merged signals", () => {
  it("messages sent from every source add into reaching out; tone takes the mean", () => {
    const h = connected("discord", "instagram");
    h.week(withParts({ discord: { messages: 20, lowMood: 0.3, lateEvents: 1, events: 20 }, instagram: { messages: 5, lowMood: 0.2, lateEvents: 0, events: 10 } }, W({ reach: 10, tone: 0.1 })));
    const d = h.s.weeks[0].data;
    expect(d.values.reaching_out).toBe(35);
    expect(d.values.tone).toBeCloseTo((0.1 + 0.3 + 0.2) / 3, 9);
    expect(d.mix?.reaching_out).toBe("phone+instagram+discord");
  });

  it("sleep and steps from Fitbit and Health Connect merge with the phone's", () => {
    const h = connected("fitbit", "screentime");
    h.week(
      withParts(
        {
          fitbit: { sleep: 7.3, steps: 7600 },
          screentime: { sleep: 7.4, steps: 8200, screen: 240, night: 10, messages: 100, lowMood: 0.1, typingSpeed: 180, corrections: 0.06 },
        },
        W({ sleep: 7.5, act: 8000 }),
      ),
    );
    const d = h.s.weeks[0].data;
    expect(d.values.sleep).toBeCloseTo(7.4, 9);
    expect(d.values.activity).toBeCloseTo(7933.33, 1);
  });

  it("a merged signal learns a new range when its mix changes, and the old range comes back", () => {
    const h = new Harness().learn(); // reaching out learned from the phone alone
    const phoneOnly = h.s.range.reaching_out!;
    h.do({ kind: "connect", source: "discord", mode: "sample" }, h.weekEnd - DAY);
    expect(h.s.range.reaching_out).toBeUndefined(); // the phone+discord mix has no range yet
    const d = (n: number) => withParts({ discord: { messages: n, lowMood: 0.1, lateEvents: 1, events: n } });
    h.week(d(20));
    expect(h.s.weeks.at(-1)!.learning).toContain("reaching_out");
    expect(h.s.weeks.at(-1)!.out).not.toContain("reaching_out");
    h.weeks(3, d(20));
    expect(h.s.range.reaching_out!.mean).toBeCloseTo(30, 9);
    h.do({ kind: "disconnect", source: "discord" }, h.weekEnd - DAY);
    expect(h.s.range.reaching_out).toEqual(phoneOnly);
    expect(h.s.weeks.some((w) => (w.data.mix?.reaching_out ?? "").includes("discord") || w.data.parts?.discord)).toBe(false);
    expect(h.s.weeks.at(-1)!.data.values.reaching_out).toBe(10); // history rebuilt without Discord
  });

  it("a part that covers the week but lacks a number drops out of that signal's mix", () => {
    // Changed Nov 15: it used to leave the signal missing.
    const h = connected("discord");
    h.week(withParts({ discord: { lowMood: 0.1, lateEvents: 1, events: 5 } })); // no message count
    expect(h.s.weeks[0].data.values.reaching_out).toBe(10);
    expect(h.s.weeks[0].data.mix?.reaching_out).toBe("phone");
    expect(h.s.weeks[0].data.mix?.tone).toBe("phone+discord");
  });

  it("a real source that did not cover a week is left out of that week's mix", () => {
    const h = new Harness();
    h.do({ kind: "connect", source: "discord", mode: "real" }, START - 1000);
    h.do({ kind: "weekEnd", data: W(), live: { discord: { complete: true, contrib: { messages: 7, lowMood: 0.1, lateEvents: 0, events: 7 } } } }, weekEndAt(h.s, 1));
    h.do({ kind: "weekEnd", data: W(), live: { discord: { complete: false, contrib: { messages: 2 } } } }, weekEndAt(h.s, 2));
    expect(h.s.weeks[0].data.mix?.reaching_out).toBe("phone+discord");
    expect(h.s.weeks[1].data.mix?.reaching_out).toBe("phone");
    expect(h.s.weeks[1].data.values.reaching_out).toBe(10);
  });
});

describe("Maya with school, Drive and YouTube sample data", () => {
  it("the heads-up also names schoolwork and late-night activity", () => {
    const scn = SCENARIOS.maya;
    let world = autoSetup(createWorld(scn, "T"), scn).world;
    for (const source of ["classroom", "drive", "youtube"] as SourceId[]) world = applyInput(world, scn, { kind: "connect", source, mode: "sample" }, world.now).world;
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
    expect(notes[0].event).toMatchObject({ type: "heads_up", areas: ["sleep", "reaching_out", "school", "night_activity"], weeks: 3 });
  });
});
