import { useEffect, useRef, useState } from "react";
import { useSnap, useStore } from "../store/hooks";
import { PHQ8, PHQ_STEM, PHQ_STOPS } from "../engine/phq";
import { questionnaireLine } from "../engine/notes";
import { DoctorCard } from "./Doctor";

/** One question per screen. The answer is a dot placed on a four-stop line. */
export function Questions({ mode, onDone }: { mode: "setup" | "check"; onDone: () => void }) {
  const snap = useSnap();
  const store = useStore();
  const teen = snap.sim.world.teen;
  const ask = teen.ask;
  const [askId] = useState<string | null>(ask?.id ?? null);
  const [started, setStarted] = useState(mode === "check");
  const [pick, setPick] = useState<number | null>(null);
  const live = ask && ask.id === askId ? ask : null;
  const index = live?.answers.length ?? 0;
  const stopRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => setPick(null), [index]);

  if (!started) {
    return (
      <div className="q-wrap fade-in">
        <p className="label">Setup</p>
        <h1 className="title">Eight questions, on your own.</h1>
        <p className="lede">They are the questions doctors use. Take them alone, with nobody watching.</p>
        <p className="q-note">{questionnaireLine(teen.people)}</p>
        <div className="q-foot">
          <button className="btn btn-primary btn-block" onClick={() => setStarted(true)}>
            Start
          </button>
        </div>
      </div>
    );
  }

  if (!live) {
    const rec = teen.asks.find((a) => a.id === askId);
    if (rec?.result === "high") {
      return (
        <div className="fade-in">
          <DoctorCard />
          <button className="btn btn-block" onClick={onDone}>
            Done
          </button>
        </div>
      );
    }
    return (
      <div className="fade-in">
        <h1 className="sentence">{rec?.result === "skipped" ? "This set has closed." : "Thanks for answering."}</h1>
        <p className="lede">{rec?.result === "skipped" ? "Steady will ask again another week." : "That's all for now."}</p>
        <button className="btn btn-primary btn-block" onClick={onDone} style={{ marginTop: 20 }}>
          Done
        </button>
      </div>
    );
  }

  const total = live.six ? 8 : 2;
  const item = PHQ8[index];
  const choose = (v: number) => setPick(v);
  const onKey = (e: React.KeyboardEvent) => {
    const cur = pick ?? -1;
    let next = cur;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = Math.min(3, cur + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = Math.max(0, cur < 0 ? 0 : cur - 1);
    else return;
    e.preventDefault();
    setPick(next);
    stopRefs.current[next]?.focus();
  };

  return (
    <div className="q-wrap" key={index}>
      <p className="label">
        {index >= 2 && live.kind === "check" ? "A few more · " : ""}
        {index + 1} of {total}
      </p>
      <p className="q-stem">{PHQ_STEM}</p>
      <h1 className={`q-item fade-in${item.length > 70 ? " long" : ""}`} id={`q-${index}`}>
        {item}
      </h1>
      <div className="scale" role="radiogroup" aria-labelledby={`q-${index}`} onKeyDown={onKey}>
        <div className="scale-line" aria-hidden="true" />
        {pick != null && <div className="scale-dot" aria-hidden="true" style={{ left: `${12.5 + pick * 25}%` }} />}
        <div className="scale-stops">
          {PHQ_STOPS.map((s, i) => (
            <button
              key={s}
              ref={(el) => {
                stopRefs.current[i] = el;
              }}
              role="radio"
              aria-checked={pick === i}
              tabIndex={pick === i || (pick == null && i === 0) ? 0 : -1}
              className="scale-stop"
              onClick={() => choose(i)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="q-foot">
        <button
          className="btn btn-primary btn-block"
          disabled={pick == null}
          onClick={() => {
            if (pick == null) return;
            store.dispatch({ a: "teen", input: { kind: "answer", value: pick } });
          }}
        >
          Next
        </button>
        {mode === "check" && (
          <button
            className="btn btn-quiet btn-block"
            onClick={() => {
              store.dispatch({ a: "teen", input: { kind: "skipAsk" } });
              onDone();
            }}
          >
            Not now
          </button>
        )}
        <p className="q-note">{questionnaireLine(teen.people)}</p>
      </div>
    </div>
  );
}
