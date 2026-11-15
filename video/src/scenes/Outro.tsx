import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { cue, f, sceneRange, totalFrames } from "../timing";
import { clamp, ramp } from "../components/anim";
import { Mark, Mono } from "../components/ui";
import { StableMascot } from "../components/StableMascot";

/** The end card: the mark, the line, Stable, and the prototype note the Health track asks for. */
export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const r0 = sceneRange("close");
  const L = (t: number) => f(t) - r0.from;
  const c = (ph: string) => L(cue("close", ph));
  const nameAt = c("Stability"), lineAt = c("Knowing when to ask"), helpAt = c("so more teens");
  const endIn = ramp(frame, nameAt - 4, 20);
  const draw = ramp(frame, nameAt, 34);
  const last = totalFrames() - r0.from;
  const fade = interpolate(frame, [last - 14, last - 2], [1, 0], clamp);
  const bob = Math.sin(frame / 30 * 1.8) * 8;
  return (
    <AbsoluteFill style={{ opacity: endIn * fade, alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 30, transform: `translateY(${(1 - endIn) * 20 - 90}px)` }}>
        <Mark size={150} draw={draw} stroke={2.4} />
        <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 176, letterSpacing: -7.5, color: C.ink, lineHeight: 1 }}>Stability</span>
      </div>
      <div style={{ position: "absolute", top: 580, left: 0, right: 0, textAlign: "center", fontFamily: F.display, fontWeight: 500, fontSize: 58, letterSpacing: -1.6, color: C.inkSoft, opacity: ramp(frame, lineAt - 4, 20) }}>knowing when to ask</div>
      <div style={{ position: "absolute", top: 700 + bob, left: 960 - 60, opacity: ramp(frame, helpAt - 2, 20) }}>
        <StableMascot size={120} mood="happy" />
      </div>
      <div style={{ position: "absolute", top: 900, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: ramp(frame, lineAt + 10, 18) }}>
        <Mono size={17} style={{ padding: "12px 22px", borderRadius: 999, background: C.card, boxShadow: "0 0 0 1px rgba(21,23,26,0.08)" }}>Prototype. Not medical advice.</Mono>
      </div>
    </AbsoluteFill>
  );
};
