import { useSnap, useStore } from "../store/hooks";
import { SPEEDS, weekLabel } from "../engine/clock";
import { DAY, MINUTE } from "../engine/config";
import { iso } from "../engine/rules";
import { nextWeekTarget } from "../engine/runner";
import { SCENARIOS, SCENARIO_ORDER, type ScenarioId } from "../engine/simulate";
import { EventLog } from "./EventLog";
import { HowWeKnow } from "./HowWeKnow";
import { Icon } from "../ui/icons";
import { Wordmark } from "../teen/Top";

/** Short names for the scenario pills. The full title and blurb are the pill's tooltip. */
const PILL: Record<ScenarioId, string> = {
  maya: "Maya's 12 weeks",
  steady: "In range",
  skips: "Skips the questions",
  urgent_plan: "Urgent: plan",
  urgent_concern: "Urgent: concern",
};

function useDemo() {
  const snap = useSnap();
  const store = useStore();
  const { sim, now } = snap;
  const scn = SCENARIOS[sim.world.scenarioId];
  const teen = sim.world.teen;
  const wl = weekLabel(now, scn.startAt);
  const before = now < scn.startAt;
  const done = nextWeekTarget(sim.world, scn) == null;
  return { snap, store, sim, now, scn, teen, wl, before, done };
}

export function ScenarioSelect() {
  const { store, sim } = useDemo();
  return (
    <>
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
    </>
  );
}

export function ScenarioPills() {
  const { store, sim } = useDemo();
  return (
    <div className="pills" role="group" aria-label="Scenario">
      {SCENARIO_ORDER.map((id) => (
        <button
          key={id}
          className="pill"
          aria-pressed={sim.world.scenarioId === id}
          title={`${SCENARIOS[id].title}. ${SCENARIOS[id].blurb}`}
          onClick={() => store.dispatch({ a: "reset", scenario: id })}
        >
          {PILL[id]}
        </button>
      ))}
    </div>
  );
}

export function Transport() {
  const { store, sim, done } = useDemo();
  return (
    <div className="transport">
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
  );
}

export function ScriptedToggle() {
  const { store, sim } = useDemo();
  return (
    <label className="scripted">
      <input type="checkbox" checked={sim.world.scripted} onChange={(e) => store.dispatch({ a: "scripted", on: e.target.checked })} />
      Scripted answers and replies
    </label>
  );
}

/** A dot for each week: grey while the range is learned, sage in range, amber when two or
 *  more signals are outside. A ring marks a week in which a note left the phone. */
export function WeekTimeline() {
  const { snap, scn, teen, now } = useDemo();
  const total = Math.max(12, scn.weeks.length);
  const noteWeeks = new Set(
    snap.events
      .filter((e) => e.from === "teen" && e.event.type !== "status" && e.at <= now)
      .map((e) => weekLabel(e.at, scn.startAt).week),
  );
  return (
    <ol className="timeline" aria-label={`Week ${teen.week || 0} of ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const w = i + 1;
        const rec = teen.weeks.find((r) => r.week === w);
        const state = !rec ? "todo" : !rec.valid ? "gap" : rec.out.length >= 2 ? "out" : rec.learning.includes("sleep") ? "learning" : "in";
        return (
          <li key={w} className={`tl is-${state}${w === teen.week ? " now" : ""}${noteWeeks.has(w) ? " note" : ""}`} aria-hidden="true">
            <i />
            <span>{w}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function ClockReadout() {
  const { wl, before, sim } = useDemo();
  return (
    <div className="clock" aria-live="off">
      {before ? "SETUP" : `WEEK ${wl.week}`} · {wl.day.toUpperCase()} {wl.time}
      {sim.clock.running ? <i className="pulse-dot amber" aria-hidden="true" /> : null}
    </div>
  );
}

function StopLine() {
  const { sim, done, teen } = useDemo();
  if (sim.lastStop)
    return (
      <p className="stopline" role="status">
        Stopped: {sim.lastStop.label}. Next week carries on.
      </p>
    );
  if (done) return <p className="stopline muted">End of the scenario. The clock can still run.</p>;
  if (!teen.setupDone) return <p className="stopline muted">Pair and set up on the phones, or press Next week to do it with the scripted answers.</p>;
  return null;
}

export function ClockPanel() {
  const { store, sim, now } = useDemo();
  return (
    <>
      <ClockReadout />
      <div className="small mono muted" style={{ margin: "2px 0 10px" }}>
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
    </>
  );
}

function Evidence() {
  return (
    <>
      <h2>Clock</h2>
      <ClockPanel />

      <h2>How we know</h2>
      <HowWeKnow />

      <h2>Event log</h2>
      <EventLog />

      <h2>Two tabs</h2>
      <p className="small">
        Open <a href="#/teen">#/teen</a> and <a href="#/parent">#/parent</a> in two tabs of this browser. They stay in sync with no network.
      </p>
      <p className="small muted">Prototype. Not medical advice.</p>
    </>
  );
}

/** The slim bar above the two phones on a wide screen. */
export function ControlBar({ drawerOpen, onDrawer }: { drawerOpen: boolean; onDrawer: () => void }) {
  return (
    <>
      <div className="bar-row">
        <div className="brand">
          <Wordmark>Stability</Wordmark>
          <span className="label">Prototype. Not medical advice.</span>
        </div>
        <ScenarioPills />
        <button className="btn btn-sm drawer-btn" aria-expanded={drawerOpen} aria-controls="evidence" onClick={onDrawer}>
          <Icon name="chart" size={16} />
          Evidence and log
        </button>
      </div>
      <div className="bar-row">
        <Transport />
        <WeekTimeline />
        <ClockReadout />
        <ScriptedToggle />
      </div>
      <StopLine />
    </>
  );
}

/** How we know, the event log and the clock speeds. Closed until asked for. */
export function EvidenceDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      <div className={`scrim${open ? " on" : ""}`} onClick={onClose} aria-hidden="true" />
      <aside id="evidence" className={`drawer${open ? " on" : ""}`} aria-label="Evidence and log" aria-hidden={!open} inert={!open}>
        <div className="drawer-head">
          <span className="label">Evidence and log</span>
          <button className="btn btn-sm" onClick={onClose}>
            <Icon name="x" size={16} />
            Close
          </button>
        </div>
        <div className="rail-body">{open && <Evidence />}</div>
      </aside>
    </>
  );
}

/** Every control in one column. Used on a narrow screen, where there is no bar. */
export function ControlRail() {
  const { scn } = useDemo();
  return (
    <div className="rail-body">
      <h2>Scenario</h2>
      <ScenarioSelect />
      <p className="small muted" style={{ margin: "8px 0 12px" }}>
        {scn.blurb}
      </p>
      <Transport />
      <ScriptedToggle />
      <StopLine />
      <WeekTimeline />
      <Evidence />
    </div>
  );
}
