// What the parent's phone does with the events it receives. Pure functions of the delivered
// events, the parent's own replies and the time. Replies never reach the teen's phone.

import { CONFIG, type Config } from "./config";
import type { HeadsUpEvent, StatusEvent, UrgentEvent } from "./types";
import type { SentRecord } from "./transport";

export type ReplyChoice = "talked" | "booked" | "not_yet" | "with_her" | "called_988" | "cant_reach";

export interface Reply {
  noteId: string;
  choice: ReplyChoice;
  at: number;
}

export interface Note {
  id: string;
  at: number;
  event: HeadsUpEvent | UrgentEvent;
  bytes: number;
  json: string;
}

export function notesFrom(records: SentRecord[], now: number): Note[] {
  return records
    .filter((r) => r.from === "teen" && r.at <= now && (r.event.type === "heads_up" || r.event.type === "urgent"))
    .map((r) => ({ id: r.id, at: r.at, event: r.event as HeadsUpEvent | UrgentEvent, bytes: r.bytes, json: r.json }));
}

export type ConnectionState = "waiting" | "on" | "not_connected";

export interface Connection {
  state: ConnectionState;
  lowData: boolean;
  noKeyboard: boolean;
  lastAt: number | null;
}

/** pairedAt is when this parent's phone linked. Until the first status arrives, the
 *  26 hours run from then. */
export function connection(records: SentRecord[], now: number, cfg: Config = CONFIG, pairedAt: number | null = null): Connection {
  let last: { at: number; e: StatusEvent } | null = null;
  for (const r of records) {
    if (r.event.type !== "status" || r.at > now) continue;
    if (!last || r.at >= last.at) last = { at: r.at, e: r.event };
  }
  if (!last) {
    const late = pairedAt != null && now - pairedAt > cfg.notConnectedMs;
    return { state: late ? "not_connected" : "waiting", lowData: false, noKeyboard: false, lastAt: null };
  }
  if (now - last.at > cfg.notConnectedMs) return { state: "not_connected", lowData: false, noKeyboard: false, lastAt: last.at };
  return { state: "on", lowData: !last.e.enough_data, noKeyboard: !last.e.keyboard_used, lastAt: last.at };
}

function repliesFor(noteId: string, replies: Reply[], now: number): Reply[] {
  return replies.filter((r) => r.noteId === noteId && r.at <= now).sort((a, b) => a.at - b.at);
}

export interface UrgentView {
  /** How many times the note has sounded again on the parent's phone. No cap. */
  repeatCount: number;
  /** The most recent repeats, for display (at most REPEATS_LISTED). */
  repeats: number[];
  /** When the other adults' apps show it, if they do. */
  othersAt: number | null;
  othersWhy: "no_reply" | "cant_reach" | null;
  firstReply: Reply | null;
  answered: boolean;
}

export const REPEATS_LISTED = 20;

/** An urgent note repeats every five minutes until someone taps a reply. If nobody replies
 *  within 15 minutes, or the parent taps "I can't reach her", the second adult and the
 *  trusted adult see it too. With neither named, it keeps repeating. */
export function urgentView(note: Note, replies: Reply[], now: number, hasOthers: boolean, cfg: Config = CONFIG): UrgentView {
  const rs = repliesFor(note.id, replies, now);
  const first = rs[0] ?? null;
  const R = cfg.urgentRepeatMs;
  // Repeat k sounds at note.at + k*R, for k >= 1, up to now and strictly before the first reply.
  const byNow = Math.max(0, Math.floor((now - note.at) / R));
  const byReply = first ? Math.max(0, Math.ceil((first.at - note.at) / R) - 1) : Infinity;
  const repeatCount = Math.min(byNow, byReply);
  const repeats: number[] = [];
  for (let k = Math.max(1, repeatCount - REPEATS_LISTED + 1); k <= repeatCount; k++) repeats.push(note.at + k * R);
  let othersAt: number | null = null;
  let othersWhy: UrgentView["othersWhy"] = null;
  if (hasOthers) {
    const due = note.at + cfg.urgentOthersAfterMs;
    const cant = rs.find((r) => r.choice === "cant_reach");
    const options: { t: number; why: "no_reply" | "cant_reach" }[] = [];
    if (cant) options.push({ t: cant.at, why: "cant_reach" });
    if ((!first || first.at > due) && now >= due) options.push({ t: due, why: "no_reply" });
    options.sort((a, b) => a.t - b.t);
    if (options.length) {
      othersAt = options[0].t;
      othersWhy = options[0].why;
    }
  }
  return { repeatCount, repeats, othersAt, othersWhy, firstReply: first, answered: first != null };
}

export interface HeadsUpView {
  /** Listed quietly in history: it came within six weeks of "Booked a doctor". */
  quiet: boolean;
  reminderAt: number | null;
  lastReply: Reply | null;
}

export function headsUpView(note: Note, all: Note[], replies: Reply[], now: number, cfg: Config = CONFIG): HeadsUpView {
  const booked = replies
    .filter((r) => r.choice === "booked" && r.at <= note.at)
    .some((r) => {
      const n = all.find((x) => x.id === r.noteId);
      return n?.event.type === "heads_up" && note.at - r.at < cfg.bookedHoldMs;
    });
  const rs = repliesFor(note.id, replies, now);
  const last = rs.length ? rs[rs.length - 1] : null;
  let reminderAt: number | null = null;
  if (!booked) {
    if (!last) reminderAt = note.at + cfg.reminderMs;
    else if (last.choice === "not_yet") reminderAt = last.at + cfg.reminderMs;
  }
  return { quiet: booked, reminderAt, lastReply: last };
}

export const REPLY_LABEL: Record<ReplyChoice, string> = {
  talked: "We talked",
  booked: "Booked a doctor",
  not_yet: "Not yet",
  with_her: "I'm with her",
  called_988: "Called 988",
  cant_reach: "I can't reach her",
};
