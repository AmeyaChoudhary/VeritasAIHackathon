import { useEffect, useRef, useState } from "react";
import { useSnap, useStore } from "../store/hooks";
import { PHQ8, PHQ_STEM, PHQ_STOPS } from "../engine/phq";
import { questionnaireLine } from "../engine/notes";
import { DoctorCard } from "./Doctor";
import { Icon } from "../ui/icons";

/** One question per screen, four large answers, a row of dots for progress. */
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
      <div className="q-wrap rise">
        <span className="badge badge-lg">
          <Icon name="chat" size={26} />
        </span>
        <p className="label">Setup</p>
        <h1 className="display">Eight questions, on your own.</h1>
        <p className="lede">The ones doctors use. Take them alone, with nobody watching.</p>
        <div className="q-foot">
          <button className="btn btn-primary btn-lg btn-block" onClick={() => setStarted(true)}>
            Start
          </button>
          <p className="q-note">{questionnaireLine(teen.people)}</p>
        </div>
      </div>
    );
  }

  if (!live) {
    const rec = teen.asks.find((a) => a.id === askId);
    if (rec?.result === "high") {
      return (
        <div className="rise">
          <DoctorCard />
          <button className="btn btn-lg btn-block" onClick={onDone}>
            Done
          </button>
        </div>
      );
    }
    return (
      <div className="q-wrap rise">
        <span className="badge badge-lg">
          <Icon name="check" size={26} />
        </span>
        <h1 className="display">{rec?.result === "skipped" ? "This set has closed." : "Thanks for answering."}</h1>
        <p className="lede">{rec?.result === "skipped" ? "Steady will ask again another week." : "That's all for now."}</p>
        <div className="q-foot">
          <button className="btn btn-primary btn-lg btn-block" onClick={onDone}>
            Done
          </button>
        </div>
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
      <div className="q-progress" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i < index ? "done" : i === index ? "now" : ""} />
        ))}
      </div>
      <p className="label">
        {index >= 2 && live.kind === "check" ? "A few more · " : ""}
        {index + 1} of {total}
      </p>
      <p className="q-stem">{PHQ_STEM}</p>
      <h1 className={`q-item rise${item.length > 70 ? " long" : ""}`} id={`q-${index}`}>
        {item}
      </h1>
      <div className="q-pills" role="radiogroup" aria-labelledby={`q-${index}`} onKeyDown={onKey}>
        {PHQ_STOPS.map((s, i) => (
          <button
            key={s}
            ref={(el) => {
              stopRefs.current[i] = el;
            }}
            role="radio"
            aria-checked={pick === i}
            tabIndex={pick === i || (pick == null && i === 0) ? 0 : -1}
            className="q-pill"
            style={{ animationDelay: `${80 + i * 55}ms` }}
            onClick={() => choose(i)}
          >
            <span className="q-pill-mark" aria-hidden="true" />
            {s}
          </button>
        ))}
      </div>
      <div className="q-foot">
        <button
          className="btn btn-primary btn-lg btn-block"
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
