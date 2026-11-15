import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { cue, f, sceneRange, sec } from "../timing";
import { clamp, ease, enter, ramp, settle } from "../components/anim";
import { Callout, Icon, Mark, Mono } from "../components/ui";
import { Phone, PHONE_H, PHONE_W, Seg, Track } from "../components/Phone";
import rec from "../rec.json";

const M = rec.marks as Record<string, number>;
const TOP = 92;

/** One signal named beside the phone; it lights up when it is spoken. */
const SignalRow: React.FC<{ at: number; icon: "moon" | "chat" | "move" | "tone"; label: string; base: number }> = ({ at, icon, label, base }) => {
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

/** The walkthrough: Steady appears, then Maya's twelve weeks on her phone and her mom's. */
export const Demo: React.FC = () => {
  const frame = useCurrentFrame();
  const r = sceneRange("steady");
  const G = (t: number) => f(t) - r.from;               // seconds on the video clock to local frames
  const S = (t: number) => t - r.start;                 // seconds on the video clock to local seconds
  const q = (id: string, ph: string) => cue(id, ph);
  const end = G(sceneRange("proof").start);

  // cues
  const builtAt = G(q("steady", "So we built")), livesAt = G(q("steady", "It lives")), linkedAt = G(q("steady", "linked to")), meetAt = G(q("steady", "Meet Maya"));
  const learnAt = G(q("learn", "For four weeks")), sleepAt = G(q("learn", "her sleep")), reachAt = G(q("learn", "how often")), moveAt = G(q("learn", "how much")), toneAt = G(q("learn", "the tone"));
  const driftAt = G(q("drift", "During finals")), asksAt = G(q("drift", "So Steady asks")), okayAt = G(q("drift", "She says")), wordAt = G(q("drift", "takes her at"));
  const passAt = G(q("note", "But it doesn't")), w8At = G(q("note", "At week eight")), nudgeAt = G(q("note", "Maya sees")), momAt = G(q("note", "and her mom")), whatAt = G(q("note", "what changed")), longAt = G(q("note", "for how long")), howAt = G(q("note", "how to start")), neverAt = G(q("note", "Never her"));
  const privAt = G(q("private", "What Maya types")), modelAt = G(q("private", "A small model")), dotAt = G(q("private", "keeps one dot"));

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
  const sceneEnd = S(sceneRange("proof").start) + 1;
  const fit = (from: number, to: number, start: number, until: number) => Math.min(4, Math.max(0.5, (to - from) / Math.max(0.4, until - start)));
  const off = (rec as { parentOffset?: number }).parentOffset ?? 0;   // the parent recording started this much later
  const W = (id: string, from: string, until: string | number) => [q(id, from), typeof until === "number" ? until : q(id, until)] as const;
  const seg = (from: number, to: number, win: readonly [number, number], lead = 0.1): Seg => ({ clip: "teen", from, to, at: S(win[0]) - lead, rate: fit(from, to, win[0] - lead, win[1]) });
  const learnSeg = seg(M.w2 - 0.25, M.w4 + 1.9, W("learn", "For four weeks", "her sleep"));
  const teenSegs: Seg[] = rec.ready ? [
    { clip: "teen", from: 0.5, to: 1.3, at: 0 },
    learnSeg,
    seg(M.w5 - 0.25, M.ask1_open - 0.2, W("drift", "During finals", "So Steady asks")),
    seg(M.ask1_open - 0.2, M.ask1_a1 - 0.1, W("drift", "So Steady asks", "She says"), 0.2),
    seg(M.ask1_a1 - 0.1, M.ask1_closed + 1.3, W("drift", "She says", sec("drift").end + 0.25), 0.15),
    seg(M.w7 - 0.25, M.w8 + 2.2, W("note", "But it doesn't", "her answers")),
    seg(M.ask2_open - 0.15, M.ask2_a1 + 3.0, W("note", "her answers", "Maya sees"), 0.1),
    { clip: "teen", from: M.ask2_closed + 0.2, to: M.doctor + 3.0, at: S(q("note", "Maya sees")) - 0.15 },
    seg(M.type_open - 0.2, M.type1_start - 0.1, W("private", "What Maya types", "A small model"), 0.2),
    seg(M.type1_start - 0.1, M.type1_send + 2.7, W("private", "A small model", sec("private").end + 0.4), 0.4),
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
  const clipT = learnSeg.from + Math.max(0, frame / 30 - learnSeg.at) * (learnSeg.rate ?? 1);
  const weekN = clipT >= M.w4 + 0.25 ? 4 : clipT >= M.w3 + 0.25 ? 3 : clipT >= M.w2 + 0.25 ? 2 : 1;

  return (
    <AbsoluteFill style={{ opacity: sceneOut }}>
      {/* brand */}
      <div style={{ position: "absolute", left: brandX, top: brandY, transform: `translate(-50%,-50%) scale(${brandScale})`, display: "flex", alignItems: "center", gap: 34, opacity: ramp(frame, builtAt - 4, 12) }}>
        <Mark size={210} draw={draw} stroke={2.4} />
        <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 230, letterSpacing: -10, color: C.ink, lineHeight: 1 }}>Steady</span>
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

      {/* 01 learn */}
      <Callout at={learnAt} until={driftAt - 2} tag="01 · Learn" title={<>Learns<br />her normal</>} style={{ position: "absolute", left: 130, top: 190, width: 580 }} size={88} />
      {frame >= learnAt && frame < driftAt ? (
        <div style={{ position: "absolute", left: 130, top: 480, display: "flex", flexDirection: "column", gap: 24, opacity: interpolate(frame, [driftAt - 10, driftAt - 2], [1, 0], clamp) }}>
          <SignalRow base={learnAt + 8} at={sleepAt} icon="moon" label="Sleep" />
          <SignalRow base={learnAt + 11} at={reachAt} icon="chat" label="Reaching out" />
          <SignalRow base={learnAt + 14} at={moveAt} icon="move" label="Activity" />
          <SignalRow base={learnAt + 17} at={toneAt} icon="tone" label="Tone" />
        </div>
      ) : null}
      {frame >= learnAt && frame < driftAt ? (
        <div style={{ position: "absolute", left: 1270, top: 300, opacity: ramp(frame, learnAt + 2, 14) * interpolate(frame, [driftAt - 10, driftAt - 2], [1, 0], clamp) }}>
          <Mono size={20}>Week</Mono>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 330, lineHeight: 0.9, letterSpacing: -14, color: C.ink, fontVariantNumeric: "tabular-nums" }}>{weekN}<span style={{ fontSize: 92, letterSpacing: -3, color: C.inkSoft, fontWeight: 500 }}> of 4</span></div>
          <div style={{ fontFamily: F.body, fontSize: 30, color: C.inkSoft, marginTop: 20, maxWidth: 480, lineHeight: 1.36 }}>Her own range, not an average of everyone.</div>
        </div>
      ) : null}

      {/* 02 notice, then ask */}
      <Callout at={driftAt} until={passAt - 2} tag="02 · Notice" title={<>A lasting<br />shift</>} body="Two weeks outside her own range. One bad night changes nothing." style={{ position: "absolute", left: 130, top: 230, width: 580 }} size={88} />
      {frame >= asksAt - 2 && frame < passAt ? (
        <div style={{ position: "absolute", left: 1270, top: 280, width: 540, opacity: interpolate(frame, [passAt - 10, passAt - 2], [1, 0], clamp) }}>
          <div style={enter(frame, asksAt, 26, 16)}>
            <Mono size={20}>Then it asks</Mono>
            <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 104, lineHeight: 1, letterSpacing: -4.2, color: C.ink, marginTop: 14 }}>Two<br />questions</div>
            <div style={{ fontFamily: F.body, fontSize: 30, color: C.inkSoft, marginTop: 18, lineHeight: 1.36 }}>The ones doctors use.</div>
          </div>
          <div style={{ marginTop: 40, display: "flex", alignItems: "center", gap: 18, ...enter(frame, wordAt - 2, 20, 16) }}>
            <svg width="44" height="44" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" stroke={C.sage} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span style={{ fontFamily: F.display, fontWeight: 600, fontSize: 40, letterSpacing: -1.1, color: C.ink }}>Taken at her word</span>
          </div>
        </div>
      ) : null}

      {/* 03 it doesn't pass */}
      <Callout at={passAt} until={momAt - 8} tag="03 · Week 8" title={<>It doesn't<br />pass</>} body="Four weeks outside her range, and now her answers are high." style={{ position: "absolute", left: 130, top: 230, width: 580 }} size={88} />
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
      <Callout at={momAt + 2} until={privAt - 14} tag="04 · A parent" title={<>The<br />note</>} style={{ position: "absolute", left: 110, top: 250, width: 300 }} size={84} />
      {frame >= whatAt - 4 && frame < privAt ? (
        <div style={{ position: "absolute", left: 1530, top: 250, display: "flex", flexDirection: "column", gap: 22, alignItems: "flex-start", opacity: interpolate(frame, [privAt - 24, privAt - 15], [1, 0], clamp) }}>
          <Chip at={whatAt - 2}>What changed</Chip>
          <Chip at={longAt - 2}>For how long</Chip>
          <Chip at={howAt - 2}>How to start</Chip>
          <div style={{ marginTop: 34, display: "flex", alignItems: "center", gap: 16, ...enter(frame, neverAt - 3, 20, 16) }}>
            <Icon name="lock" size={46} />
            <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 44, letterSpacing: -1.4, color: C.ink, lineHeight: 1.05 }}>Never her<br />messages</span>
          </div>
        </div>
      ) : null}

      {/* private by design */}
      <Callout at={privAt + 2} tag="Private by design" title={<>Her words<br />stay on<br />her phone</>} style={{ position: "absolute", left: 130, top: 230, width: 580 }} size={88} />
      {frame >= modelAt - 4 ? (
        <div style={{ position: "absolute", left: 1270, top: 290, width: 540, ...enter(frame, modelAt - 2, 26, 16) }}>
          <Mono size={20}>Text sent</Mono>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 330, lineHeight: 0.9, letterSpacing: -14, color: C.ink }}>0<span style={{ fontSize: 84, letterSpacing: -3, color: C.inkSoft, fontWeight: 500 }}> bytes</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 30, opacity: ramp(frame, dotAt - 2, 14) }}>
            <span style={{ width: 22, height: 22, borderRadius: 14, background: C.ink }} />
            <span style={{ fontFamily: F.body, fontSize: 32, color: C.inkSoft }}>One dot is kept. The words are gone.</span>
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
