import { useSnap } from "../store/hooks";
import { notesFrom, urgentView } from "../engine/parent";
import { urgentText } from "../engine/notes";
import { fmtClock } from "../ui/common";
import { CONFIG } from "../engine/config";

/** The second adult's phone and the trusted adult's phone. They get urgent notes only, and
 *  show one only if the parent has not replied in 15 minutes or tapped "I can't reach her". */
export function OtherPhones() {
  const snap = useSnap();
  const people = snap.sim.world.teen.people;
  const now = snap.now;
  const adults = [
    { name: people.second, role: `Second adult, named by ${people.parent}` },
    { name: people.trusted, role: `Trusted adult, named by ${people.teen}` },
  ].filter((a): a is { name: string; role: string } => !!a.name);
  if (!adults.length) return null;
  const urgent = notesFrom(snap.events, now).filter((n) => n.event.type === "urgent");
  // Show a note that has reached the other phones if there is one, else the newest.
  const views = urgent.map((n) => ({ n, v: urgentView(n, snap.parent.replies, now, true) }));
  const pick = [...views].reverse().find((x) => x.v.othersAt != null) ?? views[views.length - 1];
  const latest = pick?.n;
  const v = pick?.v ?? null;
  const title = urgentText(people).title;
  const cant = urgentText(people).replies[2];

  return (
    <>
      {adults.map((a) => {
        let line: React.ReactNode = "Urgent notes only. Nothing to show.";
        let live = false;
        if (latest && v) {
          if (v.othersAt != null) {
            live = true;
            line = (
              <>
                <b>{title}</b>
                <br />
                Showing since {fmtClock(v.othersAt)}, {v.othersWhy === "cant_reach" ? `after ${people.parent} tapped "${cant}".` : `with no reply from ${people.parent} in 15 minutes.`}
              </>
            );
          } else if (!v.answered) {
            line = `Holding a sealed urgent note. It shows here if ${people.parent} doesn't reply by ${fmtClock(latest.at + CONFIG.urgentOthersAfterMs)}.`;
          } else {
            line = `${people.parent} replied, so the sealed note stayed hidden.`;
          }
        }
        return (
          <div key={a.name} className={`strip${live ? " live" : ""}`} aria-live="polite">
            <div className="strip-head">
              <i className={`pulse-dot ${live ? "urgent" : "idle"}`} aria-hidden="true" />
              <b>{a.name}'s phone</b>
            </div>
            <div className="label">{a.role}</div>
            <div className="strip-line">{line}</div>
          </div>
        );
      })}
    </>
  );
}
