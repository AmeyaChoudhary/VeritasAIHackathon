import { describe, expect, it } from "vitest";
import { MINUTE } from "./config";
import { advance, autoSetup, createWorld, nextWeekTarget, type Emitted, type World } from "./runner";
import { weekEndAt } from "./rules";
import { checkSelfHarm } from "./selfharm";
import { SCENARIOS, SCENARIO_ORDER, at, type ScenarioId } from "./simulate";
import { parseBodyCsv, parseSpotify } from "./importers";
import { ASK_THRESHOLD } from "./askmodel";

function play(id: ScenarioId, stopAtStops = false): { world: World; emitted: Emitted[]; stops: string[] } {
  const scn = SCENARIOS[id];
  let world = createWorld(scn, "TEST");
  const s = autoSetup(world, scn);
  world = s.world;
  const emitted = [...s.emitted];
  const stops: string[] = [];
  for (let guard = 0; guard < 60; guard++) {
    const target = nextWeekTarget(world, scn) ?? world.now + 3 * 24 * 60 * MINUTE;
    const r = advance(world, target, scn, { stopAtStops });
    world = r.world;
    emitted.push(...r.emitted);
    if (r.stop) stops.push(r.stop.label);
    if (!r.stop && world.teen.week >= scn.weeks.length) break;
  }
  return { world, emitted, stops };
}

const notes = (e: Emitted[]) => e.filter((x) => x.event.type !== "status");

describe("scenarios", () => {
  it("scripted messages give the level each scenario expects", () => {
    for (const id of SCENARIO_ORDER) {
      for (const m of SCENARIOS[id].messages) expect(checkSelfHarm(m.text).level, `${id} ${m.id}`).toBe(m.expect);
    }
  });

  it("Maya's 12 weeks: one heads-up to Mom at the end of week 8, about sleep and messaging for 4 weeks", () => {
    const { world, emitted } = play("maya");
    const n = notes(emitted);
    expect(n).toHaveLength(1);
    expect(n[0].event).toEqual({ type: "heads_up", areas: ["sleep", "reaching_out"], weeks: 4, sent_at: "2026-12-27T21:30:00Z" });
    expect(n[0].at).toBe(weekEndAt(world.teen, 8) + 30 * MINUTE);
    // Week 4 is the monthly ask: a total of 2, under the cutoff, taken at her word.
    // Her check-ins then get more stressed, the ask model's score crosses its threshold, and it
    // asks again in week 6 instead of waiting for week 8. From then on the model does the asking.
    // Her phone signals are outside the range from week 5 but never ask: she is checking in.
    expect(world.teen.asks.filter((a) => a.kind === "check").map((a) => [a.week, a.reason, a.result])).toEqual([
      [4, "anyway", "low"],
      [6, "model", "low"],
      [8, "model", "high"],
      [10, "model", "low"],
      [12, "model", "low"],
    ]);
    const scores = world.teen.weeks.map((r) => r.askScore ?? 0);
    expect(scores[3]).toBeLessThan(ASK_THRESHOLD); // week 4
    expect(scores[5]).toBeGreaterThan(ASK_THRESHOLD); // week 6
    expect(world.teen.week).toBe(12);
    // status went out once a day
    expect(emitted.filter((x) => x.event.type === "status").length).toBeGreaterThanOrEqual(83);
  });

  it("Steady week to week: no notes", () => {
    const { emitted, world } = play("steady");
    expect(notes(emitted)).toHaveLength(0);
    const st = emitted.filter((x) => x.event.type === "status").map((x) => x.event as { enough_data: boolean; keyboard_used: boolean });
    expect(st.some((s) => !s.enough_data)).toBe(true);
    expect(st.some((s) => !s.keyboard_used)).toBe(true);
    // the two questions once a month: weeks 4, 8 and 12, all answered low
    expect(world.teen.asks.filter((a) => a.kind === "check").map((a) => [a.week, a.result])).toEqual([[4, "low"], [8, "low"], [12, "low"]]);
  });

  it("Skips the questions: the four-week rule sends a heads-up, and a second one waits three weeks", () => {
    const { emitted, world } = play("skips");
    const n = notes(emitted);
    expect(n.map((x) => x.event.type)).toEqual(["heads_up", "heads_up"]);
    expect(n[0].event).toMatchObject({ areas: ["sleep", "reaching_out"], weeks: 4 });
    expect(n[0].at).toBe(weekEndAt(world.teen, 8));
    expect(n[1].at - n[0].at).toBe(21 * 24 * 60 * MINUTE);
  });

  it("Urgent: plan words send an urgent note at once", () => {
    const { emitted, stops } = play("urgent_plan", true);
    const n = notes(emitted);
    expect(n).toHaveLength(1);
    expect(n[0].event.type).toBe("urgent");
    expect(n[0].at).toBe(at(3, 2, 23, 10));
    expect(stops).toEqual(["Message typed"]);
  });

  it("Urgent: concern with no answer sends the urgent note after 30 minutes", () => {
    const { emitted, stops } = play("urgent_concern", true);
    const n = notes(emitted);
    expect(n).toHaveLength(1);
    expect(n[0].event.type).toBe("urgent");
    expect(n[0].at).toBe(at(3, 3, 22, 40) + 30 * MINUTE);
    expect(stops).toEqual(["Message typed", "30 minutes, no answer", "15 more minutes, no reply"]);
  });
});

describe("import my data", () => {
  it("reads Spotify history in both formats", () => {
    const basic = JSON.stringify([
      { endTime: "2026-10-05 23:30", msPlayed: 3600000 },
      { endTime: "2026-10-06 01:30", msPlayed: 1800000 },
    ]);
    const r = parseSpotify(basic);
    expect(r.plays).toBe(2);
    expect(r.weeks.reduce((a, w) => a + w.hours, 0)).toBeCloseTo(1.5, 5);
    const ext = JSON.stringify([{ ts: "2026-10-05T12:00:00Z", ms_played: 600000 }]);
    expect(parseSpotify(ext).plays).toBe(1);
    expect(() => parseSpotify("[]")).toThrow();
  });

  it("reads the sleep and steps CSV template", () => {
    const r = parseBodyCsv("date,sleep_hours,steps\n2026-10-05,7.5,8000\n2026-10-06,6.5,9000\n2026-10-13,7,7000\n");
    expect(r.rows).toBe(3);
    expect(r.weeks).toHaveLength(2);
    expect(r.weeks[0].sleep).toBeCloseTo(7, 5);
    expect(r.weeks[0].days).toBe(2);
    expect(() => parseBodyCsv("a,b\n1,2")).toThrow();
  });
});
