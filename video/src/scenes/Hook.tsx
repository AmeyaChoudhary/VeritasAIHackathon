import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { cue, f, sceneRange, sec } from "../timing";
import { clamp, ease, exitAt, ramp, settle } from "../components/anim";
import { Mono, Words } from "../components/ui";

/** A signal line that runs level, then slips below its band at `slipX`. Deterministic wobble, no randomness per frame. */
const linePath = (y: number, slipX: number, seed: number) => {
  const pts: string[] = [];
  for (let x = 200; x <= 1720; x += 8) {
    const wob = Math.sin(x / 61 + seed) * 5 + Math.sin(x / 23 + seed * 2.3) * 2.5;
    const k = Math.min(1, Math.max(0, (x - slipX) / 230));
    const drop = k * k * (3 - 2 * k) * 58;
    pts.push(`${x === 200 ? "M" : "L"}${x} ${(y + wob + drop).toFixed(1)}`);
  }
  return pts.join(" ");
};

/** The problem, on the night stage: 1 in 5, most untreated, and a change too slow to see. */
export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const r = sceneRange("hook", 0);
  const L = (t: number) => f(t) - r.from;
  const c = (p: string) => L(cue("hook", p));
  const oneAt = c("One in five"), depAt = c("depression"), mostAt = c("and most"), noAt = c("no treatment");
  const buildAt = c("It builds slowly"), sleepAt = c("a little less sleep"), textsAt = c("fewer texts"), plansAt = c("dropped plans");
  const soAt = c("So nobody");
  const out = exitAt(frame, r.dur + 4, 12);

  const aOut = interpolate(frame, [mostAt - 12, mostAt - 3], [1, 0], clamp);
  const bIn = ramp(frame, mostAt - 7, 12);
  const bOut = interpolate(frame, [buildAt + 2, buildAt + 12], [1, 0], clamp);
  const cIn = ramp(frame, buildAt + 8, 14);
  const dim = interpolate(frame, [soAt - 6, soAt + 14], [1, 0.16], { ...clamp, easing: ease });

  // lines draw from the start of the "builds slowly" beat to "So nobody"; each slip lands as its word is spoken
  const drawP = interpolate(frame, [buildAt + 8, soAt - 4], [0, 1], clamp);
  const xAt = (fr: number) => 200 + 1520 * interpolate(fr, [buildAt + 8, soAt - 4], [0, 1], clamp);
  const lines = [
    { y: 380, label: "Sleep", slip: xAt(sleepAt) - 60, seed: 1.3 },
    { y: 560, label: "Texts", slip: xAt(textsAt) - 60, seed: 4.1 },
    { y: 740, label: "Plans", slip: xAt(plansAt) - 60, seed: 7.7 },
  ];
  const soWords = sec("hook").words.slice(-4).map((w) => ({ w: w.w, at: L(w.s) }));

  return (
    <AbsoluteFill style={{ opacity: out }}>
      {/* A: one in five */}
      <AbsoluteFill style={{ opacity: aOut }}>
        <div style={{ position: "absolute", left: 150, top: 300, ...{ opacity: ramp(frame, oneAt - 3, 14), transform: `translateY(${(1 - ramp(frame, oneAt - 3, 14)) * 30}px)` } }}>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 300, lineHeight: 0.92, letterSpacing: -13, color: C.snow }}>1 in 5</div>
          <Mono size={22} color={C.snowSoft} style={{ marginTop: 34 }}>US teenagers, every year</Mono>
        </div>
        <div style={{ position: "absolute", left: 1060, top: 392, display: "flex", gap: 34 }}>
          {[0, 1, 2, 3, 4].map((i) => {
            const p = settle(frame, oneAt + 2 + i * 4);
            const hit = i === 1 ? ramp(frame, depAt - 2, 18) : 0;
            return (
              <div key={i} style={{ width: 124, height: 124, borderRadius: 999, border: `3px solid ${hit > 0.5 ? C.amber : C.snowSoft}`, background: `rgba(242,163,58,${hit})`, opacity: Math.min(1, p * 1.3), transform: `scale(${0.6 + 0.4 * p})`, boxShadow: hit > 0 ? `0 0 ${60 * hit}px rgba(242,163,58,${0.35 * hit})` : undefined }} />
            );
          })}
        </div>
        <div style={{ position: "absolute", left: 1062, top: 562, opacity: ramp(frame, depAt + 2, 16) }}>
          <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 54, letterSpacing: -1.6, color: C.snow, lineHeight: 1.1 }}>goes through depression</div>
        </div>
      </AbsoluteFill>

      {/* B: most get no treatment */}
      <AbsoluteFill style={{ opacity: bIn * bOut }}>
        <div style={{ position: "absolute", left: 150, top: 300, transform: `translateY(${(1 - bIn) * 26}px)` }}>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 300, lineHeight: 0.92, letterSpacing: -13, color: C.amber }}>{Math.round(59 * ramp(frame, mostAt - 5, 18))}%</div>
          <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 64, letterSpacing: -2, color: C.snow, marginTop: 26, opacity: ramp(frame, noAt - 8, 12) }}>get no treatment</div>
        </div>
        <div style={{ position: "absolute", left: 1010, top: 448, width: 760 }}>
          <div style={{ display: "flex", height: 46, borderRadius: 23, overflow: "hidden", background: C.snowFaint }}>
            <div style={{ width: `${41 * ramp(frame, mostAt - 3, 14)}%`, background: C.snowSoft }} />
            <div style={{ width: `${59 * ramp(frame, mostAt + 6, 18)}%`, background: C.amber }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
            <Mono size={19} color={C.snowSoft}>Treated 41%</Mono>
            <Mono size={19} color={C.amber}>Not treated 59%</Mono>
          </div>
        </div>
        <Mono size={17} color={C.snowSoft} style={{ position: "absolute", left: 152, top: 860 }}>Source: NIMH, 2021. Adolescents with a major depressive episode.</Mono>
      </AbsoluteFill>

      {/* C: it builds slowly */}
      <AbsoluteFill style={{ opacity: cIn }}>
        <div style={{ position: "absolute", left: 200, top: 150, fontFamily: F.display, fontWeight: 700, fontSize: 96, letterSpacing: -3.4, color: C.snow, opacity: dim < 0.9 ? dim : 1, transform: `translateY(${(1 - cIn) * 22}px)` }}>It builds slowly.</div>
        <svg width="1920" height="1080" style={{ position: "absolute", inset: 0, opacity: dim }}>
          {lines.map((ln, i) => {
            const d = linePath(ln.y, ln.slip, ln.seed);
            const clipW = 1520 * drawP;
            return (
              <g key={i}>
                <rect x="200" y={ln.y - 26} width="1520" height="52" rx="26" fill={C.snowFaint} opacity={0.5} />
                <clipPath id={`draw${i}`}><rect x="200" y={ln.y - 120} width={clipW} height="260" /></clipPath>
                <clipPath id={`amb${i}`}><rect x={ln.slip + 60} y={ln.y - 120} width={Math.max(0, 200 + clipW - ln.slip - 60)} height="260" /></clipPath>
                <path d={d} fill="none" stroke={C.snow} strokeWidth="4" strokeLinecap="round" clipPath={`url(#draw${i})`} />
                <path d={d} fill="none" stroke={C.amber} strokeWidth="4.5" strokeLinecap="round" clipPath={`url(#amb${i})`} />
              </g>
            );
          })}
        </svg>
        {lines.map((ln, i) => (
          <Mono key={i} size={20} color={C.snowSoft} style={{ position: "absolute", left: 200, top: ln.y - 74, opacity: dim * ramp(frame, [sleepAt, textsAt, plansAt][i] - 6, 12) }}>{ln.label}</Mono>
        ))}
        <Words words={soWords} style={{ position: "absolute", left: 0, right: 0, top: 440, textAlign: "center", fontFamily: F.display, fontWeight: 700, fontSize: 150, letterSpacing: -6, color: C.snow, lineHeight: 1 }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
