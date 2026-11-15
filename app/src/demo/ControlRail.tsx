import { useSnap, useStore } from "../store/hooks";
import { SPEEDS, weekLabel } from "../engine/clock";
import { DAY, MINUTE } from "../engine/config";
import { iso } from "../engine/rules";
import { nextWeekTarget } from "../engine/runner";
import { SCENARIOS, SCENARIO_ORDER, type ScenarioId } from "../engine/simulate";
import { EventLog } from "./EventLog";
import { HowWeKnow } from "./HowWeKnow";

export function ControlRail() {
  const snap = useSnap();
  const store = useStore();
  const { sim, now } = snap;
  const scn = SCENARIOS[sim.world.scenarioId];
  const teen = sim.world.teen;
  const wl = weekLabel(now, scn.startAt);
  const before = now < scn.startAt;
  const done = nextWeekTarget(sim.world, scn) == null;

  return (
    <div className="rail-body">
      <h2>Scenario</h2>
      <label className="sr-only" htmlFor="scn">
        Scenario
      </label>
      <select id="scn" value={sim.world.scenarioId} onChange={(e) => store.dispatch({ a: "reset", scenario: e.target.value as ScenarioId })}>
        {SCENARIO_ORDER.map((id) => (
          <option key={id} value={id}>
            {SCENARIOS[id].title}
          </option>
        ))}
      </select>
      <p className="small muted" style={{ margin: "8px 0 12px" }}>
        {scn.blurb}
      </p>
      <div className="btn-row">
        <button className="btn btn-primary" onClick={() => store.dispatch({ a: "nextWeek" })} disabled={done}>
          Next week
        </button>
        <button className="btn" onClick={() => store.dispatch({ a: "play", on: !sim.playing })} disabled={done && !sim.playing} aria-pressed={sim.playing}>
          {sim.playing ? "Pause" : "Play"}
        </button>
        <button className="btn" onClick={() => store.dispatch({ a: "reset", scenario: sim.world.scenarioId })}>
          Reset
        </button>
      </div>
      <label className="small" style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 44, marginTop: 6 }}>
        <input type="checkbox" checked={sim.world.scripted} onChange={(e) => store.dispatch({ a: "scripted", on: e.target.checked })} />
        Scripted answers and replies
      </label>
      {!teen.setupDone && (
        <p className="small muted" style={{ margin: "0 0 6px" }}>
          Pair and set up on the phones, or press Next week to do it with the scripted answers.
        </p>
      )}
      {sim.lastStop && (
        <p className="small" role="status" style={{ margin: "6px 0" }}>
          Stopped: {sim.lastStop.label}. Next week carries on.
        </p>
      )}
      {done && <p className="small muted">End of the scenario. The clock can still run.</p>}

      <h2>Clock</h2>
      <div className="clock" aria-live="off">
        {before ? "SETUP" : `WEEK ${wl.week}`} · {wl.day.toUpperCase()} {wl.time}
      </div>
      <div className="small mono muted" style={{ marginBottom: 8 }}>
        {iso(now)} {sim.clock.running ? `· RUNNING` : "· PAUSED"}
      </div>
      <div className="seg" role="group" aria-label="Clock speed" style={{ marginBottom: 8 }}>
        {SPEEDS.map((s) => (
          <button key={s.value} className="btn btn-sm" aria-pressed={sim.clock.speed === s.value} onClick={() => store.dispatch({ a: "speed", speed: s.value })}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="btn-row">
        <button className="btn btn-sm" onClick={() => store.dispatch({ a: "run", on: !sim.clock.running })} aria-pressed={sim.clock.running}>
          {sim.clock.running ? "Pause clock" : "Run clock"}
        </button>
        <button className="btn btn-sm" onClick={() => store.dispatch({ a: "jump", ms: 5 * MINUTE })}>
          +5 MIN
        </button>
        <button className="btn btn-sm" onClick={() => store.dispatch({ a: "jump", ms: 30 * MINUTE })}>
          +30 MIN
        </button>
        <button className="btn btn-sm" onClick={() => store.dispatch({ a: "jump", ms: DAY })}>
          +1 DAY
        </button>
      </div>

      <h2>How we know</h2>
      <HowWeKnow />

      <h2>Event log</h2>
      <EventLog />

      <h2>Two tabs</h2>
      <p className="small">
        Open <a href="#/teen">#/teen</a> and <a href="#/parent">#/parent</a> in two tabs of this browser. They stay in sync with no network.
      </p>
      <p className="small muted">Prototype. Not medical advice.</p>
    </div>
  );
}
