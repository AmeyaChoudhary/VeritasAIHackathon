// Microsoft 365, through Microsoft Graph with MSAL.js (PKCE, in a popup). Tokens stay in MSAL's
// memory cache. Mail: Sent Items only, with $select so only what scoring needs downloads, and
// the text body Graph makes for us. The same quote and forward cutting as Gmail runs on it.
// For a reply, the answered message is found by Message-ID and only its time and sender address
// are read, never its text. Calendar: exam weeks only; subjects are matched and dropped.

import { CONFIG, DAY, HOUR, type Config } from "../engine/config";
import { isExam } from "./calendar";
import { ownWords } from "./gmail";
import { isLateNight, localTime, median, pool, weeksBetween, type Getter, type TimeFns } from "./common";
import { flagKey, scoreOwnWords, type AggWeek, type ItemFlag } from "./agg";
import type { ToneModel } from "../engine/tone";

const GRAPH = "https://graph.microsoft.com/v1.0";
export const MS_SCOPES = ["Mail.Read", "Calendars.Read"];

// ---------------------------------------------------------------- sign-in (MSAL)

type Pca = {
  initialize(): Promise<void>;
  acquireTokenPopup(r: { scopes: string[]; prompt?: string }): Promise<{ accessToken: string }>;
  clearCache?(): Promise<void>;
};
let pca: Pca | null = null;

/** Load MSAL (bundled, so this works offline until sign-in) and get it ready. */
export async function loadMsal(clientId: string): Promise<void> {
  if (pca) return;
  const { PublicClientApplication } = await import("@azure/msal-browser");
  const redirectUri = new URL("./auth.html", window.location.href).toString();
  const app = new PublicClientApplication({
    auth: { clientId, authority: "https://login.microsoftonline.com/common", redirectUri },
    cache: { cacheLocation: "memoryStorage" },
  }) as unknown as Pca;
  await app.initialize();
  pca = app;
}

/** Call straight from a tap, so the browser lets Microsoft's sign-in window open. */
export async function msToken(): Promise<string> {
  if (!pca) throw new Error("Microsoft sign-in is not ready yet.");
  const r = await pca.acquireTokenPopup({ scopes: MS_SCOPES, prompt: "select_account" });
  return r.accessToken;
}

export async function msForget(): Promise<void> {
  await pca?.clearCache?.();
}

// ---------------------------------------------------------------- reading

interface GraphMessage {
  id: string;
  sentDateTime?: string;
  receivedDateTime?: string;
  internetMessageId?: string;
  conversationId?: string;
  internetMessageHeaders?: { name: string; value: string }[];
  singleValueExtendedProperties?: { id: string; value: string }[];
  body?: { contentType?: string; content?: string };
  from?: { emailAddress?: { address?: string } };
}

/** The MAPI property that holds In-Reply-To (PR_IN_REPLY_TO_ID). Asking for it alone means no
 *  other header is downloaded. */
export const IN_REPLY_TO_PROP = "String 0x1042";

const firstId = (v: string | undefined) => (v ? (/<[^>]+>/.exec(v)?.[0] ?? v.trim()) : null);

export function inReplyTo(m: GraphMessage): string | null {
  const prop = m.singleValueExtendedProperties?.find((p) => p.id.toLowerCase() === IN_REPLY_TO_PROP.toLowerCase())?.value;
  return firstId(prop ?? m.internetMessageHeaders?.find((h) => h.name.toLowerCase() === "in-reply-to")?.value);
}

/** Graph puts dates in UTC without a Z when a time zone is not asked for. */
const graphTime = (v: string | undefined) => (v ? Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(v) ? v : `${v}Z`) : NaN);

interface Sent {
  at: number;
  replyHours: number | null;
  lowMood: boolean | null;
}

export function outlookWeeks(items: Sent[], range: { from: number; to: number }, exams: Set<string>, time: TimeFns = localTime, cfg: Config = CONFIG): AggWeek[] {
  return weeksBetween(range.from, range.to, time).map(({ weekOf, complete }) => {
    const xs = items.filter((i) => time.week(i.at) === weekOf);
    const scored = xs.filter((x) => x.lowMood != null);
    const replies = xs.map((x) => x.replyHours).filter((h): h is number => h != null);
    const contrib: AggWeek["contrib"] = { messages: xs.length };
    if (scored.length) contrib.lowMood = scored.filter((x) => x.lowMood).length / scored.length;
    const med = median(replies);
    if (med != null) contrib.replyHours = med;
    return {
      weekOf,
      complete,
      contrib,
      exam: exams.has(weekOf),
      show: { sent: xs.length, replyHours: med, late: xs.filter((x) => isLateNight(time.hour(x.at), cfg)).length },
    };
  });
}

async function listAll<T>(get: Getter, first: string, max: number): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  let url: string | undefined = first;
  let n = 0;
  while (url && n < max) {
    const j = (await get(url)) as { value?: T[]; "@odata.nextLink"?: string };
    items.push(...(j.value ?? []));
    url = j["@odata.nextLink"];
    n++;
  }
  return { items, truncated: !!url };
}

export async function readOutlook(get: Getter, opts: { now: number; tone: ToneModel | null; time?: TimeFns; cfg?: Config }) {
  const cfg = opts.cfg ?? CONFIG;
  const ic = cfg.integrations;
  const time = opts.time ?? localTime;
  const from = opts.now - ic.windowDays * DAY;
  const me = (await get(`${GRAPH}/me?$select=mail,userPrincipalName`)) as { mail?: string; userPrincipalName?: string };
  const self = (me.mail ?? me.userPrincipalName ?? "").toLowerCase();

  const select = "id,sentDateTime,internetMessageId,conversationId,body";
  const expand = encodeURIComponent(`singleValueExtendedProperties($filter=id eq '${IN_REPLY_TO_PROP}')`);
  const sent = await listAll<GraphMessage>(
    get,
    `${GRAPH}/me/mailFolders/sentitems/messages?$select=${select}&$expand=${expand}&$filter=${encodeURIComponent(`sentDateTime ge ${new Date(from).toISOString()}`)}&$orderby=${encodeURIComponent("sentDateTime desc")}&$top=${ic.graphPageSize}`,
    Math.ceil(ic.maxSentEmails / ic.graphPageSize),
  );
  const flags: ItemFlag[] = [];
  let skipped = 0;
  const items: Sent[] = [];
  await pool(sent.items.slice(0, ic.maxSentEmails), ic.fetchConcurrency, async (m) => {
    const at = graphTime(m.sentDateTime);
    if (!Number.isFinite(at) || at > opts.now || at < from) return;
    let lowMood: boolean | null = null;
    {
      // The text lives only inside this block.
      const own = ownWords(m.body?.content ?? "");
      if (!own.separable) skipped++;
      else if (own.text) {
        const r = scoreOwnWords(own.text, at, { now: opts.now, tone: opts.tone, cfg });
        lowMood = r.lowMood;
        if (r.level !== "none") flags.push({ at, level: r.level, key: await flagKey("microsoft", self, at, r.hash), textHash: r.hash });
      }
    }
    let replyHours: number | null = null;
    const parentId = inReplyTo(m);
    if (parentId) {
      // Only the answered message's time and sender address.
      const p = (await get(`${GRAPH}/me/messages?$select=receivedDateTime,from&$filter=${encodeURIComponent(`internetMessageId eq '${parentId.replace(/'/g, "''")}'`)}`)) as {
        value?: GraphMessage[];
      };
      const parent = p.value?.[0];
      const pAt = graphTime(parent?.receivedDateTime);
      const theirs = (parent?.from?.emailAddress?.address ?? "").toLowerCase() !== self;
      if (parent && theirs && Number.isFinite(pAt) && pAt <= at) replyHours = (at - pAt) / HOUR;
    } else if (m.conversationId) {
      // Sent Items often carry no In-Reply-To. Then the latest earlier message in the same
      // conversation from someone else stands in for the one answered: only its time and sender.
      const c = (await get(`${GRAPH}/me/messages?$select=receivedDateTime,from&$filter=${encodeURIComponent(`conversationId eq '${m.conversationId.replace(/'/g, "''")}'`)}&$top=50`)) as {
        value?: GraphMessage[];
      };
      const earlier = (c.value ?? [])
        .filter((x) => (x.from?.emailAddress?.address ?? "").toLowerCase() !== self)
        .map((x) => graphTime(x.receivedDateTime))
        .filter((t) => Number.isFinite(t) && t <= at);
      if (earlier.length) replyHours = (at - Math.max(...earlier)) / HOUR;
    }
    items.push({ at, replyHours, lowMood });
  });

  const cal = await listAll<{ subject?: string; start?: { dateTime?: string } }>(
    get,
    `${GRAPH}/me/calendarView?startDateTime=${encodeURIComponent(new Date(from).toISOString())}&endDateTime=${encodeURIComponent(new Date(opts.now + ic.calendarDays * DAY).toISOString())}&$select=subject,start&$top=250`,
    ic.maxPages,
  );
  const exams = new Set<string>();
  for (const e of cal.items) {
    const t = graphTime(e.start?.dateTime);
    if (isExam(e.subject) && Number.isFinite(t)) exams.add(time.week(t));
  }
  const truncated = sent.truncated || sent.items.length > ic.maxSentEmails;
  const covered = truncated && items.length ? Math.max(from, Math.min(...items.map((i) => i.at))) : from;
  flags.sort((a, b) => a.at - b.at);
  return {
    weeks: outlookWeeks(items, { from: covered, to: opts.now }, exams, time, cfg),
    examWeeks: [...exams].sort(),
    flags,
    read: items.length,
    skipped,
    truncated,
  };
}
