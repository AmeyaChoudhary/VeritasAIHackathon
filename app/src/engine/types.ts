// Shared types for the Stability engine. Pure TypeScript, no React.

export type SignalId =
  | "sleep"
  | "reaching_out"
  | "activity"
  | "tone"
  | "music"
  | "replies"
  | "night_phone"
  | "screen_time"
  | "school"
  | "night_activity"
  | "typing_speed"
  | "typing_corrections";

/** Order used everywhere: charts, area lists, notes. */
export const SIGNALS: SignalId[] = [
  "sleep",
  "reaching_out",
  "activity",
  "tone",
  "music",
  "replies",
  "night_phone",
  "screen_time",
  "school",
  "night_activity",
  "typing_speed",
  "typing_corrections",
];

/** Signals every phone has. The rest come from connected accounts. */
export const CORE_SIGNALS: SignalId[] = ["sleep", "reaching_out", "activity", "tone"];

/** Accounts and files the teen can connect on their own phone. "screentime" is the Android
 *  phone-data file (screen time, and from version 2 Health Connect and the Stability keyboard). */
export type SourceId =
  | "gmail"
  | "calendar"
  | "microsoft"
  | "classroom"
  | "drive"
  | "canvas"
  | "schoology"
  | "lastfm"
  | "spotify"
  | "fitbit"
  | "screentime"
  | "instagram"
  | "tiktok"
  | "snapchat"
  | "discord"
  | "youtube"
  | "chrome";

export const SOURCES: SourceId[] = [
  "gmail",
  "calendar",
  "microsoft",
  "classroom",
  "drive",
  "canvas",
  "schoology",
  "lastfm",
  "spotify",
  "fitbit",
  "screentime",
  "instagram",
  "tiktok",
  "snapchat",
  "discord",
  "youtube",
  "chrome",
];

/** What one source tells the rules about one week. sleep: hours a night; steps: a day;
 *  messages: sent that week; lowMood: share of own words read as low mood; replyHours: median
 *  hours to reply; music: share of plays after midnight; lateEvents and events: own activity
 *  after midnight and in all; school: late plus missing assignments; typingSpeed: characters a
 *  minute; corrections: share of keystrokes that correct; screen and night: phone minutes a day
 *  and between midnight and 5 a.m. */
export type ContribKey =
  | "sleep"
  | "steps"
  | "messages"
  | "lowMood"
  | "replyHours"
  | "music"
  | "lateEvents"
  | "events"
  | "school"
  | "typingSpeed"
  | "corrections"
  | "screen"
  | "night";

export type Contrib = Partial<Record<ContribKey, number>>;

/** The phone's own simulated numbers are the "phone" part. */
export type PartId = SourceId | "phone";

export interface SourceLink {
  mode: "real" | "sample";
  at: number;
  /** What this connection gives, when it is less than the source can (an Android file
   *  without Health Connect, say). Fixed at connect time so the mix stays the same. */
  provides?: ContribKey[];
}

/** One week of a connected account's real numbers, joined to the engine's week by its
 *  Monday. Only complete weeks are observations; an incomplete week leaves the source out. */
export interface LiveSourceWeek {
  complete: boolean;
  contrib: Contrib;
  exam?: boolean;
}

export type LiveWeek = Partial<Record<SourceId, LiveSourceWeek>>;

export type SignalValues = Partial<Record<SignalId, number>>;

/** One week of data as the phone summarises it. */
export interface WeekData {
  /** Days this week with usable data, 0 to 7. */
  days: number;
  /** Weekly value per signal. sleep: hours a night; reaching_out: people messaged;
   *  activity: steps a day; tone: share of own messages read as low mood;
   *  music: share of plays between midnight and 5 a.m. (Last.fm or Spotify); replies: median hours to
   *  reply to an email (Gmail); night_phone: minutes on the phone between midnight and 5 a.m.
   *  a day; screen_time: minutes on the phone a day (screen-time app). */
  values: SignalValues;
  /** Share of the teen's sent emails read as low mood (Gmail). Merges into tone. */
  emailTone?: number;
  /** The keyboard's own tone share, kept when Gmail's is merged in. Set by the engine. */
  keyboardTone?: number;
  /** Per-source numbers for this week. The "phone" part is filled from values by the engine. */
  parts?: Partial<Record<PartId, Contrib>>;
  /** Which parts made each signal's value this week, such as "phone+gmail". Set by the engine. */
  mix?: Partial<Record<SignalId, string>>;
  /** Exams and events on the calendar. Context only, never a trigger, and only shown
   *  when the calendar is connected. */
  calendar?: string;
  /** Days this week the Stability keyboard was used. Defaults to 7. */
  keyboardDays?: number;
}

export interface Range {
  mean: number;
  spread: number;
}

export interface WeekRecord {
  week: number; // 1-based
  endedAt: number; // sim ms
  data: WeekData;
  valid: boolean;
  z: SignalValues;
  out: SignalId[];
  counting: SignalId[];
  learning: SignalId[];
  /** Snapshot of each range used this week, for the chart. */
  ranges: Partial<Record<SignalId, Range>>;
  /** The ask model's score at this week's end, 0 to 1. */
  askScore?: number;
}

// ---- Events that leave the teen's phone (docs/parent-alerts.md, "What leaves the phone")

export interface HeadsUpEvent {
  type: "heads_up";
  areas?: SignalId[];
  weeks?: number;
  sent_at: string;
}

export interface UrgentEvent {
  type: "urgent";
  sent_at: string;
}

export interface StatusEvent {
  type: "status";
  enough_data: boolean;
  keyboard_used: boolean;
  sent_at: string;
}

export type SteadyEvent = HeadsUpEvent | UrgentEvent | StatusEvent;

/** A receipt the parent app sends through the relay when the parent taps a reply to an
 *  urgent note. It tells the other adults' apps whether to show the note. It never reaches
 *  the teen's phone. */
export interface ReceiptEvent {
  type: "receipt";
  for: string; // sent_at of the urgent note
  reached: boolean; // false for "I can't reach her"
  sent_at: string;
}

// ---- People

export type Pronoun = "she" | "he" | "they";

export interface People {
  teen: string;
  teenPronoun: Pronoun;
  parent: string;
  parentPronoun: Pronoun;
  /** Second adult named by the parent, for urgent notes. */
  second?: string;
  /** Trusted adult outside the home named by the teen, for urgent notes only. */
  trusted?: string;
}

// ---- Questions

/** setup: the eight at setup. check: the two, then maybe the other six.
 *  recheck: the eight every two weeks after a high setup score. */
export type AskKind = "setup" | "check" | "recheck";

export interface PendingAsk {
  id: string;
  kind: AskKind;
  week: number;
  issuedAt: number;
  answers: number[];
  /** true once the other six follow (always true for setup and recheck). */
  six: boolean;
  /** model: the ask model's score reached its threshold (Experiment 4). */
  reason: "setup" | "signals" | "anyway" | "recheck" | "model";
}

/** The weekly check-in, in the study's own scales: stress 1 (not at all) to 5 (extremely),
 *  withOthers 1 (almost always alone) to 5 (almost always with others). */
export interface Checkin {
  stress: number;
  withOthers: number;
}

export type AskResult = "skipped" | "low" | "high";

export interface AskRecord {
  id: string;
  kind: AskKind;
  week: number;
  issuedAt: number;
  closedAt: number;
  result: AskResult;
  /** Why it was asked: the monthly ask, the ask model, or phone signals as the backstop. */
  reason?: PendingAsk["reason"];
  /** Kept on the phone only. Never in a note. */
  total?: number;
}

export type HeldReason = "highScore" | "skipRule" | "setupSkips" | "flags";

export interface Trace {
  at: number;
  text: string;
}

/** What the teen's phone shows on top of its normal screens. */
export type SafetyScreen = "none" | "ask" | "help" | "emergency";

export interface TeenState {
  v: 1;
  code: string;
  paired: boolean;
  people: People;
  acknowledged: boolean;
  setupDone: boolean;
  off: boolean;
  /** Accounts connected on this phone. */
  sources: Partial<Record<SourceId, SourceLink>>;

  /** Sim time when week 1 begins. */
  startAt: number;
  /** Weeks completed. */
  week: number;
  weeks: WeekRecord[];
  shortInRow: number;

  /** Learning values and ranges for each signal, per mix of sources ("phone", "phone+gmail").
   *  A merged signal is compared only with the range of the same mix. */
  mixLearn: Partial<Record<SignalId, Record<string, number[]>>>;
  mixRange: Partial<Record<SignalId, Record<string, Range>>>;
  /** Views of the two above for the mix the connected sources make now. */
  learn: Record<SignalId, number[]>;
  range: Partial<Record<SignalId, Range>>;
  /** Valid weeks in a row each signal has been outside its range. */
  runs: Record<SignalId, number>;
  /** The four weeks of the skip rule: valid weeks in a row each signal has been outside,
   *  restarted by a low answer or by two short weeks in a row. */
  skipRuns: Record<SignalId, number>;
  /** Week each of those streaks began. */
  skipSince: Record<SignalId, number | null>;
  /** The "outside range" state. validWeeks counts the start week as 1. */
  episode: { start: number; validWeeks: number } | null;

  /** The weekly two-tap check-in, by the week it was given in. Kept on the phone only. */
  checkins?: Record<number, Checkin>;
  /** Every PHQ-2 score so far (the first two answers of a set), with its week. Kept on the phone only. */
  phq2s?: { week: number; score: number }[];

  ask: PendingAsk | null;
  asks: AskRecord[];
  lastAskWeek: number;
  pauseUntilWeek: number;
  setupHigh: { active: boolean; nextWeek: number; clearInRow: number; skipsInRow: number };

  lastHeadsUpAt: number | null;
  held: Record<HeldReason, boolean>;

  /** Doctor suggestion on the teen's home screen. pending waits for the next weekly note. */
  doctor: { show: boolean; pending: boolean };

  safety: {
    screen: SafetyScreen;
    deadline: number | null; // answer to "Are you safe right now?" due by then
    /** The question is open because only the model flagged a message: no deadline, "No" still sends. */
    soft?: boolean;
    /** Self-harm flags, kept for 14 days. An email flag carries an opaque key so the same
     *  email never counts twice. */
    flags: { at: number; key?: string; textHash?: string }[];
  };

  /** Day index -> had usable data. Days before week 1 count as having data. */
  dataDays: Record<number, boolean>;
  keyboardDays: Record<number, boolean>;
  lastDayDone: number;

  trace: Trace[];
}
