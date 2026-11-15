import { useEffect, useState } from "react";
import { useSnap, useStore } from "../store/hooks";
import { Icon } from "../ui/icons";

// The two-tap weekly check-in. Its two questions and their five answers are the ones the
// College Experience Study asked, which is what the ask model was trained on.
const STRESS = ["Not at all", "A little", "Somewhat", "Very much", "Extremely"];
const OTHERS = ["Almost always alone", "Mostly alone", "Half and half", "Mostly with others", "Almost always with others"];
const OTHERS_SHORT = ["Alone", "Mostly alone", "Half and half", "Mostly with others", "With others"];

function Scale({ name, question, words, short, value, onPick }: { name: string; question: string; words: string[]; short?: string[]; value: number | null; onPick: (v: number) => void }) {
  return (
    <div className="ci-row">
      <span className="ci-name">{name}</span>
      <div className="ci-dots" role="radiogroup" aria-label={question}>
        {words.map((word, i) => (
          <button
            key={word}
            type="button"
            role="radio"
            aria-checked={value === i + 1}
            aria-label={word}
            className={`ci-dot${value !== null && i + 1 <= value ? " on" : ""}${value === i + 1 ? " at" : ""}`}
            onClick={() => onPick(i + 1)}
          >
            <span />
          </button>
        ))}
      </div>
      <span className="ci-word" key={value ?? 0}>
        {value ? (short ?? words)[value - 1] : "Tap one"}
      </span>
    </div>
  );
}

/** Two taps a week: how stressed, and how much time with other people. The ask model reads them. */
export function CheckIn() {
  const snap = useSnap();
  const store = useStore();
  const world = snap.sim.world;
  const teen = world.teen;
  const week = teen.week + 1; // the week now running
  const given = teen.checkins?.[week] ?? (world.scripted ? teen.checkins?.[teen.week] : undefined);
  const [draft, setDraft] = useState<{ stress?: number; withOthers?: number }>({});
  useEffect(() => setDraft({}), [week, world.scenarioId]);

  if (!teen.setupDone || teen.off || teen.setupHigh.active) return null;

  const stress = draft.stress ?? given?.stress ?? null;
  const withOthers = draft.withOthers ?? given?.withOthers ?? null;
  const pick = (next: { stress?: number; withOthers?: number }) => {
    const d = { stress: stress ?? undefined, withOthers: withOthers ?? undefined, ...next };
    setDraft(d);
    if (d.stress && d.withOthers) store.dispatch({ a: "teen", input: { kind: "checkin", stress: d.stress, withOthers: d.withOthers } });
  };
  const done = stress !== null && withOthers !== null;

  return (
    <section className="card checkin" aria-labelledby="ci-h">
      <div className="ci-head">
        <h2 id="ci-h" className="label">
          Check-in
        </h2>
        <span className={`ci-done${done ? " show" : ""}`} aria-live="polite">
          {done ? (
            <>
              <Icon name="check" size={14} /> Done
            </>
          ) : (
            "Two taps"
          )}
        </span>
      </div>
      <Scale name="Stress" question="Are you feeling stressed?" words={STRESS} value={stress} onPick={(v) => pick({ stress: v })} />
      <Scale name="People" question="Have you spent most of your time alone or with others?" words={OTHERS} short={OTHERS_SHORT} value={withOthers} onPick={(v) => pick({ withOthers: v })} />
    </section>
  );
}
