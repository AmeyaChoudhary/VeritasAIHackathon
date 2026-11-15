import { useSnap, useStore } from "../store/hooks";
import { QR } from "../ui/common";
import type { Pronoun } from "../engine/types";

export function TeenPair() {
  const snap = useSnap();
  const store = useStore();
  const teen = snap.sim.world.teen;
  const rename = (people: { teen?: string; teenPronoun?: Pronoun }) =>
    store.dispatch({ a: "teen", input: { kind: "rename", people } });

  return (
    <div className="rise">
      <p className="label">Link a parent's phone</p>
      <h1 className="display">Show this code to your parent.</h1>
      <div className="card qr-card">
        <QR text={`steady://pair/${teen.code}`} label={`Pairing code ${teen.code}`} size={156} />
        <p className="code" aria-label={`Code ${teen.code.split("").join(" ")}`}>
          {teen.code}
        </p>
        <p className="small muted">They scan it with the Stability parent app, or type it in.</p>
      </div>
      <label className="field">
        <span className="label">Your first name</span>
        <input
          defaultValue={teen.people.teen}
          maxLength={24}
          onBlur={(e) => e.target.value.trim() && rename({ teen: e.target.value.trim() })}
        />
      </label>
      <label className="field">
        <span className="label">In notes, call me</span>
        <select value={teen.people.teenPronoun} onChange={(e) => rename({ teenPronoun: e.target.value as Pronoun })}>
          <option value="she">she / her</option>
          <option value="he">he / him</option>
          <option value="they">they / them</option>
        </select>
      </label>
      <p className="waiting">
        <i className="pulse-dot idle" aria-hidden="true" />
        Waiting for a parent's phone.
      </p>
    </div>
  );
}
