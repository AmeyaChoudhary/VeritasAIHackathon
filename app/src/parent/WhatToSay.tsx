import { useSnap } from "../store/hooks";
import { PRONOUNS } from "../engine/notes";

/** Ways in, drawn from the heads-up. Plain and short. */
export function WhatToSay() {
  const snap = useSnap();
  const people = snap.sim.world.teen.people;
  const p = PRONOUNS[people.teenPronoun];
  const name = people.teen;
  return (
    <div>
      <p className="label">What to say</p>
      <h1 className="title">Starting the conversation with {name}</h1>
      <p>
        Pick a low-key moment, like a drive or cooking together. Side by side is often easier than face to face. Say what you have
        noticed yourself, and keep it short.
      </p>
      <h2 className="label" style={{ marginTop: 18 }}>
        Ways in
      </h2>
      <ul className="help-list">
        <li>"You've seemed tired lately. How are you doing?"</li>
        <li>"I've noticed you're up late a lot. Is something on your mind?"</li>
        <li>"You don't have to explain anything. I just want to know how you are."</li>
      </ul>
      <h2 className="label" style={{ marginTop: 18 }}>
        Then
      </h2>
      <p>
        Listen more than you talk. If {p.sub} {p.says} {p.sub} {p.sub === "they" ? "are" : "is"} fine, you can say you are there whenever{" "}
        {p.sub} {p.sub === "they" ? "want" : "wants"} to talk, and ask again another day.
      </p>
      <h2 className="label" style={{ marginTop: 18 }}>
        Try not to
      </h2>
      <p>
        Take {p.pos} phone, or push for a reason tonight. The note does not say why, and {name} may not know either.
      </p>
      <h2 className="label" style={{ marginTop: 18 }}>
        Next
      </h2>
      <p>Book a visit with {p.pos} pediatrician and ask about a depression screening.</p>
      <p className="card small">
        If {p.sub} {p.says} {p.sub} {p.isnt} safe: call or text 988. If {p.sub} {p.has} hurt {p.refl} or {p.sub === "they" ? "are" : "is"} in
        immediate danger, call 911.
      </p>
      <div className="btn-row">
        <a className="btn" href="tel:988">
          Call 988
        </a>
        <a className="btn" href="sms:988">
          Text 988
        </a>
      </div>
    </div>
  );
}
