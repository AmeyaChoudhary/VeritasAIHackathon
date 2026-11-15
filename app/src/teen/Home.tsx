import { useSnap, useStore } from "../store/hooks";
import { askLabel, homeSummary } from "../engine/summary";
import { SCENARIOS } from "../engine/simulate";
import { SignalRing, SignalRows, signalStates } from "./Chart";
import { activeSignals, countingSignals } from "../engine/rules";
import { CONFIG } from "../engine/config";
import type { TeenState } from "../engine/types";
import { DoctorCard } from "./Doctor";
import { Icon } from "../ui/icons";
import { CheckIn } from "./CheckIn";
import { Stable } from "../ui/Stable";

/** The two to five words in the middle of the ring. The full sentence from the rules is still
 *  on the page for screen readers; this is the glanceable form of the same state. */
function ringWords(s: TeenState): { status: string; sub?: string } {
  if (s.off) return { status: "Stability is off" };
  if (!s.setupDone) return { status: "Setting up" };
  const last = s.weeks[s.weeks.length - 1];
  if (s.setupHigh.active) return { status: "Checking in", sub: "Every two weeks" };
  if (!last) return { status: "Learning your normal", sub: `0 of ${CONFIG.baselineWeeks} weeks` };
  const learnedWeeks = Math.max(...Object.values(s.learn).map((v) => v.length));
  const stillLearning = (!s.range.sleep || last.learning.length > 0) && !s.episode;
  if (stillLearning) {
    const n = Math.min(CONFIG.baselineWeeks, learnedWeeks);
    // "A new source" only when something else is already learned and one late source is catching up.
    const someLearned = Object.keys(last.ranges).some((k) => !last.learning.includes(k as (typeof last.learning)[number]));
    return { status: "Learning your normal", sub: someLearned ? "A new source" : `${n} of ${CONFIG.baselineWeeks} weeks` };
  }
  if (!last.valid) return { status: "Not enough data", sub: "This week is left out" };
  if (s.episode) {
    const counting = countingSignals(s);
    const n = counting.length ? Math.min(...counting.map((k) => s.runs[k])) : 0;
    return { status: "Outside your usual", sub: n ? `${n} weeks` : undefined };
  }
  if (last.out.length) return { status: `${last.out.length} signal${last.out.length > 1 ? "s" : ""} drifting`, sub: "One week changes nothing" };
  return { status: "In your range" };
}

export function Home({ onStart }: { onStart: () => void }) {
  const snap = useSnap();
  const store = useStore();
  const teen = snap.sim.world.teen;
  const scn = SCENARIOS[snap.sim.world.scenarioId];
  const sum = homeSummary(teen);
  const ask = askLabel(teen);
  const pattern = scn.pattern && teen.week >= scn.pattern.fromWeek ? scn.pattern.text : null;
  const signals = activeSignals(teen);
  const states = signalStates(teen.weeks, signals);
  const words = ringWords(teen);

  return (
    <div className="home">
      {teen.doctor.show && <DoctorCard onOkay={() => store.dispatch({ a: "teen", input: { kind: "dismiss", what: "doctor" } })} />}
      <h1 className="sr-only" aria-live="polite">
        {sum.sentence}
      </h1>
      <SignalRing states={states} week={teen.week ? `Week ${teen.week}` : "This week"} status={words.status} sub={words.sub} />
      {ask && (
        <section className="card ask rise" aria-labelledby="ask-h">
          <Stable mood="ask" size={46} className="ask-stable" />
          <div className="ask-body">
            <h2 id="ask-h" className="ask-title">
              {ask}
            </h2>
            <p className="ask-from">From Stable</p>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={onStart}>
                Start
              </button>
              <button className="btn btn-quiet" onClick={() => store.dispatch({ a: "teen", input: { kind: "skipAsk" } })}>
                Not now
              </button>
            </div>
          </div>
        </section>
      )}
      {!ask && <CheckIn />}
      <SignalRows weeks={teen.weeks} total={Math.max(12, scn.weeks.length)} signals={signals} />
      {sum.note && <p className="home-note">{sum.note}</p>}
      {pattern && (
        <p className="insight">
          <Icon name="sparkle" size={16} />
          <span>
            <span className="label">Pattern</span>
            {pattern}
          </span>
        </p>
      )}
    </div>
  );
}
