import { Easing, interpolate, spring } from "remotion";
import { FPS } from "../timing";

export const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** 0 to 1 over `dur` frames starting at `start`, easing out. */
export const ramp = (frame: number, start: number, dur = 16) =>
  interpolate(frame, [start, start + dur], [0, 1], { ...clamp, easing: ease });

/** Fade and rise in; returns a style. */
export const enter = (frame: number, start: number, dist = 22, dur = 18) => {
  const p = ramp(frame, start, dur);
  return { opacity: p, transform: `translateY(${(1 - p) * dist}px)` };
};

/** 1 to 0 just before `end`. */
export const exitAt = (frame: number, end: number, dur = 10) => interpolate(frame, [end - dur, end], [1, 0], clamp);

/** A soft, well-damped spring: no visible bounce. */
export const settle = (frame: number, start: number) =>
  spring({ frame: frame - start, fps: FPS, config: { damping: 26, stiffness: 150, mass: 0.9 } });
