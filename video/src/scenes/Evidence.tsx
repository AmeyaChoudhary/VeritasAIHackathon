import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { cue, f, sceneRange } from "../timing";
import { clamp, ease, enter, exitAt, ramp } from "../components/anim";
import { Icon, Mono } from "../components/ui";
import { StableMascot } from "../components/StableMascot";
import numbers from "../numbers.json";

const card = (dark = false): React.CSSProperties => ({
  position: "absolute", borderRadius: 28, padding: "22px 26px",
  background: dark ? C.ink : C.card, color: dark ? "#fff" : C.ink,
  boxShadow: dark ? "0 18px 44px rgba(21,23,26,0.22)" : "0 0 0 1px rgba(21,23,26,0.07), 0 12px 30px rgba(21,23,26,0.07)",
});

/** One box in the engine diagram. */
const Node: React.FC<{ at: number; x: number; y: number; w: number; title: string; sub?: string; dark?: boolean; icon?: React.ReactNode; accent?: string }> = ({ at, x, y, w, title, sub, dark, icon, accent }) => {
  const frame = useCurrentFrame();
  if (frame < at - 2) return null;
  return (
    <div style={{ ...card(dark), left: x, top: y, width: w, ...enter(frame, at, 22, 14) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {icon}
        <div>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 34, letterSpacing: -1, lineHeight: 1.05 }}>{title}</div>
          {sub ? <div style={{ fontFamily: F.body, fontSize: 21, marginTop: 6, color: dark ? "rgba(255,255,255,0.7)" : C.inkSoft }}>{sub}</div> : null}
        </div>
      </div>
      {accent ? <div style={{ position: "absolute", top: 18, right: 18, width: 14, height: 14, borderRadius: 9, background: accent }} /> : null}
    </div>
  );
};

/** A line that draws from (x1,y1) to (x2,y2) starting at `at`. */
const Wire: React.FC<{ at: number; x1: number; y1: number; x2: number; y2: number; color?: string }> = ({ at, x1, y1, x2, y2, color = C.inkSoft }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [at, at + 14], [0, 1], { ...clamp, easing: ease });
  if (p <= 0) return null;
  const len = Math.hypot(x2 - x1, y2 - y1);
  return (
    <svg width="1920" height="1080" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${len}`} strokeDashoffset={`${len * (1 - p)}`} opacity="0.55" />
      {p > 0.98 ? <circle cx={x2} cy={y2} r="6" fill={color} opacity="0.7" /> : null}
    </svg>
  );
};

/** A big number tile in "It works". */
const Tile: React.FC<{ at: number; x: number; y: number; big: React.ReactNode; label: string; color?: string; children?: React.ReactNode }> = ({ at, x, y, big, label, color = C.ink, children }) => {
  const frame = useCurrentFrame();
  if (frame < at - 2) return null;
  return (
    <div style={{ ...card(), left: x, top: y, width: 790, height: 250, padding: "30px 38px", ...enter(frame, at, 24, 16) }}>
      <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 118, lineHeight: 0.95, letterSpacing: -5, color, fontVariantNumeric: "tabular-nums" }}>{big}</div>
      <div style={{ fontFamily: F.body, fontSize: 25, lineHeight: 1.3, color: C.inkSoft, marginTop: 14, maxWidth: 720 }}>{label}</div>
      {children}
    </div>
  );
};

/** "Under the hood": the whole system as one diagram. Then "It works": the numbers. */
export const Evidence: React.FC = () => {
  const frame = useCurrentFrame();
  const r0 = sceneRange("how");
  const r1 = sceneRange("proof");
  const L = (t: number) => f(t) - r0.from;
  const h = (ph: string) => L(cue("how", ph));
  const p = (ph: string) => L(cue("proof", ph));

  const hoodAt = h("Under the hood"), tapsAt = h("two taps"), pastAt = h("past answers"), modelAt = h("feed our ask model"), whenAt = h("Past sixteen percent");
  const highAt = h("Three or more"), eightAt = h("all eight"), parentAt = h("alerts a parent"), lifeAt = hoodAt + 20, noWordsAt = parentAt + 20;
  const worksAt = p("Does it work"), examplesAt = p("four hundred thousand"), kindsAt = p("check-ins, surveys"), timesAt = p("three times"), aucAt = p("a hundred thirteen");
  const sleepAt = p("sleeping four hours"), twiceAt = sleepAt + 45;
  const end = r1.from + r1.dur - r0.from;
  const out = exitAt(frame, end + 4, 12);

  const hoodOut = interpolate(frame, [worksAt - 10, worksAt - 1], [1, 0], clamp);
  const worksIn = ramp(frame, worksAt - 2, 16);
  const count = Math.round(numbers.pitch.examples * interpolate(frame, [examplesAt - 6, examplesAt + 34], [0, 1], { ...clamp, easing: ease }));

  // engine layout
  const YA = 330, YB = 520, YM = 425, Y3 = 790;
  return (
    <AbsoluteFill style={{ opacity: out }}>
      {/* under the hood */}
      <AbsoluteFill style={{ opacity: hoodOut }}>
        <div style={{ position: "absolute", left: 150, top: 100, ...enter(frame, hoodAt - 2, 24, 16) }}>
          <Mono size={20}>Under the hood</Mono>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 104, letterSpacing: -4.4, color: C.ink, lineHeight: 1, marginTop: 14 }}>The engine</div>
        </div>
        <Node at={tapsAt} x={150} y={YA} w={350} title="Two taps" sub="stress, time with people" icon={<StableMascot size={52} />} />
        <Node at={pastAt} x={150} y={YB} w={350} title="Past answers" sub="her last and average PHQ-2" />
        <Wire at={modelAt - 2} x1={500} y1={YA + 52} x2={610} y2={YM + 62} />
        <Wire at={modelAt - 2} x1={500} y1={YB + 52} x2={610} y2={YM + 62} />
        <Node at={modelAt} x={610} y={YM} w={330} title="Ask model" sub={frame >= whenAt ? "asks past 16%" : "logistic regression"} dark accent={frame >= whenAt ? C.sage : undefined} />
        <Wire at={whenAt} x1={940} y1={YM + 62} x2={980} y2={YM + 62} />
        <Node at={whenAt} x={980} y={YM} w={240} title="2 questions" sub="PHQ-2: 3+ is high" />
        <Wire at={highAt - 4} x1={1220} y1={YM + 62} x2={1260} y2={YM + 62} color={C.amber} />
        <Node at={eightAt - 4} x={1260} y={YM} w={240} title="All 8" sub="PHQ-8: 10+ alerts" accent={C.amber} />
        <Wire at={parentAt - 4} x1={1500} y1={YM + 62} x2={1540} y2={YM + 62} color={C.amber} />
        <Node at={parentAt} x={1540} y={YM} w={270} title="A note" sub="what changed, how to talk" icon={<Icon name="note" size={34} />} />
        <Node at={lifeAt} x={150} y={Y3} w={350} title="Her digital life" sub={`${numbers.pitch.sources} sources, with consent`} icon={<Icon name="globe" size={34} />} />
        <Wire at={lifeAt + 8} x1={500} y1={Y3 + 52} x2={610} y2={Y3 + 52} />
        <Node at={lifeAt + 10} x={610} y={Y3} w={330} title="Mood model" sub="tone of each message" dark />
        <Node at={lifeAt + 16} x={980} y={Y3} w={330} title="Self-harm model" sub="988, one tap away" dark accent={C.amber} />
        <Node at={lifeAt + 22} x={1350} y={Y3} w={330} title="Music mood" sub="how her songs sound" dark />
        {frame >= noWordsAt - 2 ? (
          <div style={{ position: "absolute", left: 1540, top: YM + 160, display: "flex", alignItems: "center", gap: 16, ...enter(frame, noWordsAt, 20, 14) }}>
            <Icon name="lock" size={46} />
            <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 40, letterSpacing: -1.2, color: C.ink, lineHeight: 1.05 }}>0 words<br />leave the phone</span>
          </div>
        ) : null}
      </AbsoluteFill>

      {/* it works */}
      <AbsoluteFill style={{ opacity: worksIn }}>
        <div style={{ position: "absolute", left: 150, top: 110, transform: `translateY(${(1 - worksIn) * 24}px)` }}>
          <Mono size={20}>Does it work?</Mono>
          <div style={{ display: "flex", alignItems: "baseline", gap: 30, marginTop: 14 }}>
            <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 128, letterSpacing: -5.5, color: C.ink, lineHeight: 1, fontVariantNumeric: "tabular-nums", minWidth: 640 }}>
              {count.toLocaleString("en-US")}
            </span>
            <span style={{ fontFamily: F.display, fontWeight: 500, fontSize: 48, letterSpacing: -1.4, color: C.inkSoft, opacity: ramp(frame, examplesAt + 10, 14) }}>labelled examples, tested</span>
          </div>
          <Mono size={18} style={{ marginTop: 14, opacity: ramp(frame, kindsAt - 2, 14) }}>282,768 posts · 54,263 comments · 30,346 surveyed high schoolers · 16,886 student check-in weeks · 20,113 more</Mono>
        </div>
        <Tile at={timesAt - 4} x={150} y={380} big={<>{numbers.pitch.times}×</>} label={`${numbers.timing.askModel}% of its asks hit a hard week, vs ${numbers.timing.calendar}% on a fixed schedule (213 students, 16,886 weeks)`} color={C.sage} />
        <Tile at={aucAt} x={980} y={380} big={numbers.pitch.teenAuc.toFixed(2)} label={`AUC predicting the next screening of ${numbers.teens.count} teens aged 12 to 17 it never saw. 0.5 is chance, 1.0 is perfect.`} />
        <Tile at={sleepAt - 2} x={150} y={670} big={<>{numbers.sleep.short}%</>} label={`of US high schoolers sleeping 4 hours or less felt sad or hopeless, vs ${numbers.sleep.eight}% at 8 hours (CDC, 30,346 students)`} color={C.amber} />
        <Tile at={twiceAt} x={980} y={670} big="2×" label={`the low-mood messages a keyword list finds (50% vs 24%). Self-harm check: ${numbers.pitch.selfHarmFound} of ${numbers.pitch.selfHarmTotal} test messages.`} color={C.sage} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
