import { useCurrentFrame } from "remotion";

/** Stable, the app's mascot (app/src/ui/Stable.tsx), drawn frame by frame for the video:
 *  it breathes, its sprout sways, and it blinks every few seconds. */
export const StableMascot: React.FC<{ size: number; mood?: "idle" | "ask" | "happy"; style?: React.CSSProperties }> = ({ size, mood = "idle", style }) => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const breathe = Math.sin((t * 2 * Math.PI) / 3.6);
  const sx = 1 + 0.025 * breathe, sy = 1 - 0.02 * breathe;
  const sway = 5.5 * Math.sin((t * 2 * Math.PI) / 3.6 + 0.6);
  const phase = (t % 4.2) / 4.2;
  const blink = phase > 0.93 && phase < 0.97 ? 0.12 : 1;
  const ask = mood === "ask";
  const top = ask ? "#F7BE6B" : "#86C9A9", mid = ask ? "#F2A33A" : "#5FAE8B", low = ask ? "#D98A22" : "#4C9877";
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ overflow: "visible", ...style }}>
      <defs>
        <radialGradient id="stableBody" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor={top} />
          <stop offset="55%" stopColor={mid} />
          <stop offset="100%" stopColor={low} />
        </radialGradient>
      </defs>
      <ellipse cx="50" cy="96" rx={26 - 2 * breathe} ry="3.5" fill="#15171A" opacity="0.08" />
      <g transform={`translate(50 92) scale(${sx} ${sy}) translate(-50 -92)`}>
        <g transform={`rotate(${sway} 50 22)`}>
          <path d="M50 22 C50 16 50 13 50 10 M50 14 C53 8 60 7 64 9 C61 14 55 16 50 14" fill="#5FAE8B" stroke="#4C9877" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <ellipse cx="50" cy="57" rx="37" ry="35" fill="url(#stableBody)" />
        <ellipse cx="37" cy="40" rx="9" ry="6" fill="#fff" opacity="0.32" transform="rotate(-24 37 40)" />
        <circle cx="32" cy="64" r="5" fill="#F2A33A" opacity={ask ? 0 : 0.28} />
        <circle cx="68" cy="64" r="5" fill="#F2A33A" opacity={ask ? 0 : 0.28} />
        {mood === "happy" ? (
          <g fill="none" stroke="#15171A" strokeWidth="3" strokeLinecap="round">
            <path d="M36 56 Q41 50 46 56" />
            <path d="M54 56 Q59 50 64 56" />
          </g>
        ) : (
          <g fill="#15171A" transform={`translate(0 55) scale(1 ${blink}) translate(0 -55)`}>
            <ellipse cx="41" cy="55" rx="3.6" ry="4.6" />
            <ellipse cx="59" cy="55" rx="3.6" ry="4.6" />
          </g>
        )}
        <path d="M43 66 Q50 72 57 66" fill="none" stroke="#15171A" strokeWidth="2.8" strokeLinecap="round" />
      </g>
    </svg>
  );
};
