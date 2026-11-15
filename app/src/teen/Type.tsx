import { useEffect, useRef, useState } from "react";
import { useSnap, useStore } from "../store/hooks";
import { checkSelfHarm } from "../engine/selfharm";
import { isLowMood, scoreTone } from "../engine/tone";
import { textHash } from "../engine/hash";
import { Icon } from "../ui/icons";

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
    timer.current = window.setTimeout(() => setFading(null), 2600);
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
  const H = 40;
  const x = (i: number) => 14 + (i * (W - 28)) / 17;
  const lowCount = dots.filter((d) => d.low).length;

  return (
    <div className="type">
      <p className="label">Type</p>
      <p className="type-lede">This box stands in for the Steady keyboard.</p>

      <div className="card tone-card">
        <div className="tone-head">
          <span className="label">Tone line</span>
          <span className="label">{snap.tone === "ready" ? "Scored on this phone" : snap.tone === "loading" ? "Loading" : ""}</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${dots.length} messages scored on this phone, ${lowCount} read as low mood`}>
          <line x1={6} x2={W - 6} y1={20} y2={20} className="tone-rule" />
          {dots.map((d, i) => (
            <circle key={d.at + "-" + i} className={`drop tone-dot${d.low ? " low" : ""}`} cx={x(i)} cy={20} r={5} />
          ))}
        </svg>
        <div className="tone-key">
          <span>
            <i className="key-dot low" /> Read as low mood
          </span>
          <span>
            <i className="key-dot" /> Not
          </span>
        </div>
      </div>
      {snap.tone === "failed" && <p className="small muted">Tone model not loaded. Words are still checked for self-harm.</p>}

      <div className="chat" aria-live="off">
        {fading ? (
          <p key={fading.key} className="bubble" aria-hidden="true">
            {fading.text}
          </p>
        ) : (
          <p className="chat-hint">
            <Icon name={dots.length ? "check" : "keyboard"} size={18} />
            {dots.length ? "Each dot is one message. The words are gone." : "Type something. It becomes a dot, and the words are dropped."}
          </p>
        )}
      </div>

      <div className="composer">
        <label className="sr-only" htmlFor="typebox">
          Message
        </label>
        <textarea
          id="typebox"
          className="typebox"
          placeholder="Type a message"
          value={draft}
          rows={2}
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
        <button className="btn btn-primary" onClick={send} disabled={!draft.trim()}>
          Send
        </button>
      </div>
      <p className="sent-chip">
        <Icon name="lock" size={14} />
        <span className="counter">TEXT SENT: 0 BYTES</span>
      </p>
    </div>
  );
}
