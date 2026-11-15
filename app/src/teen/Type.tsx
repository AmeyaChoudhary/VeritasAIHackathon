import { useEffect, useRef, useState } from "react";
import { useSnap, useStore } from "../store/hooks";
import { checkSelfHarm } from "../engine/selfharm";
import { isLowMood, scoreTone } from "../engine/tone";
import { textHash } from "../engine/hash";

/** Stands in for the Steady keyboard. Each message is scored on this phone, then dropped.
 *  Only a number per message stays, as a dot on the tone line. */
export function TypeScreen({ incoming }: { incoming: { text: string; key: number } | null }) {
  const snap = useSnap();
  const store = useStore();
  const [draft, setDraft] = useState("");
  const [fading, setFading] = useState<{ text: string; key: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const fade = (text: string) => {
    window.clearTimeout(timer.current);
    setFading({ text, key: Date.now() });
    timer.current = window.setTimeout(() => setFading(null), 2300);
  };

  useEffect(() => {
    if (incoming) fade(incoming.text);
  }, [incoming]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const level = checkSelfHarm(text).level;
    const m = store.toneModel;
    const score = m ? scoreTone(m, text) : null;
    const low = m ? isLowMood(m, text) : null;
    // Only a short hash of the words goes on, so the same message from Gmail or a data file
    // counts once. The words themselves are dropped below.
    store.dispatch({ a: "typed", level, score, low, textHash: level === "none" ? undefined : textHash(text) });
    fade(text);
    setDraft("");
  };

  const dots = snap.sim.dots.slice(-18);
  const W = 320;
  const H = 70;
  const x = (i: number) => 14 + (i * (W - 28)) / 17;

  return (
    <div>
      <p className="label">Type</p>
      <h1 className="title" style={{ fontSize: 20 }}>
        This box stands in for the Steady keyboard.
      </h1>
      <div aria-live="off" style={{ minHeight: 56, margin: "6px 0" }}>
        {fading && (
          <p key={fading.key} className="fade-text" aria-hidden="true">
            {fading.text}
          </p>
        )}
      </div>
      <div className="label" style={{ display: "flex", justifyContent: "space-between" }}>
        <span>TONE LINE</span>
        <span>{snap.tone === "ready" ? "SCORED ON THIS PHONE" : snap.tone === "loading" ? "LOADING" : ""}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${dots.length} messages scored on this phone`}>
        <line x1={4} x2={W - 4} y1={46} y2={46} stroke="#A6ADB5" strokeWidth={1} />
        {dots.map((d, i) => (
          <circle
            key={d.at + "-" + i}
            className="drop"
            cx={x(i)}
            cy={46}
            r={3.4}
            fill={d.low ? "#2A2E33" : "#FBFBFC"}
            stroke="#2A2E33"
            strokeWidth={1}
          />
        ))}
        <text x={4} y={66} fontSize="9" fill="#5C636D" fontFamily="IBM Plex Mono, monospace">
          EACH DOT IS ONE MESSAGE. THE WORDS ARE GONE.
        </text>
      </svg>
      {snap.tone === "failed" && <p className="small muted">Tone model not loaded. Words are still checked for self-harm.</p>}
      <label className="sr-only" htmlFor="typebox">
        Message
      </label>
      <textarea
        id="typebox"
        className="typebox"
        placeholder="Type a message"
        value={draft}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
        <span className="counter">TEXT SENT: 0 BYTES</span>
        <button className="btn btn-primary" onClick={send} disabled={!draft.trim()}>
          Send
        </button>
      </div>
      <p className="small muted" style={{ marginTop: 12 }}>
        Each message is scored on this phone, then discarded. Typed words never leave it.
      </p>
    </div>
  );
}
