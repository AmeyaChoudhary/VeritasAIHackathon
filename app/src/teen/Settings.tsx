import { useState } from "react";
import { useSnap, useStore } from "../store/hooks";
import { SOURCES, type SourceId } from "../engine/types";
import { SOURCE_NAME, disconnectSource } from "./Connect";

export function Settings({ onOpenConnect }: { onOpenConnect: (source: SourceId) => void }) {
  const snap = useSnap();
  const store = useStore();
  const teen = snap.sim.world.teen;
  const p = teen.people;
  const [trusted, setTrusted] = useState(p.trusted ?? "");
  const saved = (p.trusted ?? "") === trusted.trim();

  return (
    <div>
      <p className="label">Settings</p>
      <h1 className="title">Linked to {p.parent}'s phone.</h1>
      <p>
        {p.parent} gets a short note if something stays off for a few weeks or your answers to its questions are high, and an urgent note if
        you type something that sounds like you might hurt yourself.
      </p>
      {p.second && <p>Urgent notes also go to {p.second} if {p.parent} doesn't answer.</p>}

      <hr className="hair" />
      <h2 className="label">Trusted adult outside your home</h2>
      <p className="small muted">They get urgent notes only. A school counselor, a relative or a coach.</p>
      <label className="field">
        <span className="sr-only">Trusted adult</span>
        <input value={trusted} maxLength={40} placeholder="Name" onChange={(e) => setTrusted(e.target.value)} />
      </label>
      <div className="btn-row">
        <button
          className="btn"
          disabled={saved}
          onClick={() => store.dispatch({ a: "teen", input: { kind: "setTrusted", name: trusted } })}
        >
          {p.trusted && !trusted.trim() ? "Remove" : "Save"}
        </button>
        {saved && p.trusted && <span className="small muted" style={{ alignSelf: "center" }}>Saved: {p.trusted}</span>}
      </div>

      <hr className="hair" />
      <h2 className="label">Connected accounts</h2>
      <p className="small muted">Turning one off disconnects it and forgets what Stability learned from it.</p>
      <ul className="help-list" style={{ marginBottom: 6 }}>
        {SOURCES.map((k) => {
          const on = !!teen.sources?.[k];
          return (
            <li key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "6px 0" }}>
              <span id={`sw-${k}`}>
                {SOURCE_NAME[k]}
                {on && teen.sources[k]?.mode === "sample" ? <span className="small muted"> · sample data</span> : null}
              </span>
              <button
                role="switch"
                aria-checked={on}
                aria-labelledby={`sw-${k}`}
                className="toggle"
                onClick={() => (on ? disconnectSource(store, k) : onOpenConnect(k))}
              >
                <span aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>

      <hr className="hair" />
      <h2 className="label">Stability</h2>
      {teen.off ? (
        <>
          <p>Stability is off. Nothing is read and nothing is sent.</p>
          <button className="btn btn-primary" onClick={() => store.dispatch({ a: "teen", input: { kind: "setOff", off: false } })}>
            Turn Stability on
          </button>
        </>
      ) : (
        <>
          <p className="small muted">One tap turns it off. After a day, {p.parent}'s app shows it as not connected.</p>
          <button className="btn" onClick={() => store.dispatch({ a: "teen", input: { kind: "setOff", off: true } })}>
            Turn Stability off
          </button>
        </>
      )}

      <hr className="hair" />
      <p className="small muted">
        Parent links are for students under 18. On the student's 18th birthday the link ends, unless the student turns it back on.
      </p>
      <p className="small muted">Your messages, answers and scores stay on this phone.</p>
    </div>
  );
}
