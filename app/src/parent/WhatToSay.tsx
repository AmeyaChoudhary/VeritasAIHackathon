import { useSnap } from "../store/hooks";
import { PRONOUNS } from "../engine/notes";
import { Icon } from "../ui/icons";

/** Ways in, drawn from the heads-up. Plain and short. */
export function WhatToSay() {
  const snap = useSnap();
  const people = snap.sim.world.teen.people;
  const p = PRONOUNS[people.teenPronoun];
  const name = people.teen;
  return (
    <div className="say rise">
      <p className="label">What to say</p>
      <h1 className="display">Starting the conversation with {name}</h1>
      <p className="lede">
        Pick a low-key moment, like a drive or cooking together. Side by side is often easier than face to face. Say what you have
        noticed yourself, and keep it short.
      </p>
      <h2 className="label section-label">Ways in</h2>
      <ul className="quotes">
        <li>"You've seemed tired lately. How are you doing?"</li>
        <li>"I've noticed you're up late a lot. Is something on your mind?"</li>
        <li>"You don't have to explain anything. I just want to know how you are."</li>
      </ul>
      <ul className="rows">
        <li>
          <span className="badge">
            <Icon name="chat" />
          </span>
          <span>
            <b>Then</b>
            <span className="row-text">
              Listen more than you talk. If {p.sub} {p.says} {p.sub} {p.sub === "they" ? "are" : "is"} fine, you can say you are there
              whenever {p.sub} {p.sub === "they" ? "want" : "wants"} to talk, and ask again another day.
            </span>
          </span>
        </li>
        <li>
          <span className="badge">
            <Icon name="hand" />
          </span>
          <span>
            <b>Try not to</b>
            <span className="row-text">
              Take {p.pos} phone, or push for a reason tonight. The note does not say why, and {name} may not know either.
            </span>
          </span>
        </li>
        <li>
          <span className="badge">
            <Icon name="calendar" />
          </span>
          <span>
            <b>Next</b>
            <span className="row-text">Book a visit with {p.pos} pediatrician and ask about a depression screening.</span>
          </span>
        </li>
      </ul>
      <div className="card safe-card">
        <p>
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
    </div>
  );
}
