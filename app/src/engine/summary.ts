// What the teen's Home screen says. Words, never scores. Nothing here says a note was sent.

import { CONFIG } from "./config";
import { countingSignals } from "./rules";
import type { SignalId, TeenState } from "./types";

export const TEEN_LABEL: Record<SignalId, string> = {
  sleep: "sleep",
  reaching_out: "messaging",
  activity: "activity",
  tone: "tone",
  music: "late listening",
  replies: "reply time",
  night_phone: "late-night phone use",
  screen_time: "screen time",
  school: "schoolwork",
  night_activity: "late-night activity",
  typing_speed: "typing speed",
  typing_corrections: "typing corrections",
};

export const ROW_LABEL: Record<SignalId, string> = {
  sleep: "SLEEP",
  reaching_out: "REACHING OUT",
  activity: "ACTIVITY",
  tone: "TONE",
  music: "LATE LISTENING",
  replies: "REPLY TIME",
  night_phone: "NIGHT PHONE USE",
  screen_time: "SCREEN TIME",
  school: "SCHOOLWORK",
  night_activity: "LATE-NIGHT ACTIVITY",
  typing_speed: "TYPING SPEED",
  typing_corrections: "CORRECTIONS",
};

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
export const numWord = (n: number) => WORDS[n] ?? String(n);

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function list(sigs: SignalId[]): string {
  const w = sigs.map((k) => TEEN_LABEL[k]);
  if (w.length <= 1) return w.join("");
  return `${w.slice(0, -1).join(", ")} and ${w[w.length - 1]}`;
}

export interface HomeSummary {
  sentence: string;
  note: string;
  /** Signals drawn in amber this week. */
  drifted: SignalId[];
  calendar?: string;
}

function hoursWords(h: number): string {
  const r = Math.round(h * 2) / 2;
  const whole = Math.floor(r);
  return r - whole === 0.5 ? `${whole} and a half` : `${whole}`;
}

export function homeSummary(s: TeenState): HomeSummary {
  if (s.off) return { sentence: "Stability is off.", note: "You can turn it back on in Settings.", drifted: [] };
  if (!s.setupDone) return { sentence: "Setting up.", note: "", drifted: [] };
  const last = s.weeks[s.weeks.length - 1];
  if (s.setupHigh.active) {
    return {
      sentence: "Checking in every two weeks for now.",
      note: "The eight questions come back every two weeks. Stability starts learning your normal after that.",
      drifted: [],
    };
  }
  if (!last) {
    return {
      sentence: `Learning your normal. 0 of ${CONFIG.baselineWeeks} weeks learned.`,
      note: "One bad night changes nothing. Stability looks for changes that last.",
      drifted: [],
    };
  }
  const learnedWeeks = Math.max(...Object.values(s.learn).map((v) => v.length));
  // While something is outside the range, say so even if a newly connected line is still learning.
  const stillLearning = (!s.range.sleep || last.learning.length > 0) && !s.episode;
  if (stillLearning) {
    const n = Math.min(CONFIG.baselineWeeks, learnedWeeks);
    return {
      sentence: n >= CONFIG.baselineWeeks ? "Learning your normal for what you connected." : `Learning your normal. ${n} of ${CONFIG.baselineWeeks} weeks learned.`,
      note: "One bad night changes nothing. Stability looks for changes that last.",
      drifted: last.out,
    };
  }
  if (!last.valid) {
    return {
      sentence: "Not enough data this week.",
      note: "A short week is left out of the count.",
      drifted: [],
    };
  }
  const counting = countingSignals(s);
  if (s.episode) {
    const n = Math.min(...counting.map((k) => s.runs[k]));
    return {
      sentence: `${cap(list(counting))} ${counting.length > 1 ? "have" : "has"} been outside your usual for ${numWord(n)} weeks.`,
      note: last.data.calendar ? `${last.data.calendar} ${/s$/.test(last.data.calendar) ? "are" : "is"} on your calendar.` : "Stability keeps watching for changes that last.",
      drifted: last.out,
      calendar: last.data.calendar,
    };
  }
  if (last.out.length) {
    return {
      sentence: "Mostly in range this week.",
      note: `${cap(list(last.out))} ${last.out.length > 1 ? "were" : "was"} a little off your usual. One week changes nothing.`,
      drifted: last.out,
    };
  }
  const sleep = last.data.values.sleep;
  return {
    sentence: "In range this week.",
    note:
      typeof sleep === "number"
        ? `Week ${last.week}: about ${hoursWords(sleep)} hours of sleep a night, close to your usual.`
        : `Week ${last.week} looked like your usual.`,
    drifted: [],
  };
}

export function askLabel(s: TeenState): string | null {
  const a = s.ask;
  if (!a || a.kind === "setup") return null;
  if (a.answers.length > 0) return "Pick up where you left off";
  if (a.kind === "recheck") return "The eight questions, again";
  return "Two questions for you this week";
}
