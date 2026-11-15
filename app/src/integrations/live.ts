// Joins a real account's weekly numbers to the engine's weeks, by the Monday of the week.
// Only sources connected with real data take part, and only complete weeks are observations.

import { CONFIG, type Config } from "../engine/config";
import { SOURCES, type Contrib, type LiveWeek } from "../engine/types";
import type { Accounts, GenericAccount } from "./accounts";

const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function clean(c: Contrib): Contrib {
  const out: Contrib = {};
  for (const [k, v] of Object.entries(c)) if (typeof v === "number" && Number.isFinite(v)) out[k as keyof Contrib] = v;
  return out;
}

export function liveWeekFrom(a: Accounts, weekOf: string, cfg: Config = CONFIG): LiveWeek {
  const out: LiveWeek = {};
  const enough = (n: number | undefined) => (n ?? 0) >= cfg.minDaysPerWeek;
  if (a.gmail?.mode === "real") {
    const w = a.gmail.weeks.find((x) => x.weekOf === weekOf);
    if (w)
      out.gmail = {
        complete: w.complete,
        contrib: clean({ messages: w.emails_sent, lowMood: num(w.low_mood_share), replyHours: num(w.median_reply_hours) }),
      };
  }
  if (a.lastfm?.mode === "real") {
    const w = a.lastfm.weeks.find((x) => x.weekOf === weekOf);
    if (w) out.lastfm = { complete: w.complete && w.plays > 0, contrib: clean({ music: num(w.late_share) }) };
  }
  if (a.screentime?.mode === "real") {
    const w = a.screentime.weeks.find((x) => x.weekOf === weekOf);
    if (w) {
      const c: Contrib = {
        screen: enough(w.screen_days) ? num(w.screen_minutes) : undefined,
        night: enough(w.night_days) ? num(w.night_minutes) : undefined,
        sleep: enough(w.sleep_days) ? num(w.sleep_hours) : undefined,
        steps: enough(w.steps_days) ? num(w.steps) : undefined,
        messages: enough(w.kb_days) ? num(w.kb_messages) : undefined,
        lowMood: enough(w.kb_days) ? num(w.kb_low_mood_share) : undefined,
        typingSpeed: enough(w.kb_days) ? num(w.kb_chars_per_min) : undefined,
        corrections: enough(w.kb_days) ? num(w.kb_correction_rate) : undefined,
      };
      const contrib = clean(c);
      out.screentime = { complete: w.complete !== false && Object.keys(contrib).length > 0, contrib };
    }
  }
  if (a.calendar?.mode === "real") {
    const w = a.calendar.weeks.find((x) => x.weekOf === weekOf);
    if (w) out.calendar = { complete: true, contrib: {}, exam: w.exam };
  }
  for (const src of SOURCES) {
    if (src === "gmail" || src === "lastfm" || src === "screentime" || src === "calendar") continue;
    const acc = (a as Record<string, GenericAccount | undefined>)[src];
    if (acc?.mode !== "real") continue;
    const w = acc.weeks.find((x) => x.weekOf === weekOf);
    const exam = acc.examWeeks?.includes(weekOf);
    if (w) out[src] = { complete: w.complete, contrib: clean(w.contrib), exam: exam || w.exam };
    else if (exam) out[src] = { complete: false, contrib: {}, exam };
  }
  return out;
}
