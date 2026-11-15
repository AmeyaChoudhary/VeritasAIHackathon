// Synthetic weekly data for the demo scenarios. Every number here is made up.
// Maya is fictional. Her story follows docs/parent-alerts.md ("In the demo") and the
// twelve weeks in docs/Stability-product-concept.pdf.

import { DAY, HOUR, MINUTE, WEEK } from "./config";
import type { Contrib, ContribKey, People, SourceId, WeekData } from "./types";
import type { ReplyChoice } from "./parent";

export type ScenarioId = "maya" | "steady" | "skips" | "urgent_plan" | "urgent_concern";

export interface ScriptMessage {
  id: string;
  at: number;
  text: string;
  /** What the phrase list should return. Checked by simulate.test.ts. */
  expect: "none" | "concern" | "plan";
  stop?: boolean;
}

export interface ScriptStop {
  id: string;
  at: number;
  label: string;
}

export interface ScriptReply {
  id: string;
  at: number;
  choice: ReplyChoice;
}

export interface Scenario {
  id: ScenarioId;
  title: string;
  blurb: string;
  startAt: number;
  people: People;
  setupAnswers: number[];
  weeks: WeekData[];
  /** Answers for the set asked at the end of that week: the two, then the six if asked.
   *  "skip" taps Not now. A missing week leaves the set unfinished. */
  answers: Record<number, number[] | "skip">;
  /** The two-tap check-in for each week, in order: [stress, time with others], each 1 to 5.
   *  null, or no list at all, means she did not check in. */
  checkins?: ([number, number] | null)[];
  messages: ScriptMessage[];
  stops: ScriptStop[];
  replies: ScriptReply[];
  /** A pattern the teen may find useful, shown on Home from this week on. */
  pattern?: { fromWeek: number; text: string };
}

/** Week 1 starts on Monday 2 November 2026, 00:00 UTC. */
export const T0 = Date.UTC(2026, 10, 2, 0, 0, 0);

/** Time inside a week: week is 1-based, day 0 is Monday. */
export function at(week: number, day: number, hour: number, minute = 0): number {
  return T0 + (week - 1) * WEEK + day * DAY + hour * HOUR + minute * MINUTE;
}

export const DEMO_PEOPLE: People = {
  teen: "Maya",
  teenPronoun: "she",
  parent: "Mom",
  parentPronoun: "she",
  second: "Dad",
  trusted: "Ms. Patel",
};

const wk = (sleep: number, reaching_out: number, activity: number, tone: number, extra: Partial<WeekData> = {}): WeekData => ({
  days: 7,
  values: { sleep, reaching_out, activity, tone },
  ...extra,
});

// Values for connected accounts. They reach the rules only when the teen connects that
// account (or its sample data). These sit inside the usual range week to week.
const STEADY_EXTRA = {
  music: [0.08, 0.1, 0.07, 0.09, 0.085, 0.09, 0.08, 0.09, 0.085, 0.08, 0.09, 0.085],
  replies: [3.2, 2.8, 3.5, 2.5, 3, 3.1, 2.9, 3.2, 3, 2.8, 3.1, 3],
  night_phone: [12, 15, 10, 13, 12, 14, 11, 12, 13, 12, 14, 12],
  screen_time: [240, 255, 230, 245, 250, 240, 235, 245, 250, 240, 245, 238],
  emailTone: [0.1, 0.09, 0.11, 0.1, 0.1, 0.11, 0.09, 0.1, 0.1, 0.11, 0.1, 0.09],
};

type Extra = Partial<Record<keyof typeof STEADY_EXTRA, number[]>>;

/** Made-up weekly numbers for the newer sources, used only in sample mode. Stable week to week. */
type PartSeries = Partial<Record<SourceId, Partial<Record<ContribKey, number[]>>>>;

const STEADY_PARTS: PartSeries = {
  gmail: { messages: [8, 9, 7, 8, 8, 9, 8, 7, 8, 9, 8, 8] },
  microsoft: {
    messages: [3, 4, 3, 2, 3, 4, 3, 3, 4, 3, 2, 3],
    lowMood: [0.1, 0.11, 0.09, 0.1, 0.1, 0.1, 0.11, 0.09, 0.1, 0.1, 0.11, 0.1],
    replyHours: [4, 5, 3.5, 4.5, 4, 4.5, 4, 5, 4, 4.5, 4, 4],
  },
  classroom: { school: [0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0] },
  canvas: { school: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
  schoology: { school: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0] },
  drive: { lateEvents: [2, 3, 1, 2, 2, 3, 2, 1, 2, 3, 2, 2], events: [40, 35, 42, 38, 40, 36, 41, 39, 40, 37, 42, 38] },
  youtube: { lateEvents: [5, 6, 4, 5, 5, 6, 5, 4, 5, 6, 5, 5], events: [60, 55, 62, 58, 60, 57, 61, 59, 60, 56, 62, 58] },
  instagram: {
    messages: [20, 22, 18, 21, 20, 22, 19, 21, 20, 22, 18, 21],
    lowMood: [0.1, 0.09, 0.11, 0.1, 0.1, 0.11, 0.1, 0.09, 0.1, 0.1, 0.11, 0.1],
    lateEvents: [4, 5, 3, 4, 4, 5, 4, 3, 4, 5, 4, 4],
    events: [50, 52, 48, 51, 50, 52, 49, 51, 50, 52, 48, 51],
  },
  tiktok: {
    messages: [10, 12, 9, 11, 10, 12, 10, 11, 10, 12, 9, 11],
    lowMood: [0.1, 0.11, 0.1, 0.09, 0.1, 0.1, 0.11, 0.1, 0.1, 0.09, 0.1, 0.11],
    lateEvents: [8, 9, 7, 8, 8, 9, 8, 7, 8, 9, 8, 8],
    events: [80, 85, 78, 82, 80, 84, 79, 81, 80, 85, 78, 82],
  },
  snapchat: {
    messages: [30, 28, 32, 29, 30, 31, 29, 30, 30, 28, 32, 29],
    lowMood: [0.1, 0.1, 0.09, 0.11, 0.1, 0.1, 0.09, 0.1, 0.11, 0.1, 0.1, 0.09],
    lateEvents: [2, 2, 3, 2, 2, 3, 2, 2, 3, 2, 2, 2],
    events: [30, 28, 32, 29, 30, 31, 29, 30, 30, 28, 32, 29],
  },
  discord: {
    messages: [25, 27, 23, 26, 25, 27, 24, 26, 25, 27, 23, 26],
    lowMood: [0.1, 0.1, 0.11, 0.09, 0.1, 0.1, 0.1, 0.11, 0.1, 0.09, 0.1, 0.1],
    lateEvents: [2, 3, 2, 2, 2, 3, 2, 2, 2, 3, 2, 2],
    events: [25, 27, 23, 26, 25, 27, 24, 26, 25, 27, 23, 26],
  },
  screentime: {
    messages: [120, 125, 115, 122, 120, 124, 118, 121, 120, 125, 115, 122],
    lowMood: [0.1, 0.1, 0.11, 0.09, 0.1, 0.1, 0.11, 0.1, 0.09, 0.1, 0.1, 0.11],
    typingSpeed: [180, 185, 175, 182, 180, 184, 178, 181, 180, 185, 175, 182],
    corrections: [0.06, 0.062, 0.058, 0.061, 0.06, 0.062, 0.059, 0.06, 0.061, 0.06, 0.058, 0.062],
  },
};


function withConnected(weeks: WeekData[], over: Extra = {}, parts: PartSeries = {}): WeekData[] {
  const pick = (k: keyof typeof STEADY_EXTRA, i: number) => (over[k] ?? STEADY_EXTRA[k])[i] ?? STEADY_EXTRA[k][i % 12];
  return weeks.map((w, i) => {
    const out: WeekData["parts"] = {};
    for (const src of Object.keys(STEADY_PARTS) as SourceId[]) {
      const series = { ...STEADY_PARTS[src], ...(parts[src] ?? {}) };
      const c: Contrib = {};
      for (const [k, xs] of Object.entries(series)) if (xs) c[k as ContribKey] = xs[i % xs.length];
      out[src] = c;
    }
    // Trackers follow the phone's own sleep and steps closely.
    out.fitbit = { sleep: (w.values.sleep ?? 7.5) - 0.2, steps: Math.round((w.values.activity ?? 8000) * 0.95) };
    out.screentime = {
      ...out.screentime,
      sleep: (w.values.sleep ?? 7.5) - 0.1,
      steps: Math.round((w.values.activity ?? 8000) * 1.02),
    };
    return {
      ...w,
      values: {
        ...w.values,
        music: pick("music", i),
        replies: pick("replies", i),
        night_phone: pick("night_phone", i),
        screen_time: pick("screen_time", i),
      },
      emailTone: pick("emailTone", i),
      parts: out,
    };
  });
}

const maya: Scenario = {
  id: "maya",
  title: "Maya's 12 weeks",
  blurb:
    "She checks in each week. At the monthly ask in week 4 her answers are just under the cutoff and taken at her word. Finals come, her check-ins get more stressed, and the ask model asks again in week 6 instead of waiting a month. In week 8 her answers are high and Mom gets a heads-up.",
  startAt: T0,
  people: DEMO_PEOPLE,
  setupAnswers: [1, 0, 1, 1, 0, 0, 1, 0],
  weeks: withConnected([
    wk(7.9, 11, 9200, 0.08),
    wk(7.4, 12, 8700, 0.1),
    wk(7.0, 10, 9400, 0.11), // one four-hour night after an argument: one bad night, nothing happens
    wk(7.7, 11, 8900, 0.09),
    wk(5.8, 9, 6400, 0.11, { calendar: "Finals" }),
    wk(5.6, 9, 6100, 0.12, { calendar: "Finals" }),
    wk(5.9, 4, 8700, 0.115),
    wk(5.7, 4, 8800, 0.12),
    wk(7.3, 8, 8900, 0.11),
    wk(7.4, 10.5, 9100, 0.1),
    wk(7.6, 11, 9000, 0.09),
    wk(7.5, 11, 9300, 0.09),
  ], {
    // Weeks 5 to 8: later listening and slower replies, then back.
    music: [0.08, 0.1, 0.07, 0.09, 0.2, 0.22, 0.26, 0.25, 0.1, 0.09, 0.08, 0.08],
    replies: [3.2, 2.8, 3.5, 2.5, 6, 7, 9, 10, 3.5, 3.2, 3, 2.9],
  }, {
    // Weeks 5 to 8 for the newer sources: more missing work, later nights online, fewer
    // messages and slower typing, then back.
    gmail: { messages: [8, 9, 7, 8, 6, 5, 4, 4, 6, 8, 8, 8] },
    classroom: { school: [0, 1, 0, 0, 1, 3, 4, 4, 2, 1, 0, 0] },
    drive: { lateEvents: [2, 3, 1, 2, 10, 12, 14, 15, 4, 2, 2, 2] },
    youtube: { lateEvents: [5, 6, 4, 5, 20, 24, 28, 30, 8, 6, 5, 5] },
    discord: { messages: [25, 27, 23, 26, 22, 20, 10, 8, 18, 24, 25, 26], events: [25, 27, 23, 26, 22, 20, 10, 8, 18, 24, 25, 26] },
    snapchat: { messages: [30, 28, 32, 29, 26, 24, 12, 10, 22, 28, 30, 29], events: [30, 28, 32, 29, 26, 24, 12, 10, 22, 28, 30, 29] },
    screentime: {
      typingSpeed: [180, 185, 175, 182, 176, 172, 155, 150, 172, 180, 182, 181],
      corrections: [0.06, 0.062, 0.058, 0.061, 0.066, 0.07, 0.088, 0.092, 0.07, 0.062, 0.06, 0.061],
    },
  }),
  answers: {
    4: [1, 1], // the monthly ask: "several days" on both, a total of 2, under the cutoff of 3
    6: [1, 1], // the ask model asked two weeks early; still under the cutoff
    8: [2, 2, 2, 1, 2, 1, 1, 1],
    10: [1, 1],
    12: [0, 1],
  },
  // Stress climbs and time with others falls through finals, then both ease.
  checkins: [[2, 4], [2, 4], [3, 4], [2, 4], [4, 3], [4, 2], [4, 2], [5, 1], [3, 3], [3, 3], [2, 4], [2, 4]],
  messages: [],
  stops: [],
  replies: [{ id: "r-booked", at: at(9, 0, 18, 10), choice: "booked" }],
  pattern: { fromWeek: 4, text: "You sleep about an hour less on nights before matches." },
};

const steady: Scenario = {
  id: "steady",
  title: "Stable week to week",
  blurb:
    "Everything stays in range. The two questions come up once a month anyway. Week 10 has too little data and week 11 has days without the Stability keyboard. No notes.",
  startAt: T0,
  people: { ...DEMO_PEOPLE, teen: "Maya" },
  setupAnswers: [0, 0, 1, 0, 0, 0, 0, 0],
  weeks: withConnected([
    wk(7.3, 9, 7600, 0.12),
    wk(7.0, 10, 7300, 0.13),
    wk(7.4, 8, 7900, 0.11),
    wk(7.1, 9, 7400, 0.12),
    wk(7.3, 9, 7700, 0.12),
    wk(7.05, 10, 7350, 0.13),
    wk(7.2, 8.5, 7500, 0.11),
    wk(7.1, 9, 7600, 0.12),
    wk(7.4, 9.5, 7800, 0.125),
    wk(7.1, 8.5, 7400, 0.13, { days: 2 }),
    wk(7.25, 9, 7650, 0.115, { keyboardDays: 3 }),
    wk(7.15, 10, 7500, 0.12),
  ]),
  answers: { 4: [0, 0], 8: [0, 1], 12: [0, 0] },
  checkins: [[2, 4], [2, 3], [1, 4], [2, 4], [2, 4], [3, 4], [2, 3], [2, 4], [2, 4], [2, 4], [1, 4], [2, 4]],
  messages: [],
  stops: [],
  replies: [],
  pattern: { fromWeek: 4, text: "Your most active weeks were also your best-rested ones." },
};

const skips: Scenario = {
  id: "skips",
  title: "Skips the questions",
  blurb:
    "She answers the monthly ask in week 4, then stops checking in. From week 5 sleep and messaging drop and stay down, so her phone signals decide when to ask, and every set is skipped. After four weeks outside with the last two asks skipped, Mom gets a heads-up. A second one waits for the three-week limit.",
  startAt: T0,
  people: DEMO_PEOPLE,
  setupAnswers: [1, 0, 1, 1, 1, 0, 0, 0],
  weeks: withConnected([
    wk(7.6, 10, 8000, 0.1),
    wk(7.2, 11, 8400, 0.09),
    wk(7.5, 9, 7800, 0.11),
    wk(7.3, 10, 8200, 0.1),
    wk(6.6, 8.5, 7900, 0.11),
    wk(6.5, 8, 7700, 0.12),
    wk(6.4, 7.5, 8000, 0.11),
    wk(6.5, 7.5, 7800, 0.12),
    wk(6.3, 7, 7900, 0.11),
    wk(6.4, 7.5, 7700, 0.12),
    wk(6.5, 7, 7800, 0.11),
    wk(6.4, 7.5, 7900, 0.12),
  ]),
  // She answers the monthly ask in week 4, then stops: no check-ins, and every set skipped.
  // With no check-ins, Stability falls back to her phone signals to decide when to ask.
  answers: { 4: [0, 1], 6: "skip", 7: "skip", 8: "skip", 9: "skip", 10: "skip", 11: "skip", 12: "skip" },
  messages: [],
  stops: [],
  replies: [],
};

const baseFour = withConnected([wk(7.5, 10, 8600, 0.1), wk(7.2, 11, 8200, 0.11), wk(7.6, 9, 8800, 0.09), wk(7.3, 10, 8400, 0.1)]);

const urgentPlan: Scenario = {
  id: "urgent_plan",
  title: "Urgent: plan words",
  blurb:
    "Late on a Wednesday in week 3, Maya types words that state a plan. 988 and 911 fill her screen at once and Mom gets an urgent note at once.",
  startAt: T0,
  people: DEMO_PEOPLE,
  setupAnswers: [1, 1, 1, 1, 1, 0, 1, 0],
  weeks: baseFour,
  answers: {},
  messages: [
    { id: "m1", at: at(3, 2, 22, 50), text: "cant wait for the weekend honestly", expect: "none" },
    { id: "m2", at: at(3, 2, 23, 10), text: "i made up my mind to end it tonight", expect: "plan", stop: true },
  ],
  stops: [],
  replies: [{ id: "r-with", at: at(3, 2, 23, 17), choice: "with_her" }],
};

const urgentConcern: Scenario = {
  id: "urgent_concern",
  title: "Urgent: concern, no answer",
  blurb:
    'In week 3 Maya types words about self-harm that do not state a plan. Stability asks "Are you safe right now?" with 988 behind it. Nobody answers, so after 30 minutes Mom gets an urgent note. Nobody replies, so after 15 more minutes it shows on Dad\'s phone and Ms. Patel\'s phone too.',
  startAt: T0,
  people: DEMO_PEOPLE,
  setupAnswers: [1, 1, 1, 1, 1, 0, 1, 0],
  weeks: baseFour,
  answers: {},
  messages: [{ id: "m1", at: at(3, 3, 22, 40), text: "honestly nobody would miss me", expect: "concern", stop: true }],
  stops: [
    { id: "s1", at: at(3, 3, 23, 10), label: "30 minutes, no answer" },
    { id: "s2", at: at(3, 3, 23, 25), label: "15 more minutes, no reply" },
  ],
  replies: [],
};

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  maya,
  steady,
  skips,
  urgent_plan: urgentPlan,
  urgent_concern: urgentConcern,
};

export const SCENARIO_ORDER: ScenarioId[] = ["maya", "steady", "skips", "urgent_plan", "urgent_concern"];
