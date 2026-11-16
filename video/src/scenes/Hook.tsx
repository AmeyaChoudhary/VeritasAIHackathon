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

/** The cold open, on the night stage: Maya's fall, then the numbers that say she is one of many. */
export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const r = sceneRange("hook", 0);
  const L = (t: number) => f(t) - r.from;
  const c = (p: string) => L(cue("hook", p));
  const mayaAt = c("Maya is sixteen"), plansAt = c("quit soccer"), sleepAt = c("slept five hours"), textsAt = c("texted her friends");
  const momAt = c("Her mom thought"), twoAt = c("Two months passed"), reallyAt = c("how she really was");
  const manyAt = c("one of many"), oneAt = c("one in five"), depAt = c("has depression"), mostAt = c("fifty-nine percent"), noAt = c("get no treatment");
  const nobodyAt = c("Nobody knows");
  const out = exitAt(frame, r.dur + 4, 12);

  // A: Maya's story. The lines draw from her name to "Her mom thought"; each slips as it is named.
  const storyIn = ramp(frame, mayaAt - 4, 14);
  const storyOut = interpolate(frame, [manyAt - 10, manyAt - 1], [1, 0], clamp);
  const drawP = interpolate(frame, [mayaAt + 6, momAt], [0, 1], clamp);
  const xAt = (fr: number) => 200 + 1520 * interpolate(fr, [mayaAt + 6, momAt], [0, 1], clamp);
  const lines = [
    { y: 420, label: "Soccer, plans", at: plansAt, slip: xAt(plansAt) - 60, seed: 7.7 },
    { y: 600, label: "Sleep: 5 hours a night", at: sleepAt, slip: xAt(sleepAt) - 60, seed: 1.3 },
    { y: 780, label: "Texts to friends: half", at: textsAt, slip: xAt(textsAt) - 60, seed: 4.1 },
  ];
  const dim = interpolate(frame, [twoAt - 4, twoAt + 12], [1, 0.22], { ...clamp, easing: ease });

  // B: one in five; C: 59% untreated; D: nobody knows when to ask
  const bIn = ramp(frame, manyAt - 2, 14);
  const bOut = interpolate(frame, [mostAt - 10, mostAt - 2], [1, 0], clamp);
  const cIn = ramp(frame, mostAt - 6, 12);
  const cOut = interpolate(frame, [nobodyAt - 8, nobodyAt], [1, 0], clamp);
  const hw = sec("hook").words;
  const nobodyFrom = Math.max(0, hw.map((w) => w.w.toLowerCase().replace(/[^a-z]/g, "")).lastIndexOf("nobody"));
  const nobodyWords = hw.slice(nobodyFrom).map((w) => ({ w: w.w, at: L(w.s) }));

  return (
    <AbsoluteFill style={{ opacity: out }}>
      {/* A: Maya */}
      <AbsoluteFill style={{ opacity: storyIn * storyOut }}>
        <div style={{ position: "absolute", left: 200, top: 130, display: "flex", alignItems: "baseline", gap: 26 }}>
          <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 120, letterSpacing: -4.6, color: C.snow, opacity: dim < 0.9 ? 0.35 + 0.65 * dim : 1 }}>Maya, 16</span>
          <Mono size={22} color={C.snowSoft} style={{ opacity: ramp(frame, plansAt - 4, 14) * dim }}>Last fall</Mono>
        </div>
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
          <Mono key={i} size={21} color={frame >= ln.at ? C.amber : C.snowSoft} style={{ position: "absolute", left: 200, top: ln.y - 76, opacity: dim * ramp(frame, ln.at - 8, 12) }}>{ln.label}</Mono>
        ))}
        <div style={{ position: "absolute", right: 200, top: 152, textAlign: "right", opacity: ramp(frame, momAt - 2, 14) * dim }}>
          <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 52, letterSpacing: -1.6, color: C.snow }}>"It's just finals."</div>
          <Mono size={19} color={C.snowSoft} style={{ marginTop: 10 }}>Her mom</Mono>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 400, textAlign: "center", opacity: ramp(frame, twoAt - 2, 14), transform: `translateY(${(1 - ramp(frame, twoAt - 2, 14)) * 24}px)` }}>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 200, letterSpacing: -9, color: C.snow, lineHeight: 1 }}>2 months</div>
          <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 56, letterSpacing: -1.6, color: C.snowSoft, marginTop: 22, opacity: ramp(frame, reallyAt - 6, 14) }}>before anyone asked how she really was</div>
        </div>
      </AbsoluteFill>

      {/* B: one of many */}
      <AbsoluteFill style={{ opacity: bIn * bOut }}>
        <div style={{ position: "absolute", left: 150, top: 300, opacity: ramp(frame, oneAt - 3, 14), transform: `translateY(${(1 - ramp(frame, oneAt - 3, 14)) * 30}px)` }}>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 300, lineHeight: 0.92, letterSpacing: -13, color: C.snow }}>1 in 5</div>
          <Mono size={22} color={C.snowSoft} style={{ marginTop: 34 }}>US teens have depression each year</Mono>
        </div>
        <Mono size={22} color={C.snowSoft} style={{ position: "absolute", left: 152, top: 220, opacity: ramp(frame, manyAt - 2, 12) }}>Maya is one of many</Mono>
        <div style={{ position: "absolute", left: 1060, top: 392, display: "flex", gap: 34 }}>
          {[0, 1, 2, 3, 4].map((i) => {
            const p = settle(frame, oneAt + 2 + i * 4);
            const hit = i === 1 ? ramp(frame, depAt - 2, 18) : 0;
            return (
              <div key={i} style={{ width: 124, height: 124, borderRadius: 999, border: `3px solid ${hit > 0.5 ? C.amber : C.snowSoft}`, background: `rgba(242,163,58,${hit})`, opacity: Math.min(1, p * 1.3), transform: `scale(${0.6 + 0.4 * p})`, boxShadow: hit > 0 ? `0 0 ${60 * hit}px rgba(242,163,58,${0.35 * hit})` : undefined }} />
            );
          })}
        </div>
        <Mono size={17} color={C.snowSoft} style={{ position: "absolute", left: 152, top: 860 }}>Source: NIMH, 2021. 20.1% of US adolescents had a major depressive episode.</Mono>
      </AbsoluteFill>

      {/* C: most never get treatment */}
      <AbsoluteFill style={{ opacity: cIn * cOut }}>
        <div style={{ position: "absolute", left: 150, top: 300, transform: `translateY(${(1 - cIn) * 26}px)` }}>
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

      {/* D: nobody knows when to ask */}
      <AbsoluteFill style={{ opacity: ramp(frame, nobodyAt - 4, 10) }}>
        <Words words={nobodyWords} style={{ position: "absolute", left: 0, right: 0, top: 440, textAlign: "center", fontFamily: F.display, fontWeight: 700, fontSize: 140, letterSpacing: -6, color: C.snow, lineHeight: 1 }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
