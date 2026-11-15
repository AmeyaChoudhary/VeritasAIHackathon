// Sample data: the bundled fixtures (shaped like real Gmail, Calendar and Last.fm responses)
// run through the same readers the real accounts use, with no network.

import type { ToneModel } from "../engine/tone";
import gmailFx from "./fixtures/gmail.json";
import calendarFx from "./fixtures/calendar.json";
import lastfmFx from "./fixtures/lastfm.json";
import screenFx from "./fixtures/screen_time_android.json";
import { readGmail } from "./gmail";
import { readCalendar } from "./calendar";
import { readLastfm } from "./lastfm";
import { parseScreenTime } from "./screentime";
import { localTime, type Getter, type TimeFns } from "./common";
import classroomFx from "./fixtures/classroom.json";
import driveFx from "./fixtures/drive.json";
import microsoftFx from "./fixtures/microsoft.json";
import fitbitFx from "./fixtures/fitbit.json";
import canvasFx from "./fixtures/canvas.json";
import schoologyFx from "./fixtures/schoology.json";
import instagramFx from "./fixtures/instagram.json";
import tiktokFx from "./fixtures/tiktok.json";
import snapchatFx from "./fixtures/snapchat.json";
import discordFx from "./fixtures/discord.json";
import youtubeFx from "./fixtures/youtube.json";
import phoneV2Fx from "./fixtures/phone_data_android_v2.json";
import { readClassroom } from "./classroom";
import { readDriveActivity } from "./drive";
import { readOutlook } from "./microsoft";
import { readFitbit } from "./fitbit";
import { readCanvas, readSchoology, type PagedGetter } from "./school";
import { PARSERS, type ExportPlatform } from "./exports";
import type { Entries } from "./zip";
import type { Poster } from "./common";

type GmailFixture = {
  referenceTime: string;
  profile: unknown;
  list: unknown[];
  threads: Record<string, unknown>;
  messages: Record<string, unknown>;
};

/** Answers Gmail API URLs from the fixture. */
export function gmailFixtureGetter(fx: GmailFixture = gmailFx as GmailFixture): Getter {
  return async (url) => {
    const u = new URL(url);
    const path = u.pathname;
    if (path.endsWith("/profile")) return fx.profile;
    if (path.endsWith("/messages")) return fx.list[u.searchParams.get("pageToken") === "p2" ? 1 : 0];
    let m = /\/threads\/([^/]+)$/.exec(path);
    if (m) return fx.threads[m[1]];
    m = /\/messages\/([^/]+)$/.exec(path);
    if (m) return fx.messages[m[1]];
    throw new Error(`No fixture for ${url}`);
  };
}

export function calendarFixtureGetter(): Getter {
  return async () => (calendarFx as { pages: unknown[] }).pages[0];
}

export function lastfmFixtureGetter(fx: { pages: unknown[] } = lastfmFx as { pages: unknown[] }): Getter {
  return async (url) => {
    const page = Number(new URL(url).searchParams.get("page") ?? 1);
    return fx.pages[page - 1];
  };
}

export const SAMPLE_NOW = Date.parse((gmailFx as GmailFixture).referenceTime);

export async function sampleGmail(tone: ToneModel | null, time: TimeFns = localTime) {
  const r = await readGmail(gmailFixtureGetter(), { now: SAMPLE_NOW, tone, time });
  // Sample flags are not passed to the rules: they belong to a made-up inbox.
  return { weeks: r.weeks, read: r.read, truncated: r.truncated, skipped: r.skipped };
}

export function sampleCalendar(time: TimeFns = localTime) {
  return readCalendar(calendarFixtureGetter(), { now: SAMPLE_NOW, time });
}

export function sampleLastfm(time: TimeFns = localTime) {
  return readLastfm(lastfmFixtureGetter(), { user: "maya_fixture", apiKey: "sample", now: SAMPLE_NOW, time });
}

export function sampleScreenTime() {
  return parseScreenTime(JSON.stringify(screenFx));
}

// ---------------------------------------------------------------- newer sources


type Rec = Record<string, unknown>;

export function classroomFixtureGetter(): Getter {
  const fx = classroomFx as unknown as Rec & { courseWork: Rec; submissions: Rec; courses: unknown };
  return async (url) => {
    const u = new URL(url);
    const m = /\/courses\/([^/]+)\/courseWork(\/-\/studentSubmissions)?$/.exec(u.pathname);
    if (!m) return fx.courses;
    if (m[2]) return fx.submissions[m[1]];
    return fx.courseWork[u.searchParams.get("pageToken") ? `${m[1]}-${u.searchParams.get("pageToken")}` : m[1]];
  };
}

export function drivePoster(): Poster {
  const pages = (driveFx as unknown as { pages: unknown[] }).pages;
  return async (_url, body) => pages[(body as { pageToken?: string }).pageToken === "p2" ? 1 : 0];
}

export function microsoftFixtureGetter(): Getter {
  const fx = microsoftFx as unknown as { me: unknown; sent: unknown[]; parents: Rec; calendar: unknown; conversations: Rec };
  return async (url) => {
    const u = new URL(url);
    if (u.pathname.endsWith("/me")) return fx.me;
    if (u.pathname.includes("/mailFolders/sentitems/messages")) return fx.sent[u.searchParams.get("$skiptoken") ? 1 : 0];
    if (u.pathname.endsWith("/calendarView")) return fx.calendar;
    if (u.pathname.endsWith("/me/messages")) {
      const f = u.searchParams.get("$filter") ?? "";
      const conv = /conversationId eq '([^']+)'/.exec(f)?.[1];
      if (conv) return fx.conversations[conv] ?? { value: [] };
      const id = /internetMessageId eq '([^']+)'/.exec(f)?.[1] ?? "";
      return fx.parents[id] ?? { value: [] };
    }
    throw new Error(`No fixture for ${url}`);
  };
}

export function fitbitFixtureGetter(): Getter {
  const fx = fitbitFx as unknown as { sleep: unknown; steps: unknown };
  return async (url) => (url.includes("/sleep/") ? fx.sleep : fx.steps);
}

/** Canvas pages with Link headers; the fixture's second page comes from the first one's next. */
export function canvasFixtureGetter(): PagedGetter {
  const fx = canvasFx as unknown as { courses: unknown; submissions: Rec };
  return async (url) => {
    const m = /\/courses\/(\d+)\/students\/submissions/.exec(url);
    if (!m) return { body: fx.courses, next: null };
    if (url.includes("page=2")) return { body: fx.submissions[`${m[1]}-p2`] ?? [], next: null };
    return { body: fx.submissions[m[1]], next: fx.submissions[`${m[1]}-p2`] ? `${url}&page=2` : null };
  };
}

export function schoologyFixtureGetter(): Getter {
  const fx = schoologyFx as unknown as { me: unknown; grades: unknown; assignments: Rec };
  return async (url) => {
    if (url.endsWith("/users/me")) return fx.me;
    if (/\/grades$/.test(url)) return fx.grades;
    const m = /\/sections\/([^/]+)\/assignments\?start=(\d+)/.exec(url);
    if (!m) return {};
    return m[2] === "0" ? fx.assignments[m[1]] : fx.assignments[`${m[1]}-p2`];
  };
}

/** Turn a fixture's entries (path -> JSON or text) into what the zip reader gives. */
export function fixtureEntries(entries: Record<string, unknown>, extraNames: string[] = []): Entries {
  const files = new Map<string, string>();
  for (const [p, v] of Object.entries(entries)) files.set(p, typeof v === "string" ? v : JSON.stringify(v));
  return { files, names: [...files.keys(), ...extraNames], tooBig: [] };
}

const EXPORT_FX: Record<ExportPlatform, { entries: Record<string, unknown> }> = {
  instagram: instagramFx as { entries: Record<string, unknown> },
  tiktok: tiktokFx as { entries: Record<string, unknown> },
  snapchat: snapchatFx as unknown as { entries: Record<string, unknown> },
  discord: discordFx as unknown as { entries: Record<string, unknown> },
  youtube: youtubeFx as unknown as { entries: Record<string, unknown> },
};

export async function sampleSource(source: string, tone: ToneModel | null, time: TimeFns = localTime) {
  const now = SAMPLE_NOW;
  switch (source) {
    case "classroom":
      return readClassroom(classroomFixtureGetter(), { now, time });
    case "drive":
      return readDriveActivity(drivePoster(), { now, time });
    case "microsoft": {
      const r = await readOutlook(microsoftFixtureGetter(), { now, tone, time });
      // Sample flags never reach the rules: they belong to a made-up mailbox.
      return { ...r, flags: [] };
    }
    case "fitbit":
      return readFitbit(fitbitFixtureGetter(), { now, time });
    case "canvas":
      return readCanvas(canvasFixtureGetter(), { base: "https://school.example", now, time });
    case "schoology":
      return readSchoology(schoologyFixtureGetter(), { now, time });
    case "instagram":
    case "tiktok":
    case "snapchat":
    case "discord":
    case "youtube": {
      const r = await PARSERS[source](fixtureEntries(EXPORT_FX[source].entries), { now, tone, time });
      return { ...r, flags: [] };
    }
  }
  throw new Error(`No sample for ${source}`);
}

export function samplePhoneV2() {
  return parseScreenTime(JSON.stringify(phoneV2Fx));
}
