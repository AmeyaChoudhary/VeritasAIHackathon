import { useState } from "react";
import { useSnap, useStore } from "../store/hooks";
import { fmtClock, fmtTime, useReducedMotion } from "../ui/common";
import { headsUpText, joinWords, urgentText, cap } from "../engine/notes";
import { headsUpView, urgentView, type Note, type ReplyChoice } from "../engine/parent";
import type { SignalId } from "../engine/types";
import { Icon, SIGNAL_ICON, type IconName } from "../ui/icons";

const HEADS_UP_CHOICES: ReplyChoice[] = ["talked", "booked", "not_yet"];
const URGENT_CHOICES: ReplyChoice[] = ["with_her", "called_988", "cant_reach"];

/** A few words for each area on a chip. The note's full sentence stays as the chips' label. */
const AREA_CHIP: Record<SignalId, string> = {
  sleep: "Sleeping less",
  reaching_out: "Messaging less",
  activity: "Less active",
  tone: "Lower tone in typing",
  music: "Later listening",
  replies: "Slower replies",
  night_phone: "More late-night phone",
  screen_time: "More screen time",
  school: "Late or missing schoolwork",
  night_activity: "More late-night activity",
  typing_speed: "Slower typing",
  typing_corrections: "More corrections",
};

/** Icons for the heads-up rows, in the order the note gives them: tonight, try not to, next, if not safe. */
const HEADS_UP_ICONS: IconName[] = ["chat", "hand", "calendar", "life"];

const clean = (label: string) => cap(label.replace(/:$/, ""));
const sentence = (text: string) => cap(text);

export function NoteScreen({
  note,
  notes,
  fresh,
  onSay,
  onCantReach,
}: {
  note: Note;
  notes: Note[];
  fresh: boolean;
  onSay: () => void;
  onCantReach: () => void;
}) {
  const snap = useSnap();
  const store = useStore();
  const reduced = useReducedMotion();
  const [play] = useState(fresh && !reduced);
  const people = snap.sim.world.teen.people;
  const now = snap.now;
  const isUrgent = note.event.type === "urgent";
  const text = note.event.type === "urgent" ? urgentText(people) : headsUpText(note.event, people);
  const choices = isUrgent ? URGENT_CHOICES : HEADS_UP_CHOICES;
  const replies = snap.parent.replies.filter((r) => r.noteId === note.id);
  const others = [people.second, people.trusted].filter(Boolean) as string[];
  const uv = isUrgent ? urgentView(note, snap.parent.replies, now, others.length > 0) : null;
  const hv = !isUrgent ? headsUpView(note, notes, snap.parent.replies, now) : null;
  const areas = note.event.type === "heads_up" && note.event.areas?.length && note.event.weeks ? note.event.areas : null;
  const weeks = note.event.type === "heads_up" ? note.event.weeks : undefined;
  const [lead, ...rest] = text.sections;
  const delay = (i: number) => (play ? { animationDelay: `${260 + i * 110}ms` } : undefined);

  return (
    <article className={`note${isUrgent ? " note-urgent" : ""}${play ? " play" : ""}`} aria-labelledby="note-h">
      <p className="label note-kind">
        <i className={`pulse-dot ${isUrgent ? "urgent" : "amber"}`} aria-hidden="true" />
        {isUrgent ? "Urgent" : "Heads-up"} · {fmtTime(note.at)}
      </p>
      <h1 id="note-h" className="display">
        {text.title}
      </h1>

      {areas ? (
        <>
          <ul className="chips" aria-label={lead.text}>
            {areas.map((a, i) => (
              <li key={a} className="chip amber" style={delay(i)}>
                <Icon name={SIGNAL_ICON[a]} size={15} />
                {AREA_CHIP[a]}
              </li>
            ))}
            <li className="chip" style={delay(areas.length)}>
              <Icon name="clock" size={15} />
              {weeks} weeks
            </li>
          </ul>
          <p className="note-lead">Stability can't say why, and this is not a diagnosis.</p>
        </>
      ) : (
        <p className="note-lead">{lead.text}</p>
      )}

      {isUrgent ? (
        <ol className="steps">
          {rest.map((s, i) => (
            <li key={i} style={delay(i)}>
              <span className="step-n" aria-hidden="true">
                {i + 1}
              </span>
              <span>
                <b>{clean(s.label ?? "")}</b>
                <span className="row-text">{sentence(s.text)}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <ul className="rows note-rows">
          {rest.map((s, i) => {
            // The first row carries an example line; it lives one tap away in "What to say".
            const cut = i === 0 ? s.text.split(" For example:")[0] : s.text;
            return (
              <li key={i} style={delay(i + 2)}>
                <span className="badge">
                  <Icon name={HEADS_UP_ICONS[i] ?? "check"} />
                </span>
                <span>
                  <b>{clean(s.label ?? "")}</b>
                  <span className="row-text">{sentence(cut)}{i === 0 && cut !== s.text ? " Then listen." : ""}</span>
                  {i === 0 && (
                    <button className="link" onClick={onSay}>
                      What to say
                      <Icon name="arrow" size={14} />
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {hv?.quiet && <p className="small muted">This came within six weeks of "Booked a doctor", so it was listed quietly.</p>}

      <div className="btn-col replies" role="group" aria-label="Reply">
        {choices.map((c, i) => (
          <button
            key={c}
            className={`btn btn-lg${i === 0 ? " btn-primary" : ""}`}
            onClick={() => {
              store.reply(note, c);
              if (c === "cant_reach") onCantReach();
            }}
          >
            {text.replies[i]}
          </button>
        ))}
      </div>
      {replies.length > 0 && (
        <p className="small replied" aria-live="polite">
          <Icon name="check" size={14} />
          <span>
            You replied {replies.map((r) => `"${text.replies[choices.indexOf(r.choice)] ?? r.choice}" at ${fmtClock(r.at)}`).join(", then ")}. Saved on
            this phone. {people.teen}'s phone never sees replies.
          </span>
        </p>
      )}

      {uv && (
        <div className="card card-soft small" style={{ marginTop: 14 }}>
          {uv.repeatCount > 0 && (
            <p style={{ margin: "0 0 6px" }}>
              Sounded again at {uv.repeats.slice(-4).map(fmtClock).join(", ")}
              {uv.repeatCount > 4 ? ` (${uv.repeatCount} times)` : ""}.
            </p>
          )}
          {uv.othersAt != null ? (
            <p style={{ margin: 0 }}>
              Also showing on {joinWords(others.map((o) => `${o}'s phone`))} since {fmtClock(uv.othersAt)}
              {uv.othersWhy === "cant_reach" ? `, after "${text.replies[2]}".` : ", with no reply in 15 minutes."}
            </p>
          ) : others.length ? (
            !uv.answered && <p style={{ margin: 0 }}>If nobody replies by {fmtClock(note.at + 15 * 60000)}, it also goes to {joinWords(others)}.</p>
          ) : (
            !uv.answered && <p style={{ margin: 0 }}>No second adult is named, so it keeps sounding here every 5 minutes.</p>
          )}
          {uv.answered && <p style={{ margin: "6px 0 0" }}>It has stopped repeating.</p>}
        </div>
      )}

      <details className="details small">
        <summary>What reached this phone ({note.bytes} bytes)</summary>
        <pre className="json">{JSON.stringify(note.event, null, 2)}</pre>
      </details>
    </article>
  );
}
