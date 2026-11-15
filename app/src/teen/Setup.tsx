import { useState } from "react";
import { useSnap, useStore } from "../store/hooks";
import { setupScreenText } from "../engine/notes";

/** The one setup screen, verbatim from docs/parent-alerts.md. */
export function Disclosure() {
  const snap = useSnap();
  const store = useStore();
  const people = snap.sim.world.teen.people;
  const t = setupScreenText(people);
  const [trusted, setTrusted] = useState(people.trusted ?? "");
  const [p0, p1, p2, p3, p4, p5] = t.paragraphs;

  return (
    <div className="fade-in prose">
      <h1 className="title">{t.title}</h1>
      {t.secondLine && <p className="muted">{t.secondLine}</p>}
      <p>{p0}</p>
      <p>{p1}</p>
      <p>{p2}</p>
      <p>{p3}</p>
      <label className="field">
        <span className="label">Trusted adult (optional)</span>
        <input
          value={trusted}
          maxLength={40}
          placeholder="A school counselor, a relative or a coach"
          onChange={(e) => setTrusted(e.target.value)}
        />
      </label>
      <p>{p4}</p>
      <p>{p5}</p>
      <button
        className="btn btn-primary btn-block"
        onClick={() => store.dispatch({ a: "teen", input: { kind: "acknowledge", trusted } })}
      >
        I understand
      </button>
    </div>
  );
}
