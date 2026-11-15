// Data files the teen downloads from Instagram, TikTok, Snapchat, Discord and YouTube (Google
// Takeout), read on the phone. These apps give no way for another app to read a person's own
// activity with their permission, so the teen's own export is the only honest route; Stability
// never uses a password or a login session.
//
// For each export: work out whose account it is from the export's own profile file, keep only
// that person's sent messages and own activity times, and skip other people's messages unread.
// Own messages are scored on the phone and dropped. Only weekly numbers are kept.
// Instagram and TikTok searches are scored on the phone like YouTube searches and dropped; posts
// and videos viewed are counted by time only. No username, link or search word is kept.
// A zip is read in two passes: first the small profile files, then each data file as it is
// unpacked, parsed and dropped, so a large export never sits in memory whole.
// The JSON forms are read. HTML files are never unpacked; an HTML-only export, a layout not
// listed here, or a missing profile imports nothing.
//
// Layouts (checked against the apps' help pages and known exports, Nov 2026):
// Instagram: personal_information/personal_information(.../)personal_information.json, and
//   (your_instagram_activity/)messages/inbox/<thread>/message_N.json; likes in likes/liked_posts.json.
//   Searches: (logged_information/)recent_searches/*.json, lists named searches_user, searches_keyword
//   and the like, each item with string_map_data {Search: {value}, Time: {timestamp}} (older) or
//   string_list_data [{value, timestamp}] (newer). Views: ads_information/ads_and_topics/
//   posts_viewed.json, videos_watched.json and suggested_*_viewed.json, each item with an author
//   name and a time; only the time is read.
//   Instagram writes UTF-8 bytes as \u00XX escapes; the text is repaired before use.
// TikTok: user_data_tiktok.json (older: user_data.json), keys "Profile"/"Profile And Settings",
//   "Direct Message(s)" > "Direct Messages" > "ChatHistory", "Activity"/"Your Activity" >
//   "Video Browsing History" (newer: "Watch History") > "VideoList" {Date, Link},
//   "Search History" > "SearchList" {Date, SearchTerm}, "Like List".
// Snapchat: json/account.json ("Basic Information" > "Username") and json/chat_history.json, either
//   keyed by conversation with "IsSender", or the older "Sent/Received Saved Chat History" lists.
// Discord: account/user.json and messages/c<id>/messages.json (newer) or messages/<id>/messages.csv
//   (older); folder names may be capitalised. The package holds only the owner's own messages.
// YouTube (Takeout): .../history/watch-history.json and search-history.json, if JSON was chosen.
//   Entries are {title: "Watched <video>" | "Searched for <words>", time}. Ads are counted but
//   not scored.
// Chrome (Takeout): Chrome/History.json, {"Browser History": [{title, url, time_usec}]}. Search
//   words are taken from Google, Bing, DuckDuckGo and YouTube search addresses. Visits to the
//   major news sites in NEWS_SITES are counted per week, with how many were between midnight and
//   5 a.m.; the count is shown to the teen only and never reaches the rules.
// YouTube and Chrome titles and searches are scored on the phone (tone model and self-harm
// check) and dropped; only weekly counts are kept, and addresses are never kept.

import { CONFIG, type Config } from "../engine/config";
import type { ToneModel } from "../engine/tone";
import { localTime, type TimeFns } from "./common";
import { chatOwnWords, eventWeeks, exportRange, flagKey, scoreContent, scoreOwnWords, type AggWeek, type ItemFlag, type OwnEvent } from "./agg";
import { readEntries, streamEntries, type Entries } from "./zip";

export type ExportPlatform = "instagram" | "tiktok" | "snapchat" | "discord" | "youtube" | "chrome";

export interface ExportResult {
  platform: ExportPlatform;
  layout: string;
  weeks: AggWeek[];
  ownMessages: number;
  /** Other people's messages, skipped without reading their words. */
  othersSkipped: number;
  /** Conversations whose owner could not be told apart (Instagram), skipped whole. */
  unreadable: number;
  activity: number;
  flags: ItemFlag[];
  /** Files in the export that were too big to read, or over the total cap. */
  tooBig: string[];
  truncated: boolean;
  notes: string[];
}

export class ExportError extends Error {}

interface Opts {
  now: number;
  tone: ToneModel | null;
  time?: TimeFns;
  cfg?: Config;
}

const json = (text: string | undefined): unknown => {
  if (text == null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/** Instagram's exports write UTF-8 bytes as one character each. Put them back together. */
export function repairText(s: string): string {
  if (!/[\u0080-ÿ]/.test(s) || /[^\u0000-ÿ]/.test(s)) return s;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(s, (c) => c.charCodeAt(0)));
  } catch {
    return s;
  }
}

/** "2024-01-02 15:04:05", "2024-01-02 15:04:05 UTC" and "2024-01-02 15:04:05.123456+00:00" as ms (UTC). */
export function exportTime(v: unknown): number {
  if (typeof v === "number") return v > 1e12 ? v : v * 1000;
  if (typeof v !== "string") return NaN;
  let s = v.trim().replace(" UTC", "Z").replace(" ", "T");
  s = s.replace(/(\.\d{3})\d+/, "$1");
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s += "Z";
  return Date.parse(s);
}

/** The older Discord package's messages.csv: ID,Timestamp,Contents,Attachments, with quoted fields. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ""));
}

// ---------------------------------------------------------------- collectors

interface Collector {
  /** Small files read first: who the account belongs to. */
  identityWanted(path: string): boolean;
  /** Files parsed one at a time, as they are unpacked. Never HTML. */
  dataWanted(path: string): boolean;
  identify(files: Map<string, string>, names: string[]): void;
  consume(path: string, text: string): Promise<void>;
  finish(names: string[], tooBig: string[]): ExportResult;
}

const IG_PROFILE = /personal_information\.json$/i;
const IG_THREAD = /messages\/inbox\/[^/]+\/message_\d+\.json$/i;
const IG_LIKES = /likes\/liked_posts\.json$/i;
const IG_SEARCHES = /(^|\/)recent_searches\/[^/]+\.json$/i;
const IG_VIEWS = /(^|\/)ads_and_topics\/(posts_viewed|videos_watched|suggested_(accounts|profiles)_viewed)\.json$/i;
const TT_DATA = /(^|\/)user_data(_tiktok)?\.json$/i;
const SC_ACCOUNT = /(^|\/)json\/account\.json$/i;
const SC_CHATS = /(^|\/)json\/chat_history\.json$/i;
const DC_USER = /(^|\/)account\/user\.json$/i;
const DC_MSGS = /(^|\/)messages\/c?\d+\/messages\.(json|csv)$/i;
const YT_HISTORY = /(^|\/)(watch|search)-history\.json$/i;
const CHROME_HISTORY = /(^|\/)History\.json$/;

const TITLE: Record<ExportPlatform, string> = {
  instagram: "an Instagram export",
  tiktok: "a TikTok export",
  snapchat: "a Snapchat export",
  discord: "a Discord data package",
  youtube: "a YouTube Takeout",
  chrome: "a Chrome history Takeout",
};

/** Major news sites, by domain. A visit counts when the address is the domain or one of its
 *  subdomains (edition.cnn.com, www.bbc.co.uk). "msn.com/news" counts only MSN's news pages,
 *  which can have a locale first (/en-us/news/...). */
export const NEWS_SITES = [
  "cnn.com",
  "nytimes.com",
  "foxnews.com",
  "washingtonpost.com",
  "bbc.com",
  "bbc.co.uk",
  "apnews.com",
  "reuters.com",
  "nbcnews.com",
  "cbsnews.com",
  "abcnews.go.com",
  "usatoday.com",
  "theguardian.com",
  "npr.org",
  "wsj.com",
  "news.google.com",
  "news.yahoo.com",
  "bloomberg.com",
  "politico.com",
  "axios.com",
  "msn.com/news",
] as const;

/** Whether an address is a page on one of NEWS_SITES. */
export function isNewsVisit(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  const segs = u.pathname.toLowerCase().split("/").filter(Boolean);
  return NEWS_SITES.some((site) => {
    const [domain, path] = site.split("/");
    if (host !== domain && !host.endsWith(`.${domain}`)) return false;
    // The path is the first segment, or the second after a locale such as "en-us".
    return !path || segs[0] === path || (/^[a-z]{2}(-[a-z]{2,4})?$/.test(segs[0] ?? "") && segs[1] === path);
  });
}

/** The words of a search, from a search page's address. Google, Bing, DuckDuckGo, YouTube. */
export function searchWords(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const q = (k: string) => {
    const v = u.searchParams.get(k);
    return v && v.trim() ? v.trim() : null;
  };
  if (/^google\.[a-z.]+$/.test(host) && u.pathname === "/search") return q("q");
  if (host === "bing.com" && u.pathname === "/search") return q("q");
  if (host === "duckduckgo.com" || host === "html.duckduckgo.com") return q("q");
  if ((host === "youtube.com" || host === "m.youtube.com") && u.pathname === "/results") return q("search_query");
  return null;
}

/** One item of an Instagram list: its time, and its text if it has one. Both layouts. The keys of
 *  string_map_data are translated in non-English exports, so they are not relied on. */
function igItem(item: unknown): { at: number; text?: string } {
  const o = obj(item);
  let at = NaN;
  let text: string | undefined;
  for (const v of Object.values(obj(o.string_map_data))) {
    const e = obj(v);
    const ts = Number(e.timestamp);
    if (Number.isFinite(ts) && ts > 0 && !Number.isFinite(at)) at = exportTime(ts);
    else if (!text && str(e.value)) text = str(e.value);
  }
  for (const v of arr(o.string_list_data)) {
    const e = obj(v);
    const ts = Number(e.timestamp);
    if (Number.isFinite(ts) && ts > 0 && !Number.isFinite(at)) at = exportTime(ts);
    if (!text && str(e.value)) text = str(e.value);
  }
  if (!Number.isFinite(at) && Number(o.timestamp) > 0) at = exportTime(Number(o.timestamp));
  return { at, text: text ? repairText(text) : undefined };
}

function makeCollector(platform: ExportPlatform, opts: Opts): Collector {
  const cfg = opts.cfg ?? CONFIG;
  const events: OwnEvent[] = [];
  const flags: ItemFlag[] = [];
  let others = 0;
  let unreadable = 0;
  let owner = "";
  let names: string[] = [];
  let layout = "";
  let sawData = false;

  /** Score one own message and drop the words. */
  const ownMessage = async (text: string | undefined, at: number): Promise<void> => {
    let lowMood: boolean | null = null;
    if (text) {
      const words = chatOwnWords(text);
      if (words) {
        const r = scoreOwnWords(words, at, { now: opts.now, tone: opts.tone, cfg });
        lowMood = r.lowMood;
        if (r.level !== "none") flags.push({ at, level: r.level, key: await flagKey(platform, owner, at, r.hash), textHash: r.hash });
      }
    }
    events.push({ at, message: true, lowMood });
  };

  /** Score a title or a search on the phone, keep yes/no marks, and drop the words. */
  const content = async (text: string | undefined, at: number, search: boolean, news = false): Promise<void> => {
    if (!text) {
      events.push(news ? { at, news } : { at });
      return;
    }
    const r = scoreContent(text, at, { now: opts.now, tone: opts.tone, cfg, search });
    if (r.level !== "none") flags.push({ at, level: r.level, key: await flagKey(platform, owner, at, r.hash), textHash: r.hash });
    events.push({ at, content: true, search, harm: r.harm, lowContent: r.lowContent, ...(news ? { news } : {}) });
  };

  const finish = (allNames: string[], tooBig: string[]): ExportResult => {
    if (!sawData) {
      if (allNames.some((n) => /\.html?$/i.test(n))) throw new ExportError("This is an HTML export. Request it again and choose JSON. Nothing was imported.");
      throw new ExportError(`This doesn't look like ${TITLE[platform]} Stability knows. Nothing was imported.`);
    }
    const range = exportRange(events, opts.now, cfg);
    if (!range)
      throw new ExportError(
        unreadable
          ? `Stability couldn't tell which messages were yours in ${unreadable} conversation${unreadable === 1 ? "" : "s"}, and found nothing else of yours. Nothing was imported.`
          : "This export has no activity of yours in it.",
      );
    const inRange = events.filter((e) => e.at >= range.from && e.at <= range.to);
    const truncated = tooBig.length > 0;
    const browsing = platform === "youtube" || platform === "chrome";
    // Instagram and TikTok carry messages, searches and views.
    const social = platform === "instagram" || platform === "tiktok";
    let weeks: AggWeek[] = eventWeeks(inRange, range, opts.time ?? localTime, cfg, {
      messages: !browsing,
      activity: true,
      content: browsing || social,
      views: social,
      news: platform === "chrome",
    });
    if (truncated) weeks = weeks.map((w) => ({ ...w, complete: false }));
    const notes: string[] = [];
    if (truncated) notes.push(`${tooBig.length} file${tooBig.length === 1 ? " was" : "s were"} too big to read, so these weeks are partial and do not reach the rules.`);
    if (unreadable) notes.push(`${unreadable} conversation${unreadable === 1 ? " was" : "s were"} skipped: Stability couldn't tell which messages were yours.`);
    flags.sort((a, b) => a.at - b.at);
    return {
      platform,
      layout,
      weeks,
      ownMessages: inRange.filter((e) => e.message).length,
      othersSkipped: others,
      unreadable,
      activity: inRange.length,
      flags,
      tooBig,
      truncated,
      notes,
    };
  };

  switch (platform) {
    case "instagram":
      return {
        finish,
        identityWanted: (p) => IG_PROFILE.test(p),
        dataWanted: (p) => IG_THREAD.test(p) || IG_LIKES.test(p) || IG_SEARCHES.test(p) || IG_VIEWS.test(p),
        identify(files) {
          const text = [...files.entries()].find(([p]) => IG_PROFILE.test(p))?.[1];
          const map = obj(obj(arr(obj(json(text)).profile_user)[0]).string_map_data);
          names = [str(obj(map.Name).value), str(obj(map.Username).value)].filter((n): n is string => !!n).map(repairText);
          if (!names.length) throw new ExportError("This export has no profile file, so Stability can't tell which messages are yours. Nothing was imported.");
          owner = names[0];
          layout = "Instagram JSON";
        },
        async consume(path, text) {
          sawData = true;
          const data = obj(json(text));
          if (IG_SEARCHES.test(path)) {
            // Account, keyword and tag searches: scored like a YouTube search, then dropped.
            for (const list of Object.values(data))
              for (const item of arr(list)) {
                const s = igItem(item);
                if (Number.isFinite(s.at)) await content(s.text, s.at, true);
              }
            return;
          }
          if (IG_VIEWS.test(path)) {
            // Posts and videos shown: the time only. The author's name is never read.
            for (const list of Object.values(data))
              for (const item of arr(list)) {
                const at = igItem(item).at;
                if (Number.isFinite(at)) events.push({ at, view: true });
              }
            return;
          }
          if (IG_LIKES.test(path)) {
            for (const l of arr(data.likes_media_likes))
              for (const d of arr(obj(l).string_list_data)) {
                const at = exportTime(obj(d).timestamp);
                if (Number.isFinite(at)) events.push({ at });
              }
            return;
          }
          // The owner must be exactly one participant of this conversation, by display name.
          const people = arr(data.participants).map((p) => repairText(str(obj(p).name) ?? ""));
          const mine = names.find((n) => people.includes(n));
          if (!mine || people.filter((p) => p === mine).length !== 1) {
            unreadable++;
            return;
          }
          for (const m of arr(data.messages)) {
            const msg = obj(m);
            const at = Number(msg.timestamp_ms);
            if (!Number.isFinite(at)) continue;
            if (repairText(str(msg.sender_name) ?? "") !== mine) {
              others++; // someone else's message: not read
              continue;
            }
            const content = str(msg.content);
            await ownMessage(content ? repairText(content) : undefined, at);
          }
        },
      };
    case "tiktok":
      return {
        finish,
        identityWanted: (p) => TT_DATA.test(p),
        dataWanted: (p) => TT_DATA.test(p),
        identify(files) {
          const data = obj(json([...files.entries()].find(([p]) => TT_DATA.test(p))?.[1]));
          if (!Object.keys(data).length) throw new ExportError("This doesn't look like a TikTok JSON export. Choose JSON when you request your data. Nothing was imported.");
          const prof = obj(data.Profile ?? data["Profile And Settings"] ?? data["Your Profile"]);
          const pmap = obj(obj(prof["Profile Information"] ?? prof["Profile Info"]).ProfileMap);
          owner = str(pmap.userName) ?? str(pmap.username) ?? "";
          const dm = obj(data["Direct Message"] ?? data["Direct Messages"]);
          const act = obj(data.Activity ?? data["Your Activity"]);
          if (!Object.keys(dm).length && !Object.keys(act).length) throw new ExportError("This TikTok export has a layout Stability doesn't know. Nothing was imported.");
          if (!owner) throw new ExportError("This export has no profile, so Stability can't tell which messages are yours. Nothing was imported.");
          layout = "TikTok JSON";
        },
        async consume(_path, text) {
          sawData = true;
          const data = obj(json(text));
          const dm = obj(data["Direct Message"] ?? data["Direct Messages"]);
          const history = obj(obj(dm["Direct Messages"]).ChatHistory ?? dm.ChatHistory);
          for (const list of Object.values(history)) {
            for (const m of arr(list)) {
              const msg = obj(m);
              const at = exportTime(msg.Date);
              if (!Number.isFinite(at)) continue;
              if (str(msg.From) !== owner) {
                others++;
                continue;
              }
              await ownMessage(str(msg.Content), at);
            }
          }
          const act = obj(data.Activity ?? data["Your Activity"]);
          // Videos watched: the time only. The link is never read.
          for (const item of arr(obj(act["Video Browsing History"] ?? act["Watch History"]).VideoList)) {
            const at = exportTime(obj(item).Date ?? obj(item).date);
            if (Number.isFinite(at)) events.push({ at, view: true });
          }
          // Searches: scored like a YouTube search, then dropped.
          for (const item of arr(obj(act["Search History"]).SearchList)) {
            const o = obj(item);
            const at = exportTime(o.Date ?? o.date);
            if (Number.isFinite(at)) await content(str(o.SearchTerm) ?? str(o.searchTerm), at, true);
          }
          for (const item of arr(obj(act["Like List"]).ItemFavoriteList)) {
            const at = exportTime(obj(item).Date ?? obj(item).date);
            if (Number.isFinite(at)) events.push({ at });
          }
        },
      };
    case "snapchat":
      return {
        finish,
        identityWanted: (p) => SC_ACCOUNT.test(p),
        dataWanted: (p) => SC_CHATS.test(p),
        identify(files, allNames) {
          const account = obj(json([...files.entries()].find(([p]) => SC_ACCOUNT.test(p))?.[1]));
          owner = str(obj(account["Basic Information"]).Username) ?? "";
          if (!owner) {
            if (!allNames.some((n) => SC_CHATS.test(n)) && allNames.some((n) => /\.html?$/i.test(n)))
              throw new ExportError("This is an HTML export. Request your data again with JSON files included. Nothing was imported.");
            if (!allNames.some((n) => SC_CHATS.test(n))) throw new ExportError("This doesn't look like a Snapchat export Stability knows. Nothing was imported.");
            throw new ExportError("This export has no account file, so Stability can't tell which messages are yours. Nothing was imported.");
          }
        },
        async consume(_path, text) {
          sawData = true;
          const c = obj(json(text));
          const older = Array.isArray(c["Sent Saved Chat History"]) || Array.isArray(c["Received Saved Chat History"]);
          layout = older ? "Snapchat JSON (older)" : "Snapchat JSON";
          if (older) {
            others += arr(c["Received Saved Chat History"]).length;
            for (const m of arr(c["Sent Saved Chat History"])) {
              const msg = obj(m);
              const at = exportTime(msg.Created);
              if (Number.isFinite(at)) await ownMessage(str(msg.Text), at);
            }
            return;
          }
          for (const list of Object.values(c)) {
            for (const m of arr(list)) {
              const msg = obj(m);
              const at = exportTime(msg.Created);
              if (!Number.isFinite(at)) continue;
              const mine = msg.IsSender === true || (msg.IsSender === undefined && str(msg.From) === owner);
              if (!mine) {
                others++;
                continue;
              }
              const text = str(msg["Media Type"]) === "TEXT" || msg["Media Type"] === undefined ? str(msg.Content) : undefined;
              await ownMessage(text, at);
            }
          }
        },
      };
    case "discord":
      return {
        finish,
        identityWanted: (p) => DC_USER.test(p),
        dataWanted: (p) => DC_MSGS.test(p),
        identify(files, allNames) {
          const user = obj(json([...files.entries()].find(([p]) => DC_USER.test(p))?.[1]));
          owner = str(user.id) ?? str(user.username) ?? "";
          if (!owner) {
            if (!allNames.some((n) => DC_MSGS.test(n))) throw new ExportError("This doesn't look like a Discord data package Stability knows. Nothing was imported.");
            throw new ExportError("This package has no account file, so Stability can't tell whose it is. Nothing was imported.");
          }
          layout = "Discord package";
        },
        async consume(path, text) {
          sawData = true;
          const rows: { ts: unknown; contents?: string }[] = [];
          if (/\.json$/i.test(path)) {
            for (const m of arr(json(text))) {
              const o = obj(m);
              rows.push({ ts: o.Timestamp ?? o.timestamp, contents: str(o.Contents ?? o.contents) });
            }
          } else {
            const [head, ...body] = parseCsv(text);
            const iTs = (head ?? []).indexOf("Timestamp");
            const iC = (head ?? []).indexOf("Contents");
            if (iTs < 0) return;
            for (const r of body) rows.push({ ts: r[iTs], contents: r[iC] });
          }
          for (const r of rows) {
            const at = exportTime(r.ts);
            // Every message in the package is the owner's. Lines quoted from someone else are cut.
            if (Number.isFinite(at)) await ownMessage(r.contents, at);
          }
        },
      };
    case "youtube":
      return {
        finish,
        identityWanted: () => false,
        dataWanted: (p) => YT_HISTORY.test(p),
        // Takeout is one Google account's own history, so every entry is the owner's activity.
        identify() {
          owner = "takeout";
          layout = "Google Takeout JSON";
        },
        async consume(_path, text) {
          sawData = true;
          for (const item of arr(json(text))) {
            const o = obj(item);
            const at = exportTime(o.time);
            if (!Number.isFinite(at)) continue;
            const title = str(o.title) ?? "";
            const ad = arr(o.details).some((d) => /google ads/i.test(str(obj(d).name) ?? ""));
            const searched = /^Searched for /.exec(title);
            const watched = /^Watched /.exec(title);
            // A removed video's title is its address: count it, score nothing.
            const words = ad ? "" : searched ? title.slice(searched[0].length) : watched ? title.slice(watched[0].length) : "";
            await content(/^https?:\/\//i.test(words) ? "" : words, at, Boolean(searched));
          }
        },
      };
    case "chrome":
      return {
        finish,
        identityWanted: () => false,
        dataWanted: (p) => CHROME_HISTORY.test(p),
        // Takeout is one Google account's own history.
        identify() {
          owner = "takeout";
          layout = "Google Takeout Chrome history";
        },
        async consume(_path, text) {
          const list = arr(obj(json(text))["Browser History"]);
          if (!list.length) return;
          sawData = true;
          for (const item of list) {
            const o = obj(item);
            const us = typeof o.time_usec === "number" ? o.time_usec : Number(o.time_usec);
            if (!Number.isFinite(us)) continue;
            const at = Math.round(us / 1000);
            // A search page is scored once, by its search words; any other page by its title.
            // A news site visit is marked yes or no; the address is dropped.
            const url = str(o.url) ?? "";
            const words = searchWords(url);
            await content(words ?? str(o.title) ?? "", at, words != null, isNewsVisit(url));
          }
        },
      };
  }
}

/** Run a collector over files already unpacked (tests, sample data). */
async function parseEntries(platform: ExportPlatform, e: Entries, opts: Opts): Promise<ExportResult> {
  const c = makeCollector(platform, opts);
  const identity = new Map([...e.files.entries()].filter(([p]) => c.identityWanted(p)));
  c.identify(identity, e.names);
  for (const [p, text] of e.files) if (c.dataWanted(p)) await c.consume(p, text);
  return c.finish(e.names, e.tooBig);
}

/** Read an export file the teen chose: profile files first, then each data file as it is
 *  unpacked, parsed and dropped. HTML files are never unpacked. */
export async function importExport(blob: Blob, name: string, platform: ExportPlatform, opts: Opts): Promise<ExportResult> {
  const cfg = opts.cfg ?? CONFIG;
  const caps = { maxBytes: cfg.integrations.maxEntryBytes, maxTotal: cfg.integrations.maxTotalBytes };
  const c = makeCollector(platform, opts);
  const first = await readEntries(blob, name, (p) => c.identityWanted(p), caps.maxBytes);
  c.identify(first.files, first.names);
  const second = await streamEntries(blob, name, (p) => c.dataWanted(p), (p, text) => c.consume(p, text), caps);
  return c.finish(second.names, [...first.tooBig, ...second.tooBig]);
}

/** Which files a platform's import unpacks. Never HTML. */
export function wanted(platform: ExportPlatform): (path: string) => boolean {
  const c = makeCollector(platform, { now: 0, tone: null });
  return (p) => c.identityWanted(p) || c.dataWanted(p);
}

export const PARSERS: Record<ExportPlatform, (e: Entries, o: Opts) => Promise<ExportResult>> = {
  instagram: (e, o) => parseEntries("instagram", e, o),
  tiktok: (e, o) => parseEntries("tiktok", e, o),
  snapchat: (e, o) => parseEntries("snapchat", e, o),
  discord: (e, o) => parseEntries("discord", e, o),
  youtube: (e, o) => parseEntries("youtube", e, o),
  chrome: (e, o) => parseEntries("chrome", e, o),
};
