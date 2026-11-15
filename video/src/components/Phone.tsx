import { AbsoluteFill, Freeze, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { f, FPS } from "../timing";

export const SCREEN_W = 390;
export const STATUS_H = 44;
export const APP_H = 800;    // the capture viewport of the app's single-phone routes is 390 x 800
export const SCREEN_H = STATUS_H + APP_H;
const BEZEL = 12;
export const PHONE_W = SCREEN_W + BEZEL * 2;
export const PHONE_H = SCREEN_H + BEZEL * 2;

/** A light phone drawn in CSS. Children fill the screen. */
export const Phone: React.FC<{ children?: React.ReactNode; style?: React.CSSProperties; label?: string }> = ({ children, style, label }) => (
  <div style={{ width: PHONE_W, height: PHONE_H, position: "relative", ...style }}>
    <div
      style={{
        position: "absolute", inset: 0, borderRadius: 62, padding: BEZEL,
        background: "linear-gradient(150deg,#3a3d42 0%,#17191c 42%,#2a2d31 100%)",
        boxShadow: "0 60px 120px rgba(21,23,26,0.28), 0 18px 40px rgba(21,23,26,0.14), inset 0 0 0 1.5px rgba(255,255,255,0.12)",
      }}
    >
      <div style={{ width: SCREEN_W, height: SCREEN_H, borderRadius: 50, overflow: "hidden", position: "relative", background: C.paperHi }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: STATUS_H, background: "#FBFAF7", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 30px 0 34px", fontFamily: F.body, fontWeight: 600, fontSize: 15, color: C.ink }}>
          <span>9:41</span>
          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <svg width="17" height="11" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill={C.ink} /><rect x="5" y="5" width="3" height="7" rx="1" fill={C.ink} /><rect x="10" y="2.5" width="3" height="9.5" rx="1" fill={C.ink} /><rect x="15" y="0" width="3" height="12" rx="1" fill={C.ink} /></svg>
            <svg width="25" height="12" viewBox="0 0 26 12"><rect x="0.5" y="0.5" width="22" height="11" rx="3.5" stroke={C.ink} opacity="0.45" fill="none" /><rect x="2.5" y="2.5" width="16" height="7" rx="2" fill={C.ink} /><rect x="23.5" y="4" width="2" height="4" rx="1" fill={C.ink} opacity="0.45" /></svg>
          </span>
        </div>
        <div style={{ position: "absolute", top: STATUS_H, left: 0, width: SCREEN_W, height: APP_H, overflow: "hidden" }}>
          {children ?? (
            <AbsoluteFill style={{ background: "linear-gradient(#FBFAF7,#F2F0EB)", alignItems: "center", justifyContent: "center", fontFamily: F.mono, fontSize: 13, letterSpacing: 1.6, color: C.inkSoft }}>{label ?? "SCREEN"}</AbsoluteFill>
          )}
        </div>
        <div style={{ position: "absolute", top: 9, left: SCREEN_W / 2 - 52, width: 104, height: 28, borderRadius: 18, background: "#0c0d0f" }} />
      </div>
    </div>
    <div style={{ position: "absolute", left: -3, top: 170, width: 3, height: 56, borderRadius: 2, background: "#24262a" }} />
    <div style={{ position: "absolute", left: -3, top: 240, width: 3, height: 56, borderRadius: 2, background: "#24262a" }} />
    <div style={{ position: "absolute", right: -3, top: 205, width: 3, height: 88, borderRadius: 2, background: "#24262a" }} />
  </div>
);

/** Plays rec/<name>.mp4 from `from` seconds and holds its last frame once it reaches `to`. */
export const Clip: React.FC<{ name: string; from: number; to?: number; rate?: number }> = ({ name, from, to, rate = 1 }) => {
  const frame = useCurrentFrame();
  const startFrom = Math.round(from * FPS);
  const len = to !== undefined ? Math.max(1, Math.round(((to - from) * FPS) / rate)) : Infinity;
  const v = <OffthreadVideo src={staticFile(`rec/${name}.mp4`)} startFrom={startFrom} playbackRate={rate} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
  if (frame >= len) return <Freeze frame={len - 1}>{v}</Freeze>;
  return v;
};

export type Seg = { clip: string; from: number; to: number; at: number; rate?: number };

/** A list of clip segments inside a screen. Each runs from its `at` (scene-local seconds) until the next begins. */
export const Track: React.FC<{ segs: Seg[]; sceneEnd: number }> = ({ segs, sceneEnd }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      {segs.map((s, i) => {
        const start = f(s.at);
        const end = i + 1 < segs.length ? f(segs[i + 1].at) : f(sceneEnd);
        const dur = Math.max(1, end - start);
        const fadeIn = i === 0 ? 1 : interpolate(frame, [start, start + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <Sequence key={i} from={start} durationInFrames={dur + (i + 1 < segs.length ? 6 : 0)} layout="none">
            <AbsoluteFill style={{ opacity: fadeIn }}>
              <Clip name={s.clip} from={s.from} to={s.to} rate={s.rate ?? 1} />
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
