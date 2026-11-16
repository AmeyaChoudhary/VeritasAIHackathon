import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { cue, f, sceneRange, sec } from "../timing";
import { clamp, ease, enter, ramp, settle } from "../components/anim";
import { Callout, Icon, Mark, Mono } from "../components/ui";
import { Phone, PHONE_H, PHONE_W, Seg, Track } from "../components/Phone";
import rec from "../rec.json";
import numbers from "../numbers.json";
import { StableMascot } from "../components/StableMascot";

const M = rec.marks as Record<string, number>;
const TOP = 92;

/** One signal named beside the phone; it lights up when it is spoken. */
const SignalRow: React.FC<{ at: number; icon: "moon" | "chat" | "move" | "tone" | "tap" | "music" | "play" | "globe" | "photo" | "clip" | "game" | "news"; label: string; base: number }> = ({ at, icon, label, base }) => {
  const frame = useCurrentFrame();
  const vis = ramp(frame, base, 14);
  const on = ramp(frame, at - 3, 12);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24, opacity: vis * (0.32 + 0.68 * on), transform: `translateX(${on * 10}px)` }}>
      <div style={{ width: 72, height: 72, borderRadius: 22, background: C.card, boxShadow: "0 0 0 1px rgba(21,23,26,0.07), 0 8px 22px rgba(21,23,26,0.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={38} />
      </div>
      <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: 46, letterSpacing: -1.4, color: C.ink }}>{label}</span>
      <span style={{ width: 14, height: 14, borderRadius: 9, background: C.sage, opacity: on, marginLeft: 4 }} />
    </div>
  );
};

/** A small white pill that pops in beside the parent's phone. */
const Chip: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => {
  const frame = useCurrentFrame();
  if (frame < at - 2) return null;
  const p = settle(frame, at);
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 14, padding: "18px 28px", borderRadius: 999, background: C.card, boxShadow: "0 0 0 1px rgba(21,23,26,0.07), 0 10px 26px rgba(21,23,26,0.07)", fontFamily: F.display, fontWeight: 600, fontSize: 38, letterSpacing: -1, color: C.ink, opacity: Math.min(1, p * 1.4), transform: `translateX(${(1 - p) * -26}px)` }}>
      <span style={{ width: 12, height: 12, borderRadius: 8, background: C.amber }} />{children}
    </div>
  );
};

/** The ask model's score for Maya, on a track with the line it has to cross. Real numbers from her scenario. */
const ScoreMeter: React.FC<{ at: number; crossAt: number }> = ({ at, crossAt }) => {
  const frame = useCurrentFrame();
  const sc = numbers.maya.scores as Record<string, number>;
  const thr = numbers.maya.threshold;
  const MAX = 0.3, W = 520;
  const v = interpolate(frame, [at + 8, crossAt - 6, crossAt + 10], [sc["4"], sc["5"], sc["6"]], { ...clamp, easing: ease });
  const over = v >= thr;
  const col = over ? C.amber : C.sage;
  return (
    <div style={{ width: W, ...enter(frame, at, 26, 16) }}>
      <Mono size={20}>The model's score for Maya</Mono>
      <div style={{ display: "flex", alignItems: "baseline", gap: 18, marginTop: 10 }}>
        <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 170, lineHeight: 1, letterSpacing: -7, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{v.toFixed(2)}</span>
        <span style={{ fontFamily: F.display, fontWeight: 500, fontSize: 44, letterSpacing: -1.2, color: C.inkSoft }}>{frame < crossAt - 6 ? (v < 0.1 ? "week 4" : "week 5") : "week 6"}</span>
      </div>
      <div style={{ position: "relative", height: 64, marginTop: 26 }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 22, height: 14, borderRadius: 8, background: "rgba(21,23,26,0.08)" }} />
        <div style={{ position: "absolute", left: 0, top: 22, height: 14, borderRadius: 8, width: (v / MAX) * W, background: col }} />
        <div style={{ position: "absolute", left: (v / MAX) * W - 15, top: 14, width: 30, height: 30, borderRadius: 20, background: col, boxShadow: over ? "0 0 26px rgba(242,163,58,0.6)" : "none" }} />
        <div style={{ position: "absolute", left: (thr / MAX) * W - 1.5, top: 4, width: 3, height: 50, borderRadius: 2, background: C.ink }} />
      </div>
      <div style={{ position: "relative", height: 30 }}>
        <Mono size={17} style={{ position: "absolute", left: (thr / MAX) * W - 90, width: 180, textAlign: "center" }}>asks at {thr.toFixed(2)}</Mono>
      </div>
      <div style={{ marginTop: 34, display: "flex", alignItems: "center", gap: 18, ...enter(frame, crossAt + 6, 20, 16) }}>
        <span style={{ width: 16, height: 16, borderRadius: 10, background: C.amber }} />
        <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: 40, letterSpacing: -1.1, color: C.ink }}>Asks two weeks early</span>
      </div>
    </div>
  );
};

/** The walkthrough: Stability appears, then Maya's twelve weeks on her phone and her mom's. */
export const Demo: React.FC = () => {
  const frame = useCurrentFrame();
  const r = sceneRange("steady");
  const G = (t: number) => f(t) - r.from;               // seconds on the video clock to local frames
  const S = (t: number) => t - r.start;                 // seconds on the video clock to local seconds
  const q = (id: string, ph: string) => cue(id, ph);
  const end = G(sceneRange("how").start);

  // cues
  const builtAt = G(q("steady", "we built")), livesAt = G(q("steady", "an app on")), linkedAt = G(q("steady", "linked to")), meetAt = G(q("steady", "that knows"));
  const learnAt = G(q("learn", "With consent")), igAt = G(q("learn", "Instagram")), ytAt = G(q("learn", "YouTube")), ttAt = G(q("learn", "TikTok")), webAt = G(q("learn", "browsing")), newsAt = G(q("learn", "newsfeeds"));
  const musicAt = G(q("learn", "Spotify")), gameAt = G(q("learn", "games")), msgAt = G(q("learn", "chats")), readsAt = G(q("learn", "It's all read")), neverSeeAt = G(q("learn", "never see")), onceAt = G(q("learn", "Once a week"));
  const stableAt = G(q("learn", "Stable")), tapsAt = G(q("learn", "Two taps"));
  const driftAt = G(q("drift", "Every month")), asksAt = G(q("drift", "asks the two screening")), wordAt = G(q("drift", "scores two of six"));
  const finalsAt = G(q("drift", "During finals")), modelAt = G(q("drift", "our ask model")), againAt = G(q("drift", "asks again two"));
  const passAt = G(q("note", "In week eight")), nudgeAt = G(q("note", "Maya is nudged")), momAt = G(q("note", "and her mom")), whatAt = G(q("note", "sleep and messaging")), longAt = G(q("note", "for four weeks")), howAt = G(q("note", "how to start")), neverAt = G(q("note", "Never her"));
  const helpAt = G(q("private", "988 is"));
  const privAt = G(q("private", "Small models")), smallAt = G(q("private", "read what she types")), dotAt = G(q("private", "keep only numbers"));

  // brand: big in the centre, then tucked into the corner for the rest of the walkthrough
  const draw = ramp(frame, builtAt - 2, 30);
  const tuck = interpolate(frame, [livesAt - 6, livesAt + 16], [0, 1], { ...clamp, easing: ease });
  const brandScale = interpolate(tuck, [0, 1], [1, 0.3]);
  const brandX = interpolate(tuck, [0, 1], [960, 222]);
  const brandY = interpolate(tuck, [0, 1], [470, 96]);
  const sceneOut = interpolate(frame, [end - 6, end + 6], [1, 0], clamp);

  // phones
  const teenRise = settle(frame, livesAt - 2);
  const parentIn1 = settle(frame, linkedAt - 4);
  const toCentre = interpolate(frame, [learnAt - 14, learnAt + 8], [0, 1], { ...clamp, easing: ease });
  const split = interpolate(frame, [momAt - 16, momAt + 8], [0, 1], { ...clamp, easing: ease });
  const rejoin = interpolate(frame, [privAt - 14, privAt + 8], [0, 1], { ...clamp, easing: ease });
  const teenX = 700 + (960 - 700) * toCentre + (640 - 960) * split + (960 - 640) * rejoin;
  const parentShow = parentIn1 * (1 - toCentre) + split * (1 - rejoin);
  const parentX = frame < learnAt + 10 ? 1220 + toCentre * 700 : 1280 + (1 - split) * 700 + rejoin * 700;
  const teenY = TOP + (1 - teenRise) * 1000 + (1 - sceneOut) * 60;

  // what plays on each phone
  const sceneEnd = S(sceneRange("how").start) + 1;
  const fit = (from: number, to: number, start: number, until: number) => Math.min(4, Math.max(0.5, (to - from) / Math.max(0.4, until - start)));
  const off = (rec as { parentOffset?: number }).parentOffset ?? 0;   // the parent recording started this much later
  const W = (id: string, from: string, until: string | number) => [q(id, from), typeof until === "number" ? until : q(id, until)] as const;
  const seg = (from: number, to: number, win: readonly [number, number], lead = 0.1): Seg => ({ clip: "teen", from, to, at: S(win[0]) - lead, rate: fit(from, to, win[0] - lead, win[1]) });
  const learnSeg = seg(M.w2 - 0.25, M.w3 + 1.7, W("learn", "With consent", "It's all read"));
  const teenSegs: Seg[] = rec.ready ? [
    { clip: "teen", from: 0.5, to: 1.3, at: 0 },
    learnSeg,
    seg(M.ci4 - 0.1, M.w4 - 0.15, W("learn", "Once a week", sec("learn").end + 0.2)),                 // the two taps
    seg(M.w4 - 0.2, M.ask1_a1 - 0.1, W("drift", "Every month", "In week four")),                         // week 4: the monthly ask
    seg(M.ask1_a1 - 0.1, M.ask1_closed + 1.0, W("drift", "In week four", "During finals"), 0.15),          // she answers low
    seg(M.w5 - 0.25, M.ci6 + 2.2, W("drift", "During finals", "our ask model")),                        // finals: amber, a tense check-in
    seg(M.w6 - 0.2, M.ask2_open + 0.9, W("drift", "our ask model", "asks again two")),                 // week 6: the model asks
    seg(M.ask2_a1 - 0.1, M.ask2_closed + 0.6, W("drift", "asks again two", q("note", "In week eight")), 0.1),   // still under the cutoff
    seg(M.w8 - 0.1, M.w8 + 2.3, W("note", "In week eight", "so all eight")),
    seg(M.ask3_a1 - 0.3, M.ask3_a1 + 2.6, W("note", "so all eight", "Maya is nudged"), 0.1),
    { clip: "teen", from: M.ask3_closed + 0.2, to: M.doctor + 3.0, at: S(q("note", "Maya is nudged")) - 0.15 },
    seg(M.type_open - 0.2, M.type1_start - 0.1, W("private", "Small models", "read what she types"), 0.2),
    seg(M.type1_start - 0.1, M.type1_send + 2.7, W("private", "read what she types", sec("private").end + 0.4), 0.4),
  ] : [];
  const parentSegs: Seg[] = rec.ready ? [
    { clip: "parent", from: 0.5, to: 1.3, at: 0 },
    { clip: "parent", from: M.note - off - 0.4, to: M.note - off + 6.0, at: S(q("note", "and her mom")) + 0.4 },
  ] : [];

  // the amber dot that carries the note across
  const fly = interpolate(frame, [momAt + 6, momAt + 26], [0, 1], { ...clamp, easing: ease });
  const flyX = 640 + PHONE_W / 2 - 30 + (1280 - PHONE_W / 2 + 30 - (640 + PHONE_W / 2 - 30)) * fly;
  const flyY = 430 - Math.sin(fly * Math.PI) * 120;

  // the week counter follows the recording: week k shows once the clip passes that tap

  return (
    <AbsoluteFill style={{ opacity: sceneOut }}>
      {/* brand */}
      <div style={{ position: "absolute", left: brandX, top: brandY, transform: `translate(-50%,-50%) scale(${brandScale})`, display: "flex", alignItems: "center", gap: 34, opacity: ramp(frame, builtAt - 4, 12) }}>
        <Mark size={210} draw={draw} stroke={2.4} />
        <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 230, letterSpacing: -10, color: C.ink, lineHeight: 1 }}>Stability</span>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 640, textAlign: "center", fontFamily: F.display, fontWeight: 500, fontSize: 60, letterSpacing: -1.6, color: C.inkSoft, opacity: ramp(frame, builtAt + 16, 16) * (1 - tuck) }}>knowing when to ask</div>

      {/* Maya's phone */}
      <div style={{ position: "absolute", left: teenX - PHONE_W / 2, top: teenY }}>
        <Phone label="MAYA'S PHONE">{rec.ready ? <Track segs={teenSegs} sceneEnd={sceneEnd} /> : undefined}</Phone>
      </div>
      <Mono size={18} style={{ position: "absolute", left: teenX - 200, width: 400, textAlign: "center", top: TOP - 44, opacity: ramp(frame, meetAt - 2, 14) * (1 - toCentre * 1) * teenRise + split * (1 - rejoin) }}>Maya, 16</Mono>

      {/* her mom's phone */}
      {parentShow > 0.01 ? (
        <>
          <div style={{ position: "absolute", left: parentX - PHONE_W / 2, top: TOP + (1 - Math.min(1, parentShow)) * 40, opacity: Math.min(1, parentShow * 1.6) }}>
            <Phone label="MOM'S PHONE">{rec.ready ? <Track segs={parentSegs} sceneEnd={sceneEnd} /> : undefined}</Phone>
          </div>
          <Mono size={18} style={{ position: "absolute", left: parentX - 200, width: 400, textAlign: "center", top: TOP - 44, opacity: Math.min(1, parentShow) }}>Her mom</Mono>
        </>
      ) : null}

      {/* "linked": a hairline between the two phones in the opening */}
      {frame >= linkedAt - 2 && frame < learnAt + 6 ? (
        <svg width="1920" height="1080" style={{ position: "absolute", inset: 0, opacity: 1 - toCentre }}>
          <line x1={700 + PHONE_W / 2 + 14} y1={TOP + PHONE_H / 2} x2={700 + PHONE_W / 2 + 14 + (1220 - 700 - PHONE_W - 28) * ramp(frame, linkedAt, 18)} y2={TOP + PHONE_H / 2} stroke={C.sage} strokeWidth="3" strokeLinecap="round" strokeDasharray="2 12" />
        </svg>
      ) : null}

      {/* 01 her whole digital life */}
      <Callout at={learnAt} until={driftAt - 2} tag="01 · Her digital life" title={<>Sees the<br />whole picture</>} style={{ position: "absolute", left: 130, top: 170, width: 600 }} size={84} />
      {frame >= learnAt && frame < driftAt ? (
        <div style={{ position: "absolute", left: 130, top: 430, display: "flex", flexDirection: "column", gap: 14, opacity: interpolate(frame, [driftAt - 10, driftAt - 2], [1, 0], clamp) }}>
          <SignalRow base={learnAt + 8} at={igAt} icon="photo" label="Instagram" />
          <SignalRow base={learnAt + 11} at={ttAt} icon="clip" label="TikTok" />
          <SignalRow base={learnAt + 14} at={ytAt} icon="play" label="YouTube" />
          <SignalRow base={learnAt + 17} at={webAt} icon="globe" label="Browsing" />
          <SignalRow base={learnAt + 20} at={newsAt} icon="news" label="News feeds" />
          {frame >= onceAt - 6 ? <SignalRow base={onceAt - 4} at={tapsAt} icon="tap" label="A two-tap check-in" /> : null}
        </div>
      ) : null}
      {frame >= learnAt && frame < onceAt + 2 ? (
        <div style={{ position: "absolute", left: 1270, top: 130, width: 600, opacity: ramp(frame, learnAt + 2, 14) * interpolate(frame, [onceAt - 8, onceAt], [1, 0], clamp) }}>
          <div style={{ display: "flex", gap: 14, marginBottom: 26 }}>
            {["Maya agreed", "Mom agreed"].map((t, i) => (
              <div key={t} style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "12px 20px", borderRadius: 999, background: C.card, boxShadow: "0 0 0 1px rgba(21,23,26,0.07), 0 8px 20px rgba(21,23,26,0.06)", fontFamily: F.display, fontWeight: 600, fontSize: 28, letterSpacing: -0.6, color: C.ink, ...enter(frame, learnAt + 2 + i * 6, 18, 12) }}>
                <svg width="24" height="24" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" stroke={C.sage} strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>{t}
              </div>
            ))}
          </div>
          <Mono size={20}>Read on her phone</Mono>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 190, lineHeight: 0.95, letterSpacing: -8, color: C.ink, fontVariantNumeric: "tabular-nums", marginTop: 6 }}>{numbers.pitch.sources}<span style={{ fontSize: 66, letterSpacing: -2.2, color: C.inkSoft, fontWeight: 500 }}> sources</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 34 }}>
            <SignalRow base={learnAt + 23} at={musicAt} icon="music" label="Spotify" />
            <SignalRow base={learnAt + 26} at={gameAt} icon="game" label="Games" />
            <SignalRow base={learnAt + 29} at={msgAt} icon="chat" label="Chats" />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 28, ...enter(frame, neverSeeAt - 2, 18, 12) }}>
            <Icon name="lock" size={40} />
            <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: 32, letterSpacing: -0.8, color: C.ink, lineHeight: 1.2 }}>Parents never see a message, a search or a video.</span>
          </div>
        </div>
      ) : null}
      {frame >= onceAt - 2 && frame < driftAt ? (
        <div style={{ position: "absolute", left: 1270, top: 250, width: 560, opacity: interpolate(frame, [driftAt - 10, driftAt - 2], [1, 0], clamp) }}>
          <div style={enter(frame, onceAt, 26, 16)}>
            <Mono size={20}>Once a week</Mono>
            <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 132, lineHeight: 0.96, letterSpacing: -5.5, color: C.ink, marginTop: 14 }}>Meet<br />Stable</div>
          </div>
          <div style={{ fontFamily: F.body, fontSize: 30, color: C.inkSoft, marginTop: 22, maxWidth: 500, lineHeight: 1.36, ...enter(frame, tapsAt - 2, 20, 14) }}>Two taps: how stressed, and how much time with people. It stays on her phone.</div>
        </div>
      ) : null}
      {(() => {
        // Stable floats in on its name, drifts in the open space, then flies into the check-in card on her phone.
        if (frame < stableAt - 8 || frame > tapsAt + 34) return null;
        const t = (frame - stableAt) / 30;
        const inP = interpolate(frame, [stableAt - 8, stableAt + 14], [0, 1], { ...clamp, easing: ease });
        const fly = interpolate(frame, [tapsAt - 4, tapsAt + 24], [0, 1], { ...clamp, easing: ease });
        const fx = 1560 + 70 * Math.sin(t * 1.7), fy = 760 + 30 * Math.sin(t * 3.1);
        const tx = teenX - PHONE_W / 2 + 12 + 34, ty = TOP + 12 + 44 + 313;
        const x = fx + (tx - fx) * fly, y = fy + (ty - fy) * fly - Math.sin(fly * Math.PI) * 120;
        const size = 210 + (34 - 210) * fly;
        const op = inP * interpolate(frame, [tapsAt + 17, tapsAt + 25], [1, 0], clamp);
        return (
          <div style={{ position: "absolute", left: x - size / 2, top: y - size / 2 + (1 - inP) * 60, opacity: op, transform: `rotate(${(1 - fly) * 6 * Math.sin(t * 2)}deg)` }}>
            <StableMascot size={size} />
          </div>
        );
      })()}

      {/* 02 it asks, every month */}
      <Callout at={driftAt} until={finalsAt - 2} tag="02 · Ask" title={<>Asks,<br />every month</>} body="Everyone gets the same two questions, whatever their phone shows." style={{ position: "absolute", left: 130, top: 230, width: 580 }} size={88} />
      {frame >= asksAt - 2 && frame < finalsAt ? (
        <div style={{ position: "absolute", left: 1270, top: 280, width: 540, opacity: interpolate(frame, [finalsAt - 10, finalsAt - 2], [1, 0], clamp) }}>
          <div style={enter(frame, asksAt, 26, 16)}>
            <Mono size={20}>Week 4</Mono>
            <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 104, lineHeight: 1, letterSpacing: -4.2, color: C.ink, marginTop: 14 }}>Two<br />questions</div>
            <div style={{ fontFamily: F.body, fontSize: 30, color: C.inkSoft, marginTop: 18, lineHeight: 1.36 }}>The ones doctors use.</div>
          </div>
          <div style={{ marginTop: 40, display: "flex", alignItems: "center", gap: 18, ...enter(frame, wordAt - 2, 20, 16) }}>
            <svg width="44" height="44" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" stroke={C.sage} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: 40, letterSpacing: -1.1, color: C.ink }}>2 of 6: taken at her word</span>
          </div>
        </div>
      ) : null}

      {/* 03 the model does not wait */}
      <Callout at={finalsAt} until={passAt - 2} tag="03 · The model" title={<>Doesn't wait<br />a month</>} body={`Trained on ${numbers.students} students' own answers. It scores Maya every week.`} style={{ position: "absolute", left: 130, top: 230, width: 580 }} size={88} />
      {frame >= modelAt - 4 && frame < passAt ? (
        <div style={{ position: "absolute", left: 1270, top: 250, opacity: interpolate(frame, [passAt - 10, passAt - 2], [1, 0], clamp) }}>
          <ScoreMeter at={modelAt - 2} crossAt={againAt} />
        </div>
      ) : null}

      {/* 04 it doesn't pass */}
      <Callout at={passAt} until={momAt - 8} tag="04 · Week 8" title={<>It doesn't<br />pass</>} body="Four weeks outside her range, and now her answers are high." style={{ position: "absolute", left: 130, top: 230, width: 580 }} size={88} />
      {frame >= nudgeAt - 2 && frame < momAt - 6 ? (
        <div style={{ position: "absolute", left: 1270, top: 330, width: 540, ...enter(frame, nudgeAt, 26, 16) }}>
          <div style={{ width: 96, height: 96, borderRadius: 30, background: C.card, boxShadow: "0 0 0 1px rgba(21,23,26,0.07), 0 10px 26px rgba(21,23,26,0.07)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="doctor" size={50} /></div>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 78, lineHeight: 1.02, letterSpacing: -3, color: C.ink, marginTop: 26 }}>A nudge to<br />see a doctor</div>
        </div>
      ) : null}

      {/* 04 the note */}
      {frame >= momAt + 4 && frame < momAt + 30 ? (
        <div style={{ position: "absolute", left: flyX - 15, top: flyY - 15, width: 30, height: 30, borderRadius: 20, background: C.amber, boxShadow: "0 0 34px rgba(242,163,58,0.75)", opacity: Math.sin(fly * Math.PI) * 0.9 + 0.1 }} />
      ) : null}
      <Callout at={momAt + 2} until={privAt - 14} tag="05 · A parent" title={<>The<br />note</>} style={{ position: "absolute", left: 110, top: 250, width: 300 }} size={84} />
      {frame >= whatAt - 4 && frame < privAt ? (
        <div style={{ position: "absolute", left: 1530, top: 250, display: "flex", flexDirection: "column", gap: 22, alignItems: "flex-start", opacity: interpolate(frame, [privAt - 24, privAt - 15], [1, 0], clamp) }}>
          <Chip at={whatAt - 2}>Sleep and messaging down</Chip>
          <Chip at={longAt - 2}>For 4 weeks</Chip>
          <Chip at={howAt - 2}>How to start the conversation</Chip>
          <div style={{ marginTop: 34, display: "flex", alignItems: "center", gap: 16, ...enter(frame, neverAt - 3, 20, 16) }}>
            <Icon name="lock" size={46} />
            <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 44, letterSpacing: -1.4, color: C.ink, lineHeight: 1.05 }}>Never her<br />messages</span>
          </div>
        </div>
      ) : null}

      {/* private by design */}
      <Callout at={privAt + 2} tag="Private by design" title={<>Her words<br />stay on<br />her phone</>} style={{ position: "absolute", left: 130, top: 230, width: 580 }} size={88} />
      {frame >= smallAt - 4 ? (
        <div style={{ position: "absolute", left: 1270, top: 290, width: 540, ...enter(frame, smallAt - 2, 26, 16) }}>
          <Mono size={20}>Text sent</Mono>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 330, lineHeight: 0.9, letterSpacing: -14, color: C.ink }}>0<span style={{ fontSize: 84, letterSpacing: -3, color: C.inkSoft, fontWeight: 500 }}> bytes</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 30, opacity: ramp(frame, dotAt - 2, 14) }}>
            <span style={{ width: 22, height: 22, borderRadius: 14, background: C.ink }} />
            <span style={{ fontFamily: F.body, fontSize: 32, color: C.inkSoft }}>Only numbers are kept. The words are gone.</span>
          </div>
          <div style={{ marginTop: 40, display: "inline-flex", alignItems: "center", gap: 14, padding: "18px 28px", borderRadius: 999, background: C.card, boxShadow: "0 0 0 1px rgba(21,23,26,0.07), 0 10px 26px rgba(21,23,26,0.07)", ...enter(frame, helpAt - 2, 20, 14) }}>
            <span style={{ width: 12, height: 12, borderRadius: 8, background: C.amber }} />
            <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: 38, letterSpacing: -1, color: C.ink }}>988, one tap away</span>
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
