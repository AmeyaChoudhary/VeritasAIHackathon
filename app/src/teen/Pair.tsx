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
    <div className="fade-in">
      <p className="label">Link a parent's phone</p>
      <h1 className="title">Show this code to your parent.</h1>
      <p className="lede">They scan it with the Steady parent app, or type it in.</p>
      <div style={{ display: "flex", justifyContent: "center", margin: "18px 0 6px" }}>
        <QR text={`steady://pair/${teen.code}`} label={`Pairing code ${teen.code}`} />
      </div>
      <p className="mono" style={{ textAlign: "center", fontSize: 26, margin: "6px 0 18px" }} aria-label={`Code ${teen.code.split("").join(" ")}`}>
        {teen.code}
      </p>
      <hr className="hair" />
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
      <p className="muted small">Waiting for a parent's phone.</p>
    </div>
  );
}
