import { useState } from "react";
import { useSnap, useStore } from "../store/hooks";
import { PRONOUNS, setupScreenText } from "../engine/notes";
import { Icon, type IconName } from "../ui/icons";

/** The one setup screen. The rows are the summary; the full text from docs/parent-alerts.md
 *  is on the same screen under "Read the details", word for word. */
export function Disclosure() {
  const snap = useSnap();
  const store = useStore();
  const people = snap.sim.world.teen.people;
  const t = setupScreenText(people);
  const [trusted, setTrusted] = useState(people.trusted ?? "");
  const parent = people.parent;
  const obj = PRONOUNS[people.parentPronoun].obj;

  const rows: { icon: IconName; head: string; text: string }[] = [
    { icon: "pulse", head: "Steady learns your normal", text: "Sleep, activity, how often you message people, and the tone of what you type." },
    { icon: "lock", head: "Your words stay on this phone", text: "Notes never include your messages, your answers or your scores." },
    {
      icon: "bell",
      head: `${parent} can get a short note`,
      text: `If something stays off for a few weeks, or your answers to its questions are high, it asks ${obj} to check in with you. Steady won't tell you when it sends one.`,
    },
    {
      icon: "alert",
      head: "Urgent notes go right away",
      text: `If you type something that sounds like you might hurt yourself. Help from 988 is always one tap away.`,
    },
  ];

  return (
    <div className="rise consent">
      <h1 className="display">{t.title}</h1>
      {t.secondLine && <p className="muted small">{t.secondLine}</p>}
      <ul className="rows">
        {rows.map((r, i) => (
          <li key={r.head} style={{ animationDelay: `${120 + i * 70}ms` }}>
            <span className="badge">
              <Icon name={r.icon} />
            </span>
            <span>
              <b>{r.head}</b>
              <span className="row-text">{r.text}</span>
            </span>
          </li>
        ))}
      </ul>
      <details className="details">
        <summary>Read the details</summary>
        <div className="prose">
          {t.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </details>
      <label className="field">
        <span className="label">Trusted adult outside your home (optional)</span>
        <input
          value={trusted}
          maxLength={40}
          placeholder="A school counselor, a relative or a coach"
          onChange={(e) => setTrusted(e.target.value)}
        />
        <span className="small muted">Urgent notes go to them too.</span>
      </label>
      <button
        className="btn btn-primary btn-lg btn-block"
        onClick={() => store.dispatch({ a: "teen", input: { kind: "acknowledge", trusted } })}
      >
        I understand
      </button>
    </div>
  );
}
