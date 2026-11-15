import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C } from "../theme";
import { f, sec } from "../timing";
import { clamp, ease } from "./anim";

/** When the stage turns from night to morning: just before "So we built Steady". */
export const dawnFrame = () => f(sec("steady").start) - 10;

/** Night for the problem, then paper opens from the centre like a sunrise and stays. A little grain on both. */
export const Stage: React.FC = () => {
  const frame = useCurrentFrame();
  const at = dawnFrame();
  const open = interpolate(frame, [at, at + 34], [0, 1], { ...clamp, easing: ease });
  const seed = Math.floor(frame / 6) % 40;
  return (
    <AbsoluteFill style={{ background: C.night }}>
      <AbsoluteFill style={{ background: "radial-gradient(110% 85% at 50% 38%, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.42) 100%)" }} />
      {open > 0 ? (
        <AbsoluteFill style={{ clipPath: `circle(${open * 1250}px at 960px 560px)`, background: C.paper }}>
          <AbsoluteFill style={{ background: "radial-gradient(90% 70% at 50% 34%, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0) 62%)" }} />
        </AbsoluteFill>
      ) : null}
      <svg width="1920" height="1080" style={{ position: "absolute", inset: 0, opacity: open > 0.5 ? 0.05 : 0.07, mixBlendMode: open > 0.5 ? "multiply" : "screen" }}>
        <filter id={`grain${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={seed} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain${seed})`} />
      </svg>
    </AbsoluteFill>
  );
};
