import { interpolate, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { clamp, ease, enter, ramp } from "./anim";

/** Small monospace label. */
export const Mono: React.FC<{ children: React.ReactNode; color?: string; size?: number; style?: React.CSSProperties }> = ({ children, color = C.inkSoft, size = 20, style }) => (
  <div style={{ fontFamily: F.mono, fontSize: size, letterSpacing: size * 0.12, textTransform: "uppercase", color, fontWeight: 500, ...style }}>{children}</div>
);

/** The Stability mark: one calm wave. `draw` 0 to 1 draws it. */
export const Mark: React.FC<{ size?: number; color?: string; draw?: number; stroke?: number }> = ({ size = 64, color = C.ink, draw = 1, stroke = 2.6 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32">
    <path d="M4 18 C 10 18, 11.5 11, 16 11 S 22 18, 28 14" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
  </svg>
);

/** Words that rise and sharpen in, each on its own frame. */
export const Words: React.FC<{ words: { w: string; at: number }[]; style?: React.CSSProperties; accent?: Record<number, string> }> = ({ words, style, accent = {} }) => {
  const frame = useCurrentFrame();
  return (
    <div style={style}>
      {words.map((w, i) => {
        const p = interpolate(frame, [w.at - 2, w.at + 9], [0, 1], { ...clamp, easing: ease });
        return (
          <span key={i} style={{ display: "inline-block", opacity: p, transform: `translateY(${(1 - p) * 16}px)`, filter: `blur(${(1 - p) * 6}px)`, color: accent[i], marginRight: "0.24em" }}>{w.w}</span>
        );
      })}
    </div>
  );
};

/** A tag and a big title beside the phone, entering at `at` and leaving at `until`. */
export const Callout: React.FC<{ at: number; until?: number; tag: string; title: React.ReactNode; body?: React.ReactNode; color?: string; style?: React.CSSProperties; size?: number }> = ({ at, until, tag, title, body, color = C.ink, style, size = 76 }) => {
  const frame = useCurrentFrame();
  if (frame < at - 2) return null;
  const out = until !== undefined ? interpolate(frame, [until - 9, until], [1, 0], clamp) : 1;
  if (out <= 0) return null;
  const e = enter(frame, at, 28, 18);
  return (
    <div style={{ ...style, opacity: e.opacity * out, transform: e.transform }}>
      <Mono size={19} color={C.inkSoft}>{tag}</Mono>
      <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: size, lineHeight: 1.02, color, marginTop: 16, letterSpacing: -size * 0.034 }}>{title}</div>
      {body ? <div style={{ fontFamily: F.body, fontSize: 30, lineHeight: 1.36, color: C.inkSoft, marginTop: 18, maxWidth: 560 }}>{body}</div> : null}
    </div>
  );
};

/** A horizontal bar that grows to `value` percent, with its label and number. */
export const Bar: React.FC<{ at: number; label: string; value: number; max: number; color: string; width: number; strong?: boolean; sub?: string; text?: string }> = ({ at, label, value, max, color, width, strong, sub, text = C.ink }) => {
  const frame = useCurrentFrame();
  const p = ramp(frame, at, 30);
  const shown = Math.round(value * p);
  const e = enter(frame, at - 4, 18, 14);
  return (
    <div style={{ ...e, width }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontFamily: F.display, fontWeight: strong ? 700 : 500, fontSize: 36, color: text, letterSpacing: -0.8 }}>{label}{sub ? <span style={{ fontFamily: F.body, fontWeight: 400, fontSize: 24, color: C.inkSoft, marginLeft: 14, letterSpacing: 0 }}>{sub}</span> : null}</span>
        <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: strong ? 64 : 46, color: text, letterSpacing: -2, fontVariantNumeric: "tabular-nums" }}>{shown}%</span>
      </div>
      <div style={{ height: strong ? 30 : 22, borderRadius: 16, background: C.inkFaint, overflow: "hidden" }}>
        <div style={{ width: `${(value / max) * 100 * p}%`, height: "100%", borderRadius: 16, background: color }} />
      </div>
    </div>
  );
};

/** Simple line icons, 24-unit box. */
export const Icon: React.FC<{ name: "moon" | "chat" | "move" | "tone" | "lock" | "tap" | "model" | "doctor" | "note" | "music" | "play" | "globe" | "photo" | "clip" | "game" | "news"; size?: number; color?: string; stroke?: number }> = ({ name, size = 40, color = C.ink, stroke = 1.75 }) => {
  const p = { fill: "none", stroke: color, strokeWidth: stroke, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      {name === "moon" && <path {...p} d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />}
      {name === "chat" && <path {...p} d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5Z" />}
      {name === "move" && <path {...p} d="M3 13h4l2.5-6 4 11 2.5-7 1.5 2H21" />}
      {name === "tone" && <path {...p} d="M4 12c2.2 0 2.2-5 4.4-5s2.2 10 4.4 10 2.2-7 4.4-7c1.4 0 1.9 2 2.8 2" />}
      {name === "lock" && (<><rect {...p} x="5" y="10.5" width="14" height="9.5" rx="2.5" /><path {...p} d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>)}
      {name === "tap" && (<><circle {...p} cx="12" cy="12" r="3.2" /><circle {...p} cx="12" cy="12" r="8" opacity="0.45" /></>)}
      {name === "model" && (<><circle {...p} cx="6" cy="7" r="2" /><circle {...p} cx="6" cy="17" r="2" /><circle {...p} cx="18" cy="12" r="2" /><path {...p} d="M8 7.8 16 11.2M8 16.2l8-3.4" /></>)}
      {name === "doctor" && (<><path {...p} d="M6 4v5a4 4 0 0 0 8 0V4" /><path {...p} d="M10 13v2.5a4.5 4.5 0 0 0 9 0V14" /><circle {...p} cx="19" cy="12" r="2" /></>)}
      {name === "note" && (<><rect {...p} x="5" y="4" width="14" height="16" rx="3" /><path {...p} d="M8.5 9h7M8.5 12.5h7M8.5 16h4" /></>)}
      {name === "music" && <path {...p} d="M9 17.5V6l10-2v11.5M9 17.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm10-2a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z" />}
      {name === "play" && (<><rect {...p} x="3" y="5.5" width="18" height="13" rx="3.5" /><path {...p} d="M10.5 9.5v5l4.2-2.5Z" /></>)}
      {name === "photo" && (<><rect {...p} x="4" y="4" width="16" height="16" rx="4.5" /><circle {...p} cx="12" cy="12" r="3.6" /><path {...p} d="M16.6 7.4h.01" /></>)}
      {name === "clip" && (<><rect {...p} x="7" y="3" width="10" height="18" rx="2.5" /><path {...p} d="M10.8 9.5v5l3.6-2.5Z" /></>)}
      {name === "game" && (<><path {...p} d="M7.5 8h9a4.5 4.5 0 0 1 4.4 5.4l-.5 2.4a2.3 2.3 0 0 1-4 1L15 15H9l-1.4 1.8a2.3 2.3 0 0 1-4-1l-.5-2.4A4.5 4.5 0 0 1 7.5 8Z" /><path {...p} d="M8 10.7v2.6M6.7 12h2.6M15.5 11h.01M17.3 12.8h.01" /></>)}
      {name === "news" && (<><path {...p} d="M5 5.5h11.5v13H6.5A1.5 1.5 0 0 1 5 17V5.5Z" /><path {...p} d="M16.5 9H19v8.5a1.5 1.5 0 0 1-3 0" /><path {...p} d="M8 9h5.5M8 12h5.5M8 15h3.5" /></>)}
      {name === "globe" && (<><circle {...p} cx="12" cy="12" r="8.5" /><path {...p} d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5S9.4 5.9 12 3.5Z" /></>)}
    </svg>
  );
};
