// Gmail, read on the teen's phone. Steady downloads full bodies only of the teen's own sent
// emails, with a field mask so nothing else comes with them. For threads it asks only for each
// message's Message-ID and In-Reply-To, to find the message a reply answered.
// Quoted and forwarded text is cut before scoring. An email whose own words can't be
// separated is skipped. Text is scored, checked for self-harm words if recent, and dropped.
// What is kept: weekly counts, and for flags an opaque key per email (no content).

import { CONFIG, DAY, HOUR, type Config } from "../engine/config";
import { checkSelfHarm } from "../engine/selfharm";
import { isLowMood, type ToneModel } from "../engine/tone";
import { isLateNight, localTime, median, pool, weeksBetween, type Getter, type TimeFns } from "./common";
import { textHash } from "../engine/hash";
import { flagKey } from "./agg";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailWeek {
  weekOf: string;
  /** False when the week was only partly read (window edge, or the cap on emails). */
  complete: boolean;
  emails_sent: number;
  median_reply_hours: number | null;
  share_after_midnight: number | null;
  /** Null when nothing was scored, or the tone model is not loaded. */
  low_mood_share: number | null;
}

export interface GmailFlag {
  at: number;
  level: "concern" | "plan";
  /** Opaque key: account, time and a hash of the own words. No content. */
  key: string;
  textHash: string;
}

export interface GmailResult {
  weeks: GmailWeek[];
  /** Self-harm flags from emails sent in the last 24 hours. */
  flags: GmailFlag[];
  read: number;
  /** True when there were more sent emails than the cap. Older weeks are then incomplete. */
  truncated: boolean;
  /** Emails whose own words could not be separated from quoted text, so they were not scored. */
  skipped: number;
}

// ---------------------------------------------------------------- API shapes (the parts used)

interface Header {
  name: string;
  value: string;
}
export interface MessagePart {
  mimeType?: string;
  headers?: Header[];
  body?: { size?: number; data?: string };
  parts?: MessagePart[];
}
export interface GmailMessage {
  id: string;
  threadId?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: MessagePart;
}
interface ListResponse {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
}
interface ThreadResponse {
  messages?: GmailMessage[];
}

/** Only what scoring needs from a sent email: no headers, no subject, no snippet. */
export const FULL_FIELDS =
  "id,labelIds,internalDate,payload(mimeType,body/data,parts(mimeType,body/data,parts(mimeType,body/data,parts(mimeType,body/data))))";
export const THREAD_FIELDS = "messages(id,labelIds,internalDate,payload/headers)";

// ---------------------------------------------------------------- pure helpers

export function decodeBase64Url(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "===".slice((b64.length + 3) % 4);
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

/** The first text/plain part, decoded. Attached emails (message/rfc822) are never opened.
 *  HTML-only emails return null and are not scored. */
export function plainTextOf(part: MessagePart | undefined): string | null {
  if (!part || part.mimeType === "message/rfc822") return null;
  if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64Url(part.body.data);
  for (const p of part.parts ?? []) {
    const t = plainTextOf(p);
    if (t != null) return t;
  }
  return null;
}

const FORWARD = [
  /^-{2,}\s*(forwarded message|mensaje reenviado|message transféré|weitergeleitete nachricht|messaggio inoltrato|mensagem encaminhada|doorgestuurd bericht)\s*-{2,}$/i,
  /^begin forwarded message:?$/i,
  /^-{2,}\s*(original message|mensaje original|message d'origine|ursprüngliche nachricht|messaggio originale|mensagem original|oorspronkelijk bericht)\s*-{2,}$/i,
  /^_{10,}$/,
];

/** "On ... wrote:" and its forms in other languages, on one line. */
const ATTRIBUTION = [
  /^on\b.+\bwrote:$/i,
  /^le\b.+\ba écrit\s?:$/i,
  /^el\b.+\bescribió:$/i,
  /^am\b.+\bschrieb\b.*:$/i,
  /^em\b.+\bescreveu:$/i,
  /^il\b.+\bha scritto:$/i,
  /^op\b.+\bschreef\b.*:$/i,
  /^\S.{0,80}\bwrote:$/i,
];

const HEADER_FROM = /^(from|de|von|da|van|от)\s*:/i;
const HEADER_OTHER = /^(sent|date|envoyé|gesendet|enviado|data|datum|to|à|an|para|a|subject|objet|betreff|asunto|oggetto|assunto|onderwerp)\s*:/i;
const TRAILING_ATTRIBUTION = /\b(wrote|a écrit|escribió|schrieb|escreveu|ha scritto|schreef)\s*:\s*$/i;

const isAttribution = (line: string) => ATTRIBUTION.some((r) => r.test(line));
/** The same, wrapped over two lines. Only the forms that start with a known word, so an
 *  ordinary line followed by "Alex wrote:" keeps the ordinary line. */
const isWrappedAttribution = (a: string, b: string) => !!a && !!b && ATTRIBUTION.slice(0, -1).some((r) => r.test(`${a} ${b}`));

/** The words the teen wrote in this email, with quoted and forwarded text cut. separable is
 *  false when what is left still looks like someone else's message; then the email is not
 *  scored at all. */
export function ownWords(text: string): { text: string; separable: boolean } {
  const lines = text.replace(/\r/g, "").split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const next = (lines[i + 1] ?? "").trim();
    if (FORWARD.some((r) => r.test(line))) break;
    if (isAttribution(line) || isWrappedAttribution(line, next)) break;
    if (HEADER_FROM.test(line) && lines.slice(i + 1, i + 5).some((l) => HEADER_OTHER.test(l.trim()))) break;
    if (line.startsWith(">")) continue;
    kept.push(lines[i]);
  }
  const own = kept.join("\n").trim();
  const leftover = own.split("\n").some((l) => HEADER_FROM.test(l.trim()) || TRAILING_ATTRIBUTION.test(l.trim()));
  return { text: own, separable: !leftover };
}

const isOwn = (m: GmailMessage) => (m.labelIds ?? []).includes("SENT");
const timeOf = (m: GmailMessage) => Number(m.internalDate ?? NaN);
const header = (m: GmailMessage, name: string) =>
  m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value.trim() ?? null;
const firstId = (v: string | null) => (v ? (/<[^>]+>/.exec(v)?.[0] ?? v.split(/\s+/)[0]) : null);

/** Hours from the message this one answered (by In-Reply-To) to this one. Null when it does
 *  not answer someone else's message in this thread, or the answered message can't be found. */
export function replyHoursFor(thread: ThreadResponse, sentId: string): number | null {
  const msgs = thread.messages ?? [];
  const sent = msgs.find((m) => m.id === sentId);
  const parentId = sent ? firstId(header(sent, "In-Reply-To")) : null;
  if (!sent || !parentId) return null;
  const parent = msgs.find((m) => firstId(header(m, "Message-ID")) === parentId);
  if (!parent || isOwn(parent)) return null;
  const h = (timeOf(sent) - timeOf(parent)) / HOUR;
  return Number.isFinite(h) && h >= 0 ? h : null;
}

interface SentItem {
  at: number;
  replyHours: number | null;
  lowMood: boolean | null;
}

/** Weekly numbers for every week from range.from to range.to, each marked complete or not. */
export function aggregateGmail(
  items: SentItem[],
  range: { from: number; to: number },
  time: TimeFns = localTime,
  cfg: Config = CONFIG,
): GmailWeek[] {
  return weeksBetween(range.from, range.to, time).map(({ weekOf, complete }) => {
    const xs = items.filter((it) => time.week(it.at) === weekOf);
    const scored = xs.filter((x) => x.lowMood != null);
    return {
      weekOf,
      complete,
      emails_sent: xs.length,
      median_reply_hours: median(xs.map((x) => x.replyHours).filter((h): h is number => h != null)),
      share_after_midnight: xs.length ? xs.filter((x) => isLateNight(time.hour(x.at), cfg)).length / xs.length : null,
      low_mood_share: scored.length ? scored.filter((x) => x.lowMood).length / scored.length : null,
    };
  });
}

/** An opaque key for one email in one account. Nothing in it can be read back. */
export async function emailKey(account: string, messageId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`steady-email-v1\u0000${account.toLowerCase()}\u0000${messageId}`);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(hash.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------- reading

type Scored = { at: number; lowMood: boolean | null; level: "none" | "concern" | "plan"; skipped: boolean; hash: string };

/** Download one sent email, score its own words and drop the text. Only numbers come back. */
async function scoreSent(get: Getter, id: string, now: number, tone: ToneModel | null, ic: Config["integrations"]): Promise<Scored | null> {
  const msg = (await get(`${BASE}/messages/${id}?format=full&fields=${encodeURIComponent(FULL_FIELDS)}`)) as GmailMessage;
  if (!isOwn(msg)) return null;
  const at = timeOf(msg);
  if (!Number.isFinite(at) || at > now || now - at > ic.windowDays * DAY) return null;
  const raw = plainTextOf(msg.payload);
  if (raw == null) return { at, lowMood: null, level: "none", skipped: false, hash: "" };
  const own = ownWords(raw);
  if (!own.separable) return { at, lowMood: null, level: "none", skipped: true, hash: "" };
  if (!own.text) return { at, lowMood: null, level: "none", skipped: false, hash: "" };
  const lowMood = tone ? isLowMood(tone, own.text) : null;
  const lv = now - at <= ic.selfHarmEmailHours * HOUR ? checkSelfHarm(own.text).level : "none";
  // Phrase list only for emails; see scoreOwnWords in agg.ts.
  return { at, lowMood, level: lv === "check" ? "none" : lv, skipped: false, hash: textHash(own.text) };
}

export async function readGmail(
  get: Getter,
  opts: { now: number; tone: ToneModel | null; time?: TimeFns; cfg?: Config; onProgress?: (done: number, total: number) => void },
): Promise<GmailResult> {
  const cfg = opts.cfg ?? CONFIG;
  const ic = cfg.integrations;
  const time = opts.time ?? localTime;
  const profile = (await get(`${BASE}/profile?fields=emailAddress`)) as { emailAddress?: string };
  const account = profile.emailAddress ?? "unknown";

  const q = encodeURIComponent(`in:sent newer_than:${ic.windowDays}d`);
  const ids: { id: string; threadId: string }[] = [];
  let pageToken: string | undefined;
  do {
    const url = `${BASE}/messages?q=${q}&maxResults=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const page = (await get(url)) as ListResponse;
    ids.push(...(page.messages ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length <= ic.maxSentEmails);
  const truncated = ids.length > ic.maxSentEmails || !!pageToken;
  const sent = ids.slice(0, ic.maxSentEmails);

  const threads = new Map<string, ThreadResponse>();
  await pool([...new Set(sent.map((m) => m.threadId))], ic.fetchConcurrency, async (tid) => {
    const url = `${BASE}/threads/${tid}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=In-Reply-To&fields=${encodeURIComponent(THREAD_FIELDS)}`;
    threads.set(tid, (await get(url)) as ThreadResponse);
  });

  let done = 0;
  let skipped = 0;
  const flags: GmailFlag[] = [];
  const items: SentItem[] = [];
  await pool(sent, ic.fetchConcurrency, async (m) => {
    const r = await scoreSent(get, m.id, opts.now, opts.tone, ic);
    opts.onProgress?.(++done, sent.length);
    if (!r) return;
    if (r.skipped) skipped++;
    if (r.level !== "none") flags.push({ at: r.at, level: r.level, key: await flagKey("gmail", account, r.at, r.hash), textHash: r.hash });
    const thread = threads.get(m.threadId);
    items.push({ at: r.at, replyHours: thread ? replyHoursFor(thread, m.id) : null, lowMood: r.lowMood });
  });

  const windowStart = opts.now - ic.windowDays * DAY;
  // With the cap reached, only the time after the oldest email read is fully covered.
  const from = truncated && items.length ? Math.max(windowStart, Math.min(...items.map((x) => x.at))) : windowStart;
  flags.sort((a, b) => a.at - b.at);
  return { weeks: aggregateGmail(items, { from, to: opts.now }, time, cfg), flags, read: items.length, truncated, skipped };
}
