import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { cue, f, sceneRange } from "../timing";
import { clamp, enter, exitAt, ramp } from "../components/anim";
import { Bar, Mono } from "../components/ui";
import numbers from "../numbers.json";

/** "Does it work?": the tone model against its baseline, then every way of picking the week on one scale. */
export const Evidence: React.FC = () => {
  const frame = useCurrentFrame();
  const r0 = sceneRange("proof");
  const r1 = sceneRange("timing");
  const L = (t: number) => f(t) - r0.from;
  const p = (ph: string) => L(cue("proof", ph));
  const t = (ph: string) => L(cue("timing", ph));
  const askAt = p("Does it work"), fiveAt = p("On five thousand"), toneAt = p("our tone model"), keyAt = p("A keyword list");
  const thenAt = t("Then we tested"), studAt = t("two hundred thirteen"), failAt = t("our first idea failed"), chanceAt = t("no better than chance");
  const workedAt = t("So we rebuilt"), modelAt = t("Its model"), calAt = t("A calendar");
  const end = r1.from + r1.dur - r0.from;
  const out = exitAt(frame, end + 4, 12);

  const proofOut = interpolate(frame, [thenAt - 10, thenAt - 1], [1, 0], clamp);
  const failIn = ramp(frame, thenAt - 2, 16);
  const failOut = interpolate(frame, [workedAt - 10, workedAt - 1], [1, 0], clamp);
  const chartIn = ramp(frame, workedAt - 2, 16);
  const n = Math.round(numbers.students * ramp(frame, studAt - 4, 34));

  return (
    <AbsoluteFill style={{ opacity: out }}>
      {/* the tone model */}
      <AbsoluteFill style={{ opacity: proofOut }}>
        <div style={{ position: "absolute", left: 150, top: 150, ...enter(frame, askAt - 2, 26, 18) }}>
          <Mono size={20}>The words model</Mono>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 132, letterSpacing: -5.5, color: C.ink, lineHeight: 1, marginTop: 18 }}>Does it work?</div>
        </div>
        <div style={{ position: "absolute", left: 150, top: 470, display: "flex", flexDirection: "column", gap: 54 }}>
          <Bar at={toneAt} label="Our tone model" value={numbers.tone.model} max={70} color={C.sage} width={1320} strong />
          <Bar at={keyAt} label="A keyword list" sub="the simple baseline" value={numbers.tone.keyword} max={70} color={C.grey} width={1320} />
        </div>
        <Mono size={18} style={{ position: "absolute", left: 152, top: 880, opacity: ramp(frame, fiveAt - 2, 14) }}>Low-mood comments found, out of {numbers.tone.testComments} Reddit comments the model had never seen</Mono>
      </AbsoluteFill>

      {/* the first idea failed */}
      <AbsoluteFill style={{ opacity: failIn * failOut }}>
        <div style={{ position: "absolute", left: 150, top: 150 }}>
          <Mono size={20}>When to ask</Mono>
          <div style={{ display: "flex", alignItems: "baseline", gap: 26, marginTop: 14 }}>
            <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 210, letterSpacing: -9, color: C.ink, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{n}</span>
            <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: 60, letterSpacing: -1.8, color: C.inkSoft }}>students, up to four years of phone data</span>
          </div>
        </div>
        <svg width="1620" height="150" style={{ position: "absolute", left: 152, top: 430 }}>
          {Array.from({ length: numbers.students }).map((_, i) => {
            const col = i % 71, row = Math.floor(i / 71);
            const on = i < n;
            return <circle key={i} cx={10 + col * 22.6} cy={12 + row * 44} r={7} fill={on ? C.ink : C.inkFaint} opacity={on ? 0.82 : 1} />;
          })}
        </svg>
        <div style={{ position: "absolute", left: 150, top: 620, ...enter(frame, failAt - 3, 26, 16) }}>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 124, letterSpacing: -5, color: C.ink, lineHeight: 1 }}>Our first idea <span style={{ color: C.amber }}>failed.</span></div>
        </div>
        <div style={{ position: "absolute", left: 152, top: 800, display: "flex", gap: 70, alignItems: "baseline", ...enter(frame, chanceAt - 6, 20, 16) }}>
          <span style={{ fontFamily: F.body, fontSize: 36, color: C.inkSoft }}>Phone signals picked a hard week <b style={{ color: C.ink, fontWeight: 700 }}>{numbers.timing.driftRule}%</b> of the time.</span>
          <span style={{ fontFamily: F.body, fontSize: 36, color: C.inkSoft }}>Chance: <b style={{ color: C.ink, fontWeight: 700 }}>{numbers.timing.matchedRandom}%</b></span>
        </div>
      </AbsoluteFill>

      {/* what we did about it */}
      <AbsoluteFill style={{ opacity: chartIn }}>
        <div style={{ position: "absolute", left: 150, top: 130, transform: `translateY(${(1 - chartIn) * 24}px)` }}>
          <Mono size={20}>So we rebuilt it</Mono>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 132, letterSpacing: -5.5, color: C.ink, lineHeight: 1, marginTop: 18 }}>Steady asks first.</div>
        </div>
        <div style={{ position: "absolute", left: 150, top: 440, display: "flex", flexDirection: "column", gap: 54 }}>
          <Bar at={modelAt + 4} label="Steady's ask model" sub="trained on students' own answers" value={numbers.timing.askModel} max={60} color={C.sage} width={1320} strong />
          <Bar at={calAt - 2} label="A fixed calendar" sub="the simple baseline" value={numbers.timing.calendar} max={60} color={C.grey} width={1320} />
        </div>
        <Mono size={18} style={{ position: "absolute", left: 152, top: 860, opacity: ramp(frame, modelAt + 10, 14) }}>Share of asks that land on a hard week, at 12 asks a year, on students the model never saw. AUC {numbers.timing.askModelAuc}.</Mono>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
