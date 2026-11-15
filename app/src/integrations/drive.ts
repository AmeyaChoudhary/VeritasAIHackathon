// Google Drive Activity API v2 (drive.activity.readonly). Only the teen's own edits: actions
// whose actor is the current user. A field mask leaves out targets, so no file names come back.
// Weekly: days with edits, and the share of edits after midnight.

import { CONFIG, DAY, type Config } from "../engine/config";
import { isLateNight, localTime, weeksBetween, type Poster, type TimeFns } from "./common";
import type { AggWeek } from "./agg";

const URL_QUERY = "https://driveactivity.googleapis.com/v2/activity:query";
export const DRIVE_FIELDS = "activities(timestamp,timeRange/endTime,actors/user/knownUser/isCurrentUser,primaryActionDetail/edit),nextPageToken";

export interface DriveActivity {
  timestamp?: string;
  timeRange?: { endTime?: string };
  actors?: { user?: { knownUser?: { isCurrentUser?: boolean } } }[];
  primaryActionDetail?: { edit?: object };
}

/** Times of the teen's own edits. Other people's edits are skipped. */
export function ownEditTimes(acts: DriveActivity[]): number[] {
  const out: number[] = [];
  for (const a of acts) {
    if (!a.primaryActionDetail?.edit) continue;
    if (!(a.actors ?? []).some((x) => x.user?.knownUser?.isCurrentUser === true)) continue;
    const t = Date.parse(a.timestamp ?? a.timeRange?.endTime ?? "");
    if (Number.isFinite(t)) out.push(t);
  }
  return out;
}

export function driveWeeks(times: number[], range: { from: number; to: number }, time: TimeFns = localTime, cfg: Config = CONFIG): AggWeek[] {
  return weeksBetween(range.from, range.to, time).map(({ weekOf, complete }) => {
    const xs = times.filter((t) => time.week(t) === weekOf);
    const days = new Set(xs.map((t) => time.day(t)));
    const late = xs.filter((t) => isLateNight(time.hour(t), cfg)).length;
    return { weekOf, complete, contrib: { lateEvents: late, events: xs.length }, show: { daysWithEdits: days.size, edits: xs.length, late } };
  });
}

export async function readDriveActivity(post: Poster, opts: { now: number; time?: TimeFns; cfg?: Config }) {
  const cfg = opts.cfg ?? CONFIG;
  const from = opts.now - cfg.integrations.windowDays * DAY;
  const filter = `time >= "${new Date(from).toISOString()}" AND detail.action_detail_case:EDIT`;
  const acts: DriveActivity[] = [];
  let pageToken: string | undefined;
  let n = 0;
  do {
    const j = (await post(`${URL_QUERY}?fields=${encodeURIComponent(DRIVE_FIELDS)}`, { pageSize: 100, filter, ...(pageToken ? { pageToken } : {}) })) as {
      activities?: DriveActivity[];
      nextPageToken?: string;
    };
    acts.push(...(j.activities ?? []));
    pageToken = j.nextPageToken;
    n++;
  } while (pageToken && n < cfg.integrations.maxPages);
  const times = ownEditTimes(acts).filter((t) => t >= from && t <= opts.now);
  const truncated = !!pageToken;
  const covered = truncated && times.length ? Math.max(from, Math.min(...times)) : from;
  return { weeks: driveWeeks(times, { from: covered, to: opts.now }, opts.time ?? localTime, cfg), edits: times.length, truncated };
}
