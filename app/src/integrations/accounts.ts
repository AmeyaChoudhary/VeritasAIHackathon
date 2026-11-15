// What the teen's phone keeps from connected accounts: weekly numbers only. No text, no
// titles, no usernames. Stored in this browser (the teen's phone in the demo); the parent's
// phone never reads it. When storage is blocked, the numbers live in memory for this page.

import { useSyncExternalStore } from "react";
import type { ContribKey, SourceId } from "../engine/types";
import type { AggWeek } from "./agg";
import type { GmailWeek } from "./gmail";
import type { CalendarWeek } from "./calendar";
import type { LastfmWeek } from "./lastfm";
import type { ScreenWeek } from "./screentime";

interface Base {
  mode: "real" | "sample";
  fetchedAt: number;
}
/** The newer sources share one shape: weeks of numbers, and a few counts for the screen. */
export interface GenericAccount extends Base {
  weeks: AggWeek[];
  truncated?: boolean;
  /** Exam weeks (Microsoft calendar), Mondays only. */
  examWeeks?: string[];
  /** Counts shown on the Connect screen. Numbers only. */
  counts?: Record<string, number>;
  layout?: string;
  /** Plain sentences about what could not be read (files too big, conversations skipped). */
  notes?: string[];
}

type Generic = Exclude<SourceId, "gmail" | "calendar" | "lastfm" | "screentime">;

export type Accounts = {
  gmail?: Base & { weeks: GmailWeek[]; read: number; truncated: boolean; skipped: number };
  calendar?: Base & { weeks: CalendarWeek[]; events: number };
  lastfm?: Base & { weeks: LastfmWeek[]; plays: number; truncated: boolean };
  screentime?: Base & { weeks: ScreenWeek[]; source: string; version?: 1 | 2 };
} & { [K in Generic]?: GenericAccount };

export type { ContribKey };

const KEY = "steady.v3.accounts";

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function read(): Accounts | null {
  try {
    const raw = storage()?.getItem(KEY);
    return raw ? (JSON.parse(raw) as Accounts) : {};
  } catch {
    return null;
  }
}

/** The page's copy. It is the truth for this page; storage is a copy for later visits. */
let cache: Accounts = read() ?? {};
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

if (typeof window !== "undefined") {
  // Another tab changed the stored copy.
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    const v = read();
    if (v) {
      cache = v;
      notify();
    }
  });
}

function persist(next: Accounts) {
  cache = next;
  try {
    const st = storage();
    if (!st) return;
    if (Object.keys(next).length) st.setItem(KEY, JSON.stringify(next));
    else st.removeItem(KEY);
  } catch {
    // Storage full or blocked: the numbers stay in memory for this page.
  }
}

export function getAccounts(): Accounts {
  return cache;
}

export function saveAccount<K extends SourceId>(k: K, v: Accounts[K] | undefined) {
  const next = { ...cache };
  if (v) next[k] = v;
  else delete next[k];
  persist(next);
  notify();
}

export function clearAccounts() {
  persist({});
  notify();
}

export function useAccounts(): Accounts {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => cache,
  );
}
