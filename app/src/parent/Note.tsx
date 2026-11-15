import { useState } from "react";
import { useSnap, useStore } from "../store/hooks";
import { WordByWord, fmtClock, fmtTime, useReducedMotion, wordCount } from "../ui/common";
import { headsUpText, joinWords, urgentText } from "../engine/notes";
import { headsUpView, urgentView, type Note, type ReplyChoice } from "../engine/parent";

const HEADS_UP_CHOICES: ReplyChoice[] = ["talked", "booked", "not_yet"];
const URGENT_CHOICES: ReplyChoice[] = ["with_her", "called_988", "cant_reach"];

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

  const step = isUrgent ? 22 : 55;
  let acc = wordCount(text.title) * step + 200;
  const starts = text.sections.map((sec) => {
    const st = acc;
    acc += wordCount(`${sec.label ?? ""} ${sec.text}`) * step + 120;
    return st;
  });

  return (
    <article aria-labelledby="note-h">
      <p className="label">
        {isUrgent ? "Urgent" : "Heads-up"} · {fmtTime(note.at)}
      </p>
      <h1 id="note-h" className="title">
        <WordByWord text={text.title} play={play} step={step} />
      </h1>
      {text.sections.map((s, i) => {
        const start = starts[i];
        return (
          <p key={i} className="note-section">
            {s.label && (
              <b>
                <WordByWord text={s.label} play={play} start={start} step={step} />{" "}
              </b>
            )}
            <WordByWord text={s.text} play={play} start={start + (s.label ? wordCount(s.label) * step : 0)} step={step} />
          </p>
        );
      })}

      {hv?.quiet && <p className="small muted">This came within six weeks of "Booked a doctor", so it was listed quietly.</p>}

      <div className="btn-col" role="group" aria-label="Reply" style={{ marginTop: 18 }}>
        {choices.map((c, i) => (
          <button
            key={c}
            className={`btn${i === 0 ? " btn-primary" : ""}`}
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
        <p className="small" style={{ marginTop: 12 }} aria-live="polite">
          You replied {replies.map((r) => `"${text.replies[choices.indexOf(r.choice)] ?? r.choice}" at ${fmtClock(r.at)}`).join(", then ")}. Saved on
          this phone. {people.teen}'s phone never sees replies.
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

      {!isUrgent && (
        <button className="btn btn-quiet btn-block" style={{ marginTop: 10 }} onClick={onSay}>
          What to say
        </button>
      )}
      <details className="small" style={{ marginTop: 16 }}>
        <summary className="label" style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}>
          What reached this phone ({note.bytes} bytes)
        </summary>
        <pre className="json">{JSON.stringify(note.event, null, 2)}</pre>
      </details>
    </article>
  );
}
