import { useId } from "react";

/** Stable, the mascot who does the weekly check-in and asks the questions.
 *  idle: floats and breathes, blinks now and then. ask: turns amber, a soft ring pulses.
 *  happy: eyes squint shut and it gives a small hop. Kept off the safety screens on purpose. */
export type StableMood = "idle" | "ask" | "happy";

export function Stable({ mood = "idle", size = 40, className = "", float = true }: { mood?: StableMood; size?: number; className?: string; float?: boolean }) {
  const id = useId().replace(/:/g, "");
  const ask = mood === "ask";
  const top = ask ? "#F7BE6B" : "#86C9A9";
  const mid = ask ? "#F2A33A" : "#5FAE8B";
  const low = ask ? "#D98A22" : "#4C9877";
  return (
    <span className={`stable stable-${mood}${float ? " stable-float" : ""} ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <defs>
          <radialGradient id={`b${id}`} cx="38%" cy="32%" r="75%">
            <stop offset="0%" stopColor={top} />
            <stop offset="55%" stopColor={mid} />
            <stop offset="100%" stopColor={low} />
          </radialGradient>
        </defs>
        {ask && <circle className="stable-ring" cx="50" cy="56" r="38" fill="none" stroke="#F2A33A" strokeWidth="3" />}
        <g className="stable-body">
          <path className="stable-sprout" d="M50 22 C50 16 50 13 50 10 M50 14 C53 8 60 7 64 9 C61 14 55 16 50 14" fill="#5FAE8B" stroke="#4C9877" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <ellipse cx="50" cy="57" rx="37" ry="35" fill={`url(#b${id})`} />
          <ellipse cx="37" cy="40" rx="9" ry="6" fill="#fff" opacity="0.32" transform="rotate(-24 37 40)" />
          <circle cx="32" cy="64" r="5" fill="#F2A33A" opacity={ask ? 0 : 0.28} />
          <circle cx="68" cy="64" r="5" fill="#F2A33A" opacity={ask ? 0 : 0.28} />
          {mood === "happy" ? (
            <g fill="none" stroke="#15171A" strokeWidth="3" strokeLinecap="round">
              <path d="M36 56 Q41 50 46 56" />
              <path d="M54 56 Q59 50 64 56" />
            </g>
          ) : (
            <g className="stable-eyes" fill="#15171A">
              <ellipse cx="41" cy="55" rx="3.6" ry="4.6" />
              <ellipse cx="59" cy="55" rx="3.6" ry="4.6" />
            </g>
          )}
          <path d={ask ? "M45 68 Q50 70 55 68" : "M43 66 Q50 72 57 66"} fill="none" stroke="#15171A" strokeWidth="2.8" strokeLinecap="round" />
        </g>
      </svg>
    </span>
  );
}
