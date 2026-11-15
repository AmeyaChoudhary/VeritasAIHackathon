import timingJson from "./timing.json";

export type Word = { w: string; s: number; e: number };
export type Section = { id: string; start: number; end: number; words: Word[] };
export const timing = timingJson as { source: string; duration: number; sections: Section[] };
export const FPS = 30;
export const MAX_SECONDS = 120; // the hackathon's limit for the demo video
export const TAIL = Math.max(1.5, Math.min(3.2, MAX_SECONDS - timing.duration)); // end card hold

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9']/g, "");

export const sec = (id: string): Section => {
  const s = timing.sections.find((x) => x.id === id);
  if (!s) throw new Error(`no section ${id}`);
  return s;
};

/** Seconds when `phrase` starts being spoken inside section `id` (first match at or after `after`). */
export const cue = (id: string, phrase: string, after = 0): number => {
  const s = sec(id);
  const target = phrase.split(/\s+/).map(norm).filter(Boolean);
  const ws = s.words.map((w) => norm(w.w));
  for (let i = 0; i <= ws.length - target.length; i++) {
    if (s.words[i].s < after) continue;
    if (target.every((t, j) => ws[i + j] === t)) return s.words[i].s;
  }
  console.warn(`cue not found: ${id} / ${phrase}`);
  return s.start;
};
/** Seconds when `phrase` finishes being spoken. */
export const cueEnd = (id: string, phrase: string, after = 0): number => {
  const s = sec(id);
  const target = phrase.split(/\s+/).map(norm).filter(Boolean);
  const ws = s.words.map((w) => norm(w.w));
  for (let i = 0; i <= ws.length - target.length; i++) {
    if (s.words[i].s < after) continue;
    if (target.every((t, j) => ws[i + j] === t)) return s.words[i + target.length - 1].e;
  }
  return s.end;
};

export const f = (seconds: number) => Math.round(seconds * FPS);
export const totalFrames = () => Math.min(MAX_SECONDS * FPS - 3, f(timing.duration + TAIL));
/** A scene owns the time from its section start (minus a short lead) to the next section's start. */
export const sceneRange = (id: string, lead = 0.3) => {
  const i = timing.sections.findIndex((x) => x.id === id);
  const start = i === 0 ? 0 : timing.sections[i].start - lead;
  const next = timing.sections[i + 1];
  const end = next ? next.start - lead : timing.duration + TAIL;
  return { from: f(start), dur: f(end) - f(start), start, end };
};
