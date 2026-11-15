import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { cue, f, sceneRange, totalFrames } from "../timing";
import { clamp, enter, ramp } from "../components/anim";
import { Icon, Mark, Mono } from "../components/ui";

const Row: React.FC<{ at: number; icon: "tap" | "model" | "doctor"; title: string; sub: string }> = ({ at, icon, title, sub }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 48, ...enter(frame, at, 26, 18) }}>
      <div style={{ width: 148, height: 148, borderRadius: 42, background: C.card, boxShadow: "0 10px 30px rgba(21,23,26,0.07), 0 0 0 1px rgba(21,23,26,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon name={icon} size={74} />
      </div>
      <div>
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 92, letterSpacing: -3.6, color: C.ink, lineHeight: 1.04 }}>{title}</div>
        <div style={{ fontFamily: F.body, fontSize: 36, color: C.inkSoft, marginTop: 12 }}>{sub}</div>
      </div>
    </div>
  );
};

/** What's next, then the end card. */
export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const r0 = sceneRange("next");
  const L = (t: number) => f(t) - r0.from;
  const n = (ph: string) => L(cue("next", ph));
  const c = (ph: string) => L(cue("close", ph));
  const askAt = n("asks first"), harmAt = n("Its self-harm check"), clinAt = n("a clinician");
  const closeAt = c("Steady is a prototype"), butAt = c("But asking");
  const rowsOut = interpolate(frame, [closeAt - 12, closeAt - 2], [1, 0], clamp);
  const endIn = ramp(frame, closeAt - 2, 20);
  const draw = ramp(frame, closeAt, 34);
  const last = totalFrames() - r0.from;
  const fade = interpolate(frame, [last - 14, last - 2], [1, 0], clamp);

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: rowsOut }}>
        <div style={{ position: "absolute", left: 150, top: 130, ...enter(frame, 2, 22, 16) }}>
          <Mono size={20}>What's next</Mono>
        </div>
        <div style={{ position: "absolute", left: 150, top: 230, display: "flex", flexDirection: "column", gap: 70 }}>
          <Row at={askAt - 4} icon="tap" title="Ask first" sub="One tap, every week. Phone signals become context." />
          <Row at={harmAt - 2} icon="model" title="A real self-harm model" sub="The phrase list missed 9 of 15 test messages." />
          <Row at={clinAt - 6} icon="doctor" title="A clinician's review" sub="Of every rule and every note, before anyone relies on it." />
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ opacity: endIn * fade, alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 30, transform: `translateY(${(1 - endIn) * 20 - 70}px)` }}>
          <Mark size={170} draw={draw} stroke={2.4} />
          <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 190, letterSpacing: -8, color: C.ink, lineHeight: 1 }}>Steady</span>
        </div>
        <div style={{ position: "absolute", top: 610, left: 0, right: 0, textAlign: "center", fontFamily: F.display, fontWeight: 500, fontSize: 58, letterSpacing: -1.6, color: C.inkSoft, opacity: ramp(frame, butAt - 4, 20) }}>knowing when to ask</div>
        <div style={{ position: "absolute", top: 760, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: ramp(frame, closeAt + 6, 18) }}>
          <Mono size={19} style={{ padding: "14px 26px", borderRadius: 999, background: C.card, boxShadow: "0 0 0 1px rgba(21,23,26,0.08)" }}>Prototype. Not medical advice.</Mono>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
