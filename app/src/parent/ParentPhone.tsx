import { useEffect, useMemo, useRef, useState } from "react";
import { useSnap, useStore } from "../store/hooks";
import { normCode } from "../store/store";
import { ProtoLine, fmtTime } from "../ui/common";
import { connection, headsUpView, notesFrom, urgentView, type Note } from "../engine/parent";
import { headsUpText, missesText, statusLine, urgentText } from "../engine/notes";
import { NoteScreen } from "./Note";
import { WhatToSay } from "./WhatToSay";
import { CantReach } from "./CantReach";
import type { Pronoun } from "../engine/types";

type View = { k: "home" } | { k: "note"; id: string; fresh: boolean } | { k: "say" } | { k: "cant"; id: string };

function ParentTop({ onBack }: { onBack?: () => void }) {
  return (
    <div className="phone-top">
      <span className="wordmark">
        <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true">
          <path d="M1 8 C 5 8, 6 3, 9 3 S 13 8, 17 5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        Steady for parents
      </span>
      {onBack && (
        <button className="btn btn-sm" onClick={onBack}>
          Back
        </button>
      )}
    </div>
  );
}

function PairFlow() {
  const snap = useSnap();
  const store = useStore();
  const ps = snap.parent;
  const teen = snap.sim.world.teen;
  const people = teen.people;
  const [code, setCode] = useState("");
  const [name, setName] = useState(ps.parent);
  const [pron, setPron] = useState<Pronoun>(ps.parentPronoun);
  const [second, setSecond] = useState(ps.second);
  const [err, setErr] = useState<string | null>(null);
  const p = people.teenPronoun === "he" ? "him" : people.teenPronoun === "they" ? "them" : "her";

  if (ps.step === "pair") {
    const link = () => {
      if (normCode(code) !== normCode(teen.code)) {
        setErr("That code doesn't match. Check the code on your teen's phone.");
        return;
      }
      const parent = name.trim() || "Mom";
      store.updateParent((s) => ({ ...s, step: "second", parent, parentPronoun: pron, pairedAt: snap.now }));
      store.dispatch({ a: "teen", input: { kind: "pair", people: { parent, parentPronoun: pron } } });
    };
    return (
      <div className="fade-in">
        <p className="label">Step 1 of 3</p>
        <h1 className="title">Link to your teen's phone.</h1>
        <p className="lede">Scan the code on their Steady screen, or type it in.</p>
        <button className="btn btn-block" onClick={() => setCode(teen.code)} disabled={teen.paired}>
          Scan the code
        </button>
        <p className="small muted">In this demo, scanning reads the code from the teen phone on this screen.</p>
        <label className="field">
          <span className="label">Code</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABC-123" autoCapitalize="characters" className="mono" />
        </label>
        <label className="field">
          <span className="label">What does your teen call you?</span>
          <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">In Steady's words to your teen, call me</span>
          <select value={pron} onChange={(e) => setPron(e.target.value as Pronoun)}>
            <option value="she">she / her</option>
            <option value="he">he / him</option>
            <option value="they">they / them</option>
          </select>
        </label>
        {err && (
          <p className="small" role="alert">
            {err}
          </p>
        )}
        <button className="btn btn-primary btn-block" onClick={link} disabled={!code.trim()}>
          Link
        </button>
        <p className="small muted" style={{ marginTop: 14 }}>
          Parent links are for students under 18.
        </p>
      </div>
    );
  }

  if (ps.step === "second") {
    const save = (v: string | undefined) => {
      store.updateParent((s) => ({ ...s, step: "dnd", second: v ?? "" }));
      store.dispatch({ a: "teen", input: { kind: "rename", people: { second: v } } });
    };
    return (
      <div className="fade-in">
        <p className="label">Step 2 of 3</p>
        <h1 className="title">Name a second adult for urgent notes.</h1>
        <p>
          If you don't reply to an urgent note within 15 minutes, or you tap "I can't reach {p}", it also goes to them. Pick someone who
          could get to {people.teen} quickly, like another parent or a relative. They never get heads-ups.
        </p>
        <label className="field">
          <span className="label">Second adult</span>
          <input value={second} maxLength={24} onChange={(e) => setSecond(e.target.value)} placeholder="Name" />
        </label>
        <div className="btn-col">
          <button className="btn btn-primary" disabled={!second.trim()} onClick={() => save(second.trim())}>
            Save
          </button>
          <button className="btn btn-quiet" onClick={() => save(undefined)}>
            Skip
          </button>
        </div>
      </div>
    );
  }

  if (ps.step === "dnd") {
    const set = (v: boolean) => store.updateParent((s) => ({ ...s, step: "misses", dnd: v }));
    return (
      <div className="fade-in">
        <p className="label">Step 3 of 3</p>
        <h1 className="title">Let urgent notes sound through Do Not Disturb.</h1>
        <p>On iPhone this uses Critical Alerts. On Android it is a Do Not Disturb override. Heads-ups stay quiet.</p>
        <p className="small muted">In this demo, nothing on your device changes.</p>
        <div className="btn-col">
          <button className="btn btn-primary" onClick={() => set(true)}>
            Allow
          </button>
          <button className="btn btn-quiet" onClick={() => set(false)}>
            Not now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <p className="label">Before you start</p>
      <h1 className="title">What Steady misses</h1>
      <p className="lede">{missesText(people)}</p>
      <button className="btn btn-primary btn-block" style={{ marginTop: 18 }} onClick={() => store.updateParent((s) => ({ ...s, step: "done" }))}>
        I understand
      </button>
    </div>
  );
}

function noteTitle(n: Note, people: Parameters<typeof urgentText>[0]) {
  return n.event.type === "urgent" ? urgentText(people).title : headsUpText(n.event, people).title;
}

export function ParentPhone() {
  const snap = useSnap();
  const ps = snap.parent;
  const teen = snap.sim.world.teen;
  const people = teen.people;
  const now = snap.now;
  const [view, setView] = useState<View>({ k: "home" });
  const notes = useMemo(() => notesFrom(snap.events, now), [snap.events, now]);
  const conn = connection(snap.events, now, undefined, ps.pairedAt ?? null);
  const status = statusLine(conn.state, conn.lowData, conn.noKeyboard, people);
  const hasOthers = !!(people.second || people.trusted);
  const known = useRef<Set<string> | null>(null);

  // A note that arrives while this phone is open opens by itself, unless it is a heads-up
  // held quietly after "Booked a doctor". Urgent notes always open.
  useEffect(() => {
    if (known.current == null) {
      known.current = new Set(notes.map((n) => n.id));
      return;
    }
    const seen = known.current;
    const fresh = [...notes].reverse().find((n) => !seen.has(n.id));
    notes.forEach((n) => seen.add(n.id));
    if (!fresh || ps.step !== "done") return;
    const quiet = fresh.event.type === "heads_up" && headsUpView(fresh, notes, ps.replies, now).quiet;
    if (!quiet) setView({ k: "note", id: fresh.id, fresh: true });
  }, [notes, ps.step, ps.replies, now]);

  useEffect(() => {
    if (ps.step !== "done") setView({ k: "home" });
  }, [ps.step]);

  let body: React.ReactNode;
  let back: (() => void) | undefined;
  if (ps.step !== "done") body = <PairFlow />;
  else if (view.k === "note") {
    const n = notes.find((x) => x.id === view.id);
    back = () => setView({ k: "home" });
    body = n ? (
      <NoteScreen
        note={n}
        notes={notes}
        fresh={view.fresh}
        onSay={() => setView({ k: "say" })}
        onCantReach={() => setView({ k: "cant", id: n.id })}
      />
    ) : null;
  } else if (view.k === "say") {
    back = () => setView({ k: "home" });
    body = <WhatToSay />;
  } else if (view.k === "cant") {
    back = () => setView({ k: "note", id: view.id, fresh: false });
    body = <CantReach />;
  } else {
    const shown = [...notes].reverse();
    const loud = shown.filter((n) => n.event.type === "urgent" || !headsUpView(n, notes, ps.replies, now).quiet);
    const quiet = shown.filter((n) => n.event.type === "heads_up" && headsUpView(n, notes, ps.replies, now).quiet);
    body = (
      <div>
        <p className="label">Linked to {people.teen}'s phone</p>
        <h1 className="sentence" style={{ fontSize: 22 }}>
          <span className={`status-dot${conn.state === "on" ? "" : " off"}`} aria-hidden="true" />
          {status.head}
        </h1>
        {status.sub && <p className="small">{status.sub}</p>}
        {conn.lastAt != null && <p className="small muted">Last heard from {fmtTime(conn.lastAt)}.</p>}

        <h2 className="label" style={{ marginTop: 22 }}>
          Notes
        </h2>
        {loud.length === 0 && <p className="muted">No notes. No note does not mean {people.teen} is fine.</p>}
        {loud.map((n) => {
          const isU = n.event.type === "urgent";
          const hv = !isU ? headsUpView(n, notes, ps.replies, now) : null;
          const uv = isU ? urgentView(n, ps.replies, now, hasOthers) : null;
          const reply = isU ? uv?.firstReply : hv?.lastReply;
          const remind = hv?.reminderAt != null && now >= hv.reminderAt;
          return (
            <button key={n.id} className="list-note" onClick={() => setView({ k: "note", id: n.id, fresh: false })}>
              <span className="label">{isU ? "Urgent" : "Heads-up"} · {fmtTime(n.at)}</span>
              <span style={{ display: "block", fontWeight: 500, margin: "4px 0" }}>{noteTitle(n, people)}</span>
              <span className="small muted">
                {reply ? `You replied: ${replyLabel(reply.choice, people.teenPronoun)}` : isU ? `No reply yet. ${soundedTimes(1 + (uv?.repeatCount ?? 0))}` : "No reply yet."}
                {remind ? " Reminder: worth checking in." : ""}
              </span>
            </button>
          );
        })}
        {quiet.length > 0 && (
          <>
            <h2 className="label" style={{ marginTop: 18 }}>
              History, held quietly after "Booked a doctor"
            </h2>
            {quiet.map((n) => (
              <button key={n.id} className="list-note card-soft" onClick={() => setView({ k: "note", id: n.id, fresh: false })}>
                <span className="label">Heads-up · {fmtTime(n.at)}</span>
                <span style={{ display: "block", margin: "4px 0" }}>{noteTitle(n, people)}</span>
              </button>
            ))}
          </>
        )}
        <button className="btn btn-block" style={{ marginTop: 16 }} onClick={() => setView({ k: "say" })}>
          What to say
        </button>
        <p className="small muted" style={{ marginTop: 16 }}>
          Notes never include {people.teen}'s messages, answers or scores. Your replies stay on this phone.
        </p>
      </div>
    );
  }

  return (
    <div className="phone" aria-label={`${people.parent}'s phone`}>
      <ParentTop onBack={back} />
      <div className="phone-body">{body}</div>
      <ProtoLine />
    </div>
  );
}

function soundedTimes(n: number): string {
  return n === 1 ? "Sounded once." : n === 2 ? "Sounded twice." : `Sounded ${n} times.`;
}

export function replyLabel(choice: string, pron: Pronoun): string {
  const obj = pron === "he" ? "him" : pron === "they" ? "them" : "her";
  const m: Record<string, string> = {
    talked: "We talked",
    booked: "Booked a doctor",
    not_yet: "Not yet",
    with_her: `I'm with ${obj}`,
    called_988: "Called 988",
    cant_reach: `I can't reach ${obj}`,
  };
  return m[choice] ?? choice;
}
