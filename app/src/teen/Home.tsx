import { useSnap, useStore } from "../store/hooks";
import { askLabel, homeSummary } from "../engine/summary";
import { SCENARIOS } from "../engine/simulate";
import { SignalChart } from "./Chart";
import { activeSignals } from "../engine/rules";
import { DoctorCard } from "./Doctor";

export function Home({ onStart }: { onStart: () => void }) {
  const snap = useSnap();
  const store = useStore();
  const teen = snap.sim.world.teen;
  const scn = SCENARIOS[snap.sim.world.scenarioId];
  const sum = homeSummary(teen);
  const ask = askLabel(teen);
  const pattern = scn.pattern && teen.week >= scn.pattern.fromWeek ? scn.pattern.text : null;

  return (
    <div>
      {teen.doctor.show && <DoctorCard onOkay={() => store.dispatch({ a: "teen", input: { kind: "dismiss", what: "doctor" } })} />}
      <p className="label">{teen.week ? `Week ${teen.week}` : "This week"}</p>
      <h1 className="sentence" aria-live="polite">
        {sum.sentence}
      </h1>
      {ask && (
        <section className="card" aria-labelledby="ask-h">
          <h2 id="ask-h" style={{ fontSize: 17, fontWeight: 500, margin: "0 0 10px" }}>
            {ask}
          </h2>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={onStart}>
              Start
            </button>
            <button className="btn btn-quiet" onClick={() => store.dispatch({ a: "teen", input: { kind: "skipAsk" } })}>
              Not now
            </button>
          </div>
        </section>
      )}
      <SignalChart weeks={teen.weeks} total={Math.max(12, scn.weeks.length)} signals={activeSignals(teen)} />
      {sum.note && <p style={{ marginTop: 16 }}>{sum.note}</p>}
      {pattern && (
        <p className="small" style={{ marginTop: 10 }}>
          <span className="label">Pattern · </span>
          {pattern}
        </p>
      )}
    </div>
  );
}
