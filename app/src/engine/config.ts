// Every number the rules use lives here. They are starting guesses.
// Experiment 1 sets the four weeks and the three weeks. The 30 minutes, the 7 days,
// the 14 days, the six weeks and the phrases that skip the question need a clinician.
// See docs/parent-alerts.md.

import type { SignalId } from "./types";

export const HOUR = 60 * 60 * 1000;
export const MINUTE = 60 * 1000;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;

export const CONFIG = {
  // Learning the personal range
  baselineWeeks: 4, // valid weeks used to learn each signal's range
  minDaysPerWeek: 4, // a week counts only with at least this many days of usable data
  shortWeeksToRestart: 2, // this many short weeks in a row restart every count
  spreadFloor: {
    sleep: 0.3, // hours a night
    reaching_out: 1.0, // people messaged in a week
    activity: 600, // steps a day
    tone: 0.03, // share of own messages read as low mood
    music: 0.03, // share of plays between midnight and 5 a.m.
    replies: 1.0, // median hours to reply to an email
    night_phone: 10, // minutes on the phone between midnight and 5 a.m., a day
    screen_time: 30, // minutes on the phone a day
    school: 1, // late plus missing assignments in a week
    night_activity: 0.05, // share of own activity after midnight
    typing_speed: 15, // characters a minute
    typing_corrections: 0.02, // share of keystrokes that correct
  } as Record<SignalId, number>,
  // +1: a higher value is worse. -1: a lower value is worse.
  worseDirection: {
    sleep: -1,
    reaching_out: -1,
    activity: -1,
    tone: 1,
    music: 1,
    replies: 1,
    night_phone: 1,
    screen_time: 1,
    school: 1,
    night_activity: 1,
    typing_speed: -1,
    typing_corrections: 1,
  } as Record<SignalId, 1 | -1>,
  // How Gmail's low-mood share merges into tone with the keyboard's share.
  toneMerge: { keyboardWeight: 1, emailWeight: 1 },
  // Limits that apply to everyone, on top of the personal range.
  fixedLimits: {
    sleep: { worseThan: 6.0 }, // averaging under six hours a night
  } as Partial<Record<SignalId, { worseThan: number }>>,
  // The range moves quickly toward better weeks and slowly toward worse ones,
  // and freezes while any signal is outside it.
  rangeUpdate: { enabled: true, towardBetter: 0.25, towardWorse: 0.05 },

  // Drift
  zOut: 1.0, // a week is outside when it is this many spreads away in the worse direction
  weeksToCount: 2, // a signal counts after this many weeks outside in a row
  signalsToAsk: 2, // ask when this many signals count (or tone plus one other)
  extraWeeksForEight: 2, // two more weeks outside leads to the other six

  // Questions
  phq2Cutoff: 3,
  phq8Cutoff: 10,
  lowAnswerPauseWeeks: 2, // a low answer pauses asking this long
  askAnywayWeeks: 8, // the two questions come up every two months anyway

  // Heads-up
  skipRuleWeeks: 4, // two signals outside this long...
  skipRuleAsks: 2, // ...with this many asks in a row skipped
  cooldownMs: 3 * WEEK, // at most one heads-up in this window
  setupRecheckWeeks: 2, // after a high setup score the eight come back this often
  setupClearInRow: 2, // the range starts learning after this many rechecks under the cut-off
  setupSkipsInRow: 2, // this many skipped rechecks in a row send another heads-up

  // Urgent path
  safeAnswerTimeoutMs: 30 * MINUTE, // no answer to "Are you safe right now?" in this time sends the note
  secondFlagMs: 7 * DAY, // a second flag inside this window sends the urgent note
  flagsHeadsUpMs: 14 * DAY, // two flags inside this window send a heads-up, even after "yes"
  itemFlagMaxAgeMs: 24 * HOUR, // a flag from an email, message or file reaches the urgent path only if this recent
  itemFlagFutureMs: 2 * MINUTE, // and not later than now (allowing for clock drift)
  sameMessageMs: 2 * MINUTE, // flags this close with the same words are one message, whatever the source

  // Status
  statusHourUtc: 23, // one status event a day at this hour
  notConnectedMs: 26 * HOUR, // the parent app shows "Not connected" after this long without status

  // Parent phone
  urgentRepeatMs: 5 * MINUTE, // an urgent note repeats this often until a reply
  urgentOthersAfterMs: 15 * MINUTE, // unanswered, it goes to the second adult and the trusted adult
  reminderMs: 2 * DAY, // "Not yet" or no reply brings a reminder
  bookedHoldMs: 6 * 7 * DAY, // after "Booked a doctor" new heads-ups are listed quietly

  // Connected accounts (src/integrations)
  integrations: {
    windowDays: 28, // Gmail and Last.fm read the last 28 days
    calendarDays: 28, // Calendar reads four weeks back and four weeks ahead
    selfHarmEmailHours: 24, // emails sent this recently also go through the self-harm check
    maxSentEmails: 200, // most sent emails read in one pass
    fetchConcurrency: 4, // requests in flight at once
    lateNightStartHour: 0, // "after midnight" means from 00:00...
    lateNightEndHour: 5, // ...to 05:00, local time
    lastfmPageSize: 200,
    lastfmMaxPages: 25,
    gisLoadTimeoutMs: 15000,
    bucketLowFactor: 0.5, // iOS bucket "<N" reads as N times this
    ledgerKeepMs: 35 * DAY, // processed-item keys are kept this long (longer than any export's flag list)
    ledgerMax: 5000, // and at most this many
    phoneFreeMaxHours: 20, // a longer gap between last and first use is not a night
    screenMinutesMax: 1440, // a day has 1440 minutes
    nightMinutesMax: 300, // midnight to 5 a.m.
    examLabel: "An exam or test", // calendar context for an exam week
    exportWeeks: 12, // data files: the last 12 weeks before the latest own activity
    maxEntryBytes: 300 * 1024 * 1024, // a single file inside an export larger than this is not read
    maxTotalBytes: 1024 * 1024 * 1024, // and no more than this is unpacked from one export
    graphPageSize: 50, // Microsoft Graph items a page
    maxPages: 20, // most pages read from any one list
  },

  // Simulation
  weekEndHourOffset: -3, // weeks end Sunday 21:00 UTC (three hours before Monday)
  scriptedAnswerDelayMs: 30 * MINUTE,
};

export type Config = typeof CONFIG;
