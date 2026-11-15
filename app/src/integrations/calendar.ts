// Google Calendar, read on the teen's phone. Titles are matched against a short local list of
// exam words and then dropped. What is kept: which weeks have an exam or test.
// Context only: it never triggers a question or a note.

import { CONFIG, DAY, type Config } from "../engine/config";
import { localTime, mondayOfYmd, type Getter, type TimeFns } from "./common";

const BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

/** Exam words, case-insensitive, as whole words so "contest" and "latest" do not match. */
const EXAM_WORDS = /\b(exams?|tests?|quiz(?:zes)?|finals?|midterms?)\b/i;
/** Test names, in capitals only, so "act" inside a sentence does not match. */
const EXAM_CODES = /\b(AP|SAT|ACT)\b/;

export function isExam(title: string | undefined): boolean {
  if (!title) return false;
  return EXAM_WORDS.test(title) || EXAM_CODES.test(title);
}

interface EventItem {
  summary?: string;
  start?: { date?: string; dateTime?: string };
}
interface EventsResponse {
  items?: EventItem[];
  nextPageToken?: string;
}

export interface CalendarWeek {
  weekOf: string;
  exam: boolean;
}

function weekOfStart(start: EventItem["start"], time: TimeFns): string | null {
  if (start?.date) return mondayOfYmd(start.date);
  if (start?.dateTime) {
    const ms = Date.parse(start.dateTime);
    return Number.isFinite(ms) ? time.week(ms) : null;
  }
  return null;
}

/** Weeks with at least one exam or test. Titles are not returned. */
export function examWeeks(items: EventItem[], time: TimeFns = localTime): CalendarWeek[] {
  const weeks = new Set<string>();
  for (const it of items) {
    if (!isExam(it.summary)) continue;
    const w = weekOfStart(it.start, time);
    if (w) weeks.add(w);
  }
  return [...weeks].sort().map((weekOf) => ({ weekOf, exam: true }));
}

export async function readCalendar(
  get: Getter,
  opts: { now: number; time?: TimeFns; cfg?: Config },
): Promise<{ weeks: CalendarWeek[]; events: number }> {
  const cfg = opts.cfg ?? CONFIG;
  const span = cfg.integrations.calendarDays * DAY;
  const min = new Date(opts.now - span).toISOString();
  const max = new Date(opts.now + span).toISOString();
  const fields = encodeURIComponent("items(summary,start),nextPageToken");
  const items: EventItem[] = [];
  let pageToken: string | undefined;
  let pages = 0;
  do {
    const url = `${BASE}?timeMin=${encodeURIComponent(min)}&timeMax=${encodeURIComponent(max)}&singleEvents=true&orderBy=startTime&maxResults=250&fields=${fields}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const page = (await get(url)) as EventsResponse;
    items.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
    pages++;
  } while (pageToken && pages < 10);
  return { weeks: examWeeks(items, opts.time ?? localTime), events: items.length };
}
