import { useMemo, useState } from "react";
import { useSnap } from "../store/hooks";
import { fmtTime } from "../ui/common";
import { notesFrom, urgentView } from "../engine/parent";
import { joinWords } from "../engine/notes";
import { replyLabel } from "../parent/ParentPhone";

type Row =
  | { k: "event"; at: number; id: string; title: string; bytes: number; json: string; to: string[]; from: string }
  | { k: "trace"; at: number; id: string; text: string }
  | { k: "local"; at: number; id: string; text: string };

/** Every event that left a phone, as the exact JSON with its size, plus what the rules did
 *  on the teen's phone (never sent) and what stayed on the parent's phone. */
export function EventLog() {
  const snap = useSnap();
  const [show, setShow] = useState({ notes: true, status: true, phone: true });
  const people = snap.sim.world.teen.people;
  const now = snap.now;

  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const r of snap.events) {
      if (r.at > now) continue;
      const isStatus = r.event.type === "status";
      if (isStatus && !show.status) continue;
      if (!isStatus && !show.notes) continue;
      const title =
        r.event.type === "receipt"
          ? `Receipt from ${people.parent}'s phone to the relay`
          : r.event.type === "status"
            ? "Status"
            : r.event.type === "urgent"
              ? "Urgent note"
              : "Heads-up";
      out.push({ k: "event", at: r.at, id: r.id, title, bytes: r.bytes, json: r.json, to: r.to, from: r.from });
    }
    if (show.notes) {
      for (const n of notesFrom(snap.events, now)) {
        if (n.event.type !== "urgent") continue;
        const v = urgentView(n, snap.parent.replies, now, !!(people.second || people.trusted));
        for (const t of v.repeats) out.push({ k: "local", at: t, id: `${n.id}-r${t}`, text: `${people.parent}'s phone sounds the urgent note again. No reply yet.` });
        if (v.othersAt != null) {
          const who = joinWords([people.second, people.trusted].filter(Boolean).map((x) => `${x}'s phone`) as string[]);
          out.push({
            k: "local",
            at: v.othersAt,
            id: `${n.id}-o`,
            text: `${who} now show${who.includes(" and ") ? "" : "s"} the sealed urgent note (${v.othersWhy === "cant_reach" ? `"${replyLabel("cant_reach", people.teenPronoun)}"` : "no reply in 15 minutes"}).`,
          });
        }
      }
      for (const r of snap.parent.replies) {
        if (r.at > now) continue;
        out.push({ k: "local", at: r.at, id: `rep-${r.noteId}-${r.at}`, text: `${people.parent} tapped "${replyLabel(r.choice, people.teenPronoun)}". The reply stays on ${people.parent}'s phone.` });
      }
    }
    if (show.phone) {
      snap.sim.world.teen.trace.forEach((t, i) => {
        if (t.at <= now) out.push({ k: "trace", at: t.at, id: `t${i}`, text: t.text });
      });
    }
    out.sort((a, b) => b.at - a.at || (a.k === "event" ? -1 : 1));
    return out.slice(0, 250);
  }, [snap.events, snap.parent.replies, snap.sim.world.teen.trace, now, show, people]);

  const sent = snap.events.filter((r) => r.at <= now);
  const total = sent.reduce((a, r) => a + r.bytes, 0);
  const toggle = (k: keyof typeof show) => setShow((s) => ({ ...s, [k]: !s[k] }));

  return (
    <div>
      <p className="counter" style={{ margin: "0 0 4px" }}>
        TEXT SENT: 0 BYTES
      </p>
      <p className="counter" style={{ margin: "0 0 10px" }}>
        EVENTS SENT: {sent.length} · {total} BYTES
      </p>
      <div className="seg" role="group" aria-label="Show in log" style={{ marginBottom: 8 }}>
        <button className="btn btn-sm" aria-pressed={show.notes} onClick={() => toggle("notes")}>
          Notes
        </button>
        <button className="btn btn-sm" aria-pressed={show.status} onClick={() => toggle("status")}>
          Status
        </button>
        <button className="btn btn-sm" aria-pressed={show.phone} onClick={() => toggle("phone")}>
          On the phone
        </button>
      </div>
      {rows.length === 0 && <p className="small muted">Nothing yet.</p>}
      <ul className="log">
        {rows.map((r) =>
          r.k === "event" ? (
            <li key={r.id}>
              <div className="meta">
                <span>{r.title.toUpperCase()}</span>
                <span>{r.bytes} B</span>
              </div>
              <div className="meta">
                <span>{fmtTime(r.at)}</span>
                <span>TO {r.to.join(", ").toUpperCase()}</span>
              </div>
              <pre>{r.json}</pre>
            </li>
          ) : (
            <li key={r.id} className={r.k === "trace" ? "trace" : undefined}>
              <div className="meta">
                <span>{r.k === "trace" ? `ON ${people.teen.toUpperCase()}'S PHONE · NOT SENT` : `ON ${people.parent.toUpperCase()}'S SIDE`}</span>
                <span>{fmtTime(r.at)}</span>
              </div>
              <div>{r.text}</div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
