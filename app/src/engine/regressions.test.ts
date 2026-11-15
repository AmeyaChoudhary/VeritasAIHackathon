// One test per finding in the Codex review of the rules engine (Nov 14, 2026).
// Each failed before its fix.
import { describe, expect, it } from "vitest";
import { CONFIG, DAY, HOUR, MINUTE } from "./config";
import { dayEndAt, skipRuleHolds, weekEndAt } from "./rules";
import { connection, urgentView, type Note } from "./parent";
import { advance, autoSetup, createWorld, nextWeekTarget, type Emitted } from "./runner";
import { SCENARIOS, at, type Scenario } from "./simulate";
import { HIGH_SETUP, Harness, LOW_SETUP, OUT2, START, W } from "./testkit";

function playAll(scn: Scenario): Emitted[] {
  let world = createWorld(scn, "TEST");
  const s = autoSetup(world, scn);
  world = s.world;
  const emitted = [...s.emitted];
  for (let guard = 0; guard < 40; guard++) {
    const target = nextWeekTarget(world, scn);
    if (target == null) break;
    const r = advance(world, target, scn);
    world = r.world;
    emitted.push(...r.emitted);
  }
  return emitted;
}

const notesOf = (e: Emitted[]) => e.filter((x) => x.event.type !== "status");

describe("review fixes", () => {
  it("1. nothing is asked or sent while Steady is off, after a high setup score", () => {
    const h = new Harness(HIGH_SETUP);
    expect(h.headsUps()).toHaveLength(1);
    h.do({ kind: "setOff", off: true }, START + HOUR);
    h.weeks(6, W());
    expect(h.headsUps()).toHaveLength(1);
    expect(h.s.ask).toBeNull();
    expect(h.s.asks.filter((a) => a.kind === "recheck")).toHaveLength(0);
  });

  it("1b. an open check-in is dropped, not counted as skipped, when Steady is turned off", () => {
    const h = new Harness().learn().weeks(2, OUT2); // ask at week 6
    h.do({ kind: "setOff", off: true }, h.weekEnd - 5 * DAY);
    h.weeks(4, OUT2);
    expect(h.s.asks.filter((a) => a.result === "skipped")).toHaveLength(0);
    expect(h.headsUps()).toHaveLength(0);
    expect(h.s.ask).toBeNull();
  });

  it("2. the routine check still comes when a signal never gets a baseline", () => {
    const h = new Harness(LOW_SETUP);
    h.weeks(8, W({ sleep: 5.5 })); // sleep stays under the fixed limit, so it never learns
    expect(h.s.range.sleep).toBeUndefined();
    expect(h.s.ask?.reason).toBe("anyway");
  });

  it("3. a week that ends with the three-week limit is processed before held evidence is re-checked", () => {
    const h = new Harness().learn().weeks(2, OUT2);
    for (let i = 0; i < 4; i++) {
      h.skip();
      h.week(OUT2); // weeks 7 to 10; heads-up at 8, held at 9 and 10
    }
    expect(h.headsUps()).toHaveLength(1);
    h.skip();
    h.week(W()); // week 11: back in range, at the same moment the limit ends
    expect(h.headsUps()).toHaveLength(1);
  });

  it("3b. the runner processes that week before the held evidence too", () => {
    const base = SCENARIOS.skips;
    const weeks = [...base.weeks.slice(0, 10), base.weeks[0], base.weeks[1]];
    const scn: Scenario = { ...base, weeks };
    const hu = notesOf(playAll(scn)).filter((x) => x.event.type === "heads_up");
    expect(hu).toHaveLength(1);
  });

  it("4. signals that take turns do not make two signals outside for four weeks", () => {
    const h = new Harness().learn();
    h.week(OUT2); // 5
    h.week(OUT2); // 6: ask
    h.skip();
    h.week(OUT2); // 7: ask
    h.skip();
    h.week(W({ sleep: 6.5, act: 7000 })); // 8: reaching out back, activity out for the first time
    expect(skipRuleHolds(h.s)).toBe(false);
    expect(h.headsUps()).toHaveLength(0);
  });

  it("5. an unanswered urgent note keeps repeating with no cap", () => {
    const n: Note = { id: "u", at: START, event: { type: "urgent", sent_at: "" }, bytes: 0, json: "" };
    const v = urgentView(n, [], START + 3 * DAY, false);
    expect(v.repeatCount).toBe((3 * DAY) / CONFIG.urgentRepeatMs);
    expect(v.repeats[v.repeats.length - 1]).toBe(START + 3 * DAY);
    const replied = urgentView(n, [{ noteId: "u", choice: "with_her", at: START + 10 * MINUTE }], START + DAY, false);
    expect(replied.repeatCount).toBe(1); // 5 minutes; the 10-minute repeat is cut by the reply
  });

  it("6. a week that was mostly switched off is not counted, even if Steady is back on by its end", () => {
    const h = new Harness().learn(); // weeks 1 to 4
    const first = 4 * 7; // Monday of week 5
    h.do({ kind: "setOff", off: true }, START + first * DAY + HOUR);
    for (let d = first; d < first + 6; d++) h.do({ kind: "dayEnd", day: d, hasData: true, keyboardUsed: true }, dayEndAt(h.s, d));
    h.do({ kind: "setOff", off: false }, START + (first + 6) * DAY + 12 * HOUR);
    h.week(OUT2);
    expect(h.s.weeks.at(-1)!.valid).toBe(false);
    expect(h.s.runs.sleep).toBe(0);
  });

  it("7. the parent app shows Not connected if no first status ever arrives", () => {
    expect(connection([], START + 2 * HOUR, CONFIG, START).state).toBe("waiting");
    expect(connection([], START + 27 * HOUR, CONFIG, START).state).toBe("not_connected");
  });

  it("8. the first status does not claim enough data before any was collected", () => {
    const h = new Harness();
    h.do({ kind: "dayEnd", day: 0, hasData: false, keyboardUsed: true }, dayEndAt(h.s, 0));
    expect(h.of("status")[0].e).toMatchObject({ enough_data: false });
  });

  it("9. the runner plays script steps in time order, whatever the array order", () => {
    const base = SCENARIOS.urgent_concern;
    const text = base.messages[0].text;
    const scn: Scenario = {
      ...base,
      messages: [
        { id: "late", at: at(2, 3, 12), text, expect: "concern" },
        { id: "early", at: at(1, 1, 12), text, expect: "concern" },
      ],
      stops: [],
    };
    const urgent = notesOf(playAll(scn)).filter((x) => x.event.type === "urgent");
    expect(urgent[0].at).toBe(at(1, 1, 12) + CONFIG.safeAnswerTimeoutMs);
    expect(urgent).toHaveLength(2);
  });

  it("week ends still close on time in the runner", () => {
    const scn = SCENARIOS.maya;
    const e = playAll(scn);
    const hu = notesOf(e).filter((x) => x.event.type === "heads_up");
    expect(hu).toHaveLength(1);
    expect(hu[0].at).toBe(weekEndAt(createWorld(scn, "T").teen, 8) + 30 * MINUTE);
  });
});
