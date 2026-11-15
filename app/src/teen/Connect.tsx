import { useState } from "react";
import { useSnap, useStore } from "../store/hooks";
import type { Store } from "../store/store";
import { SOURCES, type ContribKey, type SourceId } from "../engine/types";
import {
  CALENDAR_SCOPE,
  CLASSROOM_SCOPE,
  DRIVE_ACTIVITY_SCOPE,
  FITBIT_CLIENT_ID,
  GMAIL_SCOPE,
  GOOGLE_CLIENT_ID,
  LASTFM_API_KEY,
  MS_CLIENT_ID,
} from "../integrations/env";
import { loadGis, requestToken, revokeToken } from "../integrations/google";
import { bearerGetter, bearerPoster, headerGetter, plainGetter, weekWords } from "../integrations/common";
import { readGmail } from "../integrations/gmail";
import { readCalendar } from "../integrations/calendar";
import { readLastfm } from "../integrations/lastfm";
import { parseScreenTime } from "../integrations/screentime";
import { readClassroom } from "../integrations/classroom";
import { readDriveActivity } from "../integrations/drive";
import { loadMsal, msForget, msToken, readOutlook } from "../integrations/microsoft";
import { fitbitSignIn, pkcePair, readFitbit } from "../integrations/fitbit";
import { importExport, type ExportPlatform } from "../integrations/exports";
import { importSpotify } from "../integrations/spotify";
import { sampleCalendar, sampleGmail, sampleLastfm, samplePhoneV2, sampleSource } from "../integrations/sample";
import { getAccounts, saveAccount, useAccounts, type Accounts, type GenericAccount } from "../integrations/accounts";
import { liveWeekFrom } from "../integrations/live";
import { ledgerAdd, ledgerHas } from "../integrations/ledger";
import type { ItemFlag } from "../integrations/agg";
import { SOURCE_INFO, GROUP_ORDER } from "./sourceInfo";
import { ImportData } from "./Import";

export const SOURCE_NAME: Record<SourceId, string> = Object.fromEntries(SOURCES.map((s) => [s, SOURCE_INFO[s].name])) as Record<SourceId, string>;

const GOOGLE_SCOPE: Partial<Record<SourceId, string>> = {
  gmail: GMAIL_SCOPE,
  calendar: CALENDAR_SCOPE,
  classroom: CLASSROOM_SCOPE,
  drive: DRIVE_ACTIVITY_SCOPE,
};

export function keyMissing(source: SourceId): boolean {
  const kind = SOURCE_INFO[source].kind;
  if (kind === "google") return !GOOGLE_CLIENT_ID;
  if (kind === "microsoft") return !MS_CLIENT_ID;
  if (kind === "fitbit") return !FITBIT_CLIENT_ID;
  if (kind === "lastfm") return !LASTFM_API_KEY;
  return false;
}

/** One tap: forget the account on this phone and drop its token. The flag ledger stays. */
export function disconnectSource(store: Store, source: SourceId) {
  const scope = GOOGLE_SCOPE[source];
  if (scope) revokeToken(scope);
  if (source === "microsoft") void msForget();
  saveAccount(source, undefined);
  store.dispatch({ a: "teen", input: { kind: "disconnect", source } });
}

/** Each flagged item is passed to the rules once, with its own time, its source and, from the
 *  Android file, the teen's answer. The rules themselves drop items older than 24 hours. */
function passFlags(store: Store, source: string, flags: ItemFlag[]) {
  for (const f of flags) {
    if (ledgerHas(f.key)) continue;
    ledgerAdd(f.key);
    store.dispatch({ a: "teen", input: { kind: "emailFlag", level: f.level, sentAt: f.at, key: f.key, textHash: f.textHash, source, answer: f.answer } });
  }
}

/** What a real connection gives: the numbers present in its complete weeks. */
function realProvides(source: SourceId): ContribKey[] {
  const acc = getAccounts();
  const keys = new Set<ContribKey>();
  const weeks = (acc as Record<string, { weeks?: { weekOf: string }[] } | undefined>)[source]?.weeks ?? [];
  for (const w of weeks) {
    const lw = liveWeekFrom(acc, w.weekOf)[source];
    if (lw?.complete) for (const [k, v] of Object.entries(lw.contrib)) if (typeof v === "number") keys.add(k as ContribKey);
  }
  return [...keys];
}

/** Keep only weekly numbers and counts from a reader's result. */
function genericFrom(r: object): Omit<GenericAccount, "mode" | "fetchedAt"> {
  const o = r as Record<string, unknown>;
  const counts: Record<string, number> = {};
  for (const k of ["othersSkipped", "skipped", "unreadable", "ownMessages", "activity", "read", "edits", "courses", "nights", "plays"]) if (typeof o[k] === "number") counts[k] = o[k] as number;
  return {
    weeks: (o.weeks as GenericAccount["weeks"]) ?? [],
    truncated: o.truncated === true,
    examWeeks: Array.isArray(o.examWeeks) ? (o.examWeeks as string[]) : undefined,
    counts,
    layout: typeof o.layout === "string" ? o.layout : undefined,
    notes: Array.isArray(o.notes) ? (o.notes as string[]) : undefined,
  };
}

const round = (n: number) => Math.round(n);

function hoursWords(h: number): string {
  const r = Math.round(h * 2) / 2;
  if (r < 1) return "under an hour";
  const whole = Math.floor(r);
  return `about ${whole}${r - whole ? " and a half" : ""} hour${r === 1 ? "" : "s"}`;
}

function repeatWords(rep: number): string {
  return rep < 0.3 ? "mostly different songs" : rep < 0.6 ? "some repeats" : "a lot of repeats";
}

const partWeek = (complete: boolean) => (complete ? "" : " (part of the week)");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function genericLine(source: SourceId, w: GenericAccount["weeks"][number]): string | null {
  const s = w.show;
  const n = (k: string) => (typeof s[k] === "number" ? round(s[k] as number) : 0);
  const head = `Week of ${weekWords(w.weekOf)}${partWeek(w.complete)}:`;
  switch (source) {
    case "classroom":
      return n("due") ? `${head} ${n("due")} due, ${n("late")} late, ${n("missing")} missing, ${n("afterMidnight")} turned in after midnight.` : null;
    case "canvas":
    case "schoology":
      return n("due") ? `${head} ${n("late")} late, ${n("missing")} missing.` : null;
    case "drive":
      return n("edits") ? `${head} edits on ${plural(n("daysWithEdits"), "day")}, ${n("late")} after midnight.` : null;
    case "microsoft":
      return n("sent")
        ? `${head} ${plural(n("sent"), "email")} sent, ${typeof s.replyHours === "number" ? `replies in ${hoursWords(s.replyHours)}` : "no replies timed"}, ${n("late")} after midnight.`
        : null;
    case "fitbit":
      return typeof s.sleepHours === "number" || typeof s.steps === "number"
        ? `${head} ${typeof s.sleepHours === "number" ? `${hoursWords(s.sleepHours)} of sleep a night` : "no sleep logged"}, ${
            typeof s.steps === "number" ? `about ${round(s.steps / 100) * 100} steps a day` : "no steps"
          }.`
        : null;
    case "youtube":
    case "chrome": {
      if (!n("events")) return null;
      const what = source === "youtube" ? "watched or searched" : `${plural(n("events"), "page")} visited, ${plural(n("searches"), "search", "searches")}`;
      const harm = n("harmContent") ? `, ${n("harmContent")} about self-harm` : "";
      return `${head} ${source === "youtube" ? `${n("events")} ${what}` : what}, ${n("late")} after midnight${harm}.`;
    }
    case "spotify":
      return n("plays")
        ? `${head} ${plural(n("plays"), "song")}, ${hoursWords(n("minutes") / 60)}, ${n("late")} after midnight, ${n("skips")} skipped, ${repeatWords(typeof s.repeats === "number" ? s.repeats : 0)}.`
        : `${head} no songs.`;
    case "instagram":
    case "tiktok": {
      if (!n("events")) return null;
      const seen = n("viewed") ? `, ${n("viewed")} ${source === "tiktok" ? "watched" : "viewed"}` : "";
      const looked = n("searches") ? `, ${plural(n("searches"), "search", "searches")}` : "";
      const harm = n("harmContent") ? `, ${n("harmContent")} about self-harm` : "";
      return `${head} ${plural(n("messages"), "message")} sent${seen}${looked}${harm}, ${n("late")} of ${n("events")} actions after midnight.`;
    }
    default:
      return n("events") ? `${head} ${plural(n("messages"), "message")} sent, ${n("late")} of ${n("events")} actions after midnight.` : null;
  }
}

/** What the phone kept, in words. No shares or scores. */
function summaryLines(source: SourceId, a: Accounts): string[] {
  if (source === "gmail" && a.gmail) {
    const lines = a.gmail.weeks
      .filter((w) => w.complete || w.emails_sent > 0)
      .map(
        (w) =>
          `Week of ${weekWords(w.weekOf)}${partWeek(w.complete)}: ${plural(w.emails_sent, "email")} sent, ${
            w.median_reply_hours == null ? "no replies timed" : `replies in ${hoursWords(w.median_reply_hours)}`
          }, ${round((w.share_after_midnight ?? 0) * w.emails_sent)} after midnight.`,
      );
    if (a.gmail.skipped) lines.push(`${plural(a.gmail.skipped, "email was", "emails were")} skipped: their own words couldn't be separated from quoted text.`);
    if (a.gmail.truncated) lines.push("There were more sent emails than Stability reads at once, so the oldest weeks are partial.");
    return lines;
  }
  if (source === "calendar" && a.calendar) {
    const ex = a.calendar.weeks.filter((w) => w.exam).map((w) => weekWords(w.weekOf));
    return [ex.length ? `An exam or test in the week${ex.length > 1 ? "s" : ""} of ${ex.join(", ")}.` : "No exams or tests found."];
  }
  if (source === "lastfm" && a.lastfm) {
    const lines = a.lastfm.weeks
      .filter((w) => w.complete || w.plays > 0)
      .map((w) =>
        w.plays
          ? `Week of ${weekWords(w.weekOf)}${partWeek(w.complete)}: ${w.plays} plays, ${round((w.late_share ?? 0) * w.plays)} after midnight, ${repeatWords(w.repetition ?? 0)}.`
          : `Week of ${weekWords(w.weekOf)}${partWeek(w.complete)}: no plays.`,
      );
    if (a.lastfm.truncated) lines.push("There were more plays than Stability reads at once, so the oldest weeks are partial.");
    return lines;
  }
  if (source === "screentime" && a.screentime) {
    return a.screentime.weeks.slice(-4).map((w) => {
      const parts = [
        w.screen_minutes != null ? `${hoursWords(w.screen_minutes / 60)} a day on the phone` : null,
        w.night_minutes != null ? `${round(w.night_minutes)} minutes after midnight` : null,
        w.sleep_hours != null ? `${hoursWords(w.sleep_hours)} of sleep` : w.phone_free_hours != null ? `${hoursWords(w.phone_free_hours)} phone-free at night` : null,
        w.steps != null ? `about ${round(w.steps / 100) * 100} steps a day` : null,
        w.kb_messages != null ? `${w.kb_messages} messages typed` : null,
      ].filter(Boolean);
      return `Week of ${weekWords(w.weekOf)}: ${parts.join(", ") || "no data"}.`;
    });
  }
  const g = (a as Record<string, GenericAccount | undefined>)[source];
  if (!g) return [];
  const lines = g.weeks
    .map((w) => genericLine(source, w))
    .filter((l): l is string => !!l)
    .slice(-4);
  if (!lines.length) lines.push("Nothing in the last weeks.");
  if (source === "youtube" || source === "chrome") {
    const harm = g.weeks.reduce((t, w) => t + (typeof w.show.harmContent === "number" ? w.show.harmContent : 0), 0);
    const what = source === "youtube" ? "videos or searches" : "pages or searches";
    lines.unshift(
      `${plural(g.weeks.length, "week")} read. ${harm ? `${harm} ${what} about self-harm. A recent search like that brings up "Are you safe right now?"` : `No ${what} about self-harm.`} Titles were dropped after reading.`,
    );
  }
  if (source === "instagram" || source === "tiktok") {
    const sum = (k: string) => g.weeks.reduce((t, w) => t + (typeof w.show[k] === "number" ? (w.show[k] as number) : 0), 0);
    if (sum("searches") || sum("viewed")) {
      const harm = sum("harmContent");
      lines.unshift(
        `${plural(g.weeks.length, "week")} read. ${harm ? `${plural(harm, "search", "searches")} about self-harm. A recent search like that brings up "Are you safe right now?"` : "No searches about self-harm."} Search words, usernames and links were dropped after reading.`,
      );
    }
  }
  if (g.examWeeks?.length) lines.push(`An exam or test in the week${g.examWeeks.length > 1 ? "s" : ""} of ${g.examWeeks.map(weekWords).join(", ")}.`);
  if (g.counts?.othersSkipped) lines.push(`${plural(g.counts.othersSkipped, "message")} from other people skipped without being read.`);
  if (g.counts?.skipped) lines.push(`${plural(g.counts.skipped, "email was", "emails were")} skipped: their own words couldn't be separated from quoted text.`);
  if (g.notes?.length) lines.push(...g.notes);
  else if (g.truncated) lines.push("There was more than Stability reads at once, so some weeks are partial.");
  return lines;
}

function Account({ source, onClose }: { source: SourceId; onClose: () => void }) {
  const snap = useSnap();
  const store = useStore();
  const accounts = useAccounts();
  const link = snap.sim.world.teen.sources?.[source];
  const info = SOURCE_INFO[source];
  const [phase, setPhase] = useState<"idle" | "loading" | "signin" | "working">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [user, setUser] = useState("");
  const [pkce, setPkce] = useState<{ verifier: string; challenge: string; state: string } | null>(null);
  const missing = keyMissing(source);
  const signs = info.kind === "google" || info.kind === "microsoft" || info.kind === "fitbit";
  const isFile = info.kind === "file" || info.kind === "phone";

  const finish = (mode: "real" | "sample", data: object) => {
    saveAccount(source, { ...data, mode, fetchedAt: Date.now() } as never);
    const provides = mode === "real" ? realProvides(source) : undefined;
    store.dispatch({ a: "teen", input: { kind: "connect", source, mode, provides } });
    setPhase("idle");
  };

  const run = async (fn: () => Promise<void>) => {
    setErr(null);
    setPhase("working");
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong. Nothing was saved.");
      setPhase("idle");
    }
  };

  const useSample = () =>
    run(async () => {
      if (source === "gmail") finish("sample", await sampleGmail(store.toneModel));
      else if (source === "calendar") finish("sample", await sampleCalendar());
      else if (source === "lastfm") finish("sample", await sampleLastfm());
      else if (source === "screentime") {
        const r = samplePhoneV2();
        finish("sample", { weeks: r.weeks, source: r.source, version: r.version });
      } else finish("sample", genericFrom(await sampleSource(source, store.toneModel)));
    });

  // Sign-in screens open from a second tap, so the browser allows their window.
  const prepare = async () => {
    setErr(null);
    setPhase("loading");
    try {
      if (info.kind === "google") await loadGis();
      else if (info.kind === "microsoft") await loadMsal(MS_CLIENT_ID);
      else if (info.kind === "fitbit") setPkce(await pkcePair());
      setPhase("signin");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Can't reach the sign-in right now.");
      setPhase("idle");
    }
  };

  const signIn = () => {
    const now = Date.now();
    if (info.kind === "google") {
      const tokenP = requestToken(GOOGLE_CLIENT_ID, GOOGLE_SCOPE[source]!);
      run(async () => {
        const token = await tokenP;
        const get = bearerGetter(token);
        if (source === "gmail") {
          const r = await readGmail(get, { now, tone: store.toneModel });
          finish("real", { weeks: r.weeks, read: r.read, truncated: r.truncated, skipped: r.skipped });
          passFlags(store, "gmail", r.flags);
        } else if (source === "calendar") finish("real", await readCalendar(get, { now }));
        else if (source === "classroom") finish("real", genericFrom(await readClassroom(get, { now })));
        else if (source === "drive") finish("real", genericFrom(await readDriveActivity(bearerPoster(token), { now })));
      });
    } else if (info.kind === "microsoft") {
      const tokenP = msToken();
      run(async () => {
        const r = await readOutlook(headerGetter(await tokenP, { Prefer: 'outlook.body-content-type="text"' }), { now, tone: store.toneModel });
        finish("real", genericFrom(r));
        passFlags(store, "microsoft", r.flags);
      });
    } else if (info.kind === "fitbit" && pkce) {
      const tokenP = fitbitSignIn(FITBIT_CLIENT_ID, pkce);
      run(async () => finish("real", genericFrom(await readFitbit(headerGetter(await tokenP), { now }))));
    }
  };

  const connectLastfm = () =>
    run(async () => {
      const name = user.trim();
      if (!name) throw new Error("Type your Last.fm username first.");
      const r = await readLastfm(plainGetter(), { user: name, apiKey: LASTFM_API_KEY, now: Date.now() });
      setUser("");
      finish("real", { weeks: r.weeks, plays: r.plays, truncated: r.truncated });
    });

  const readFiles = (list: FileList | null) => {
    const files = list ? Array.from(list) : [];
    if (!files.length) return;
    if (source !== "spotify") return readFile(files[0]);
    run(async () => {
      // Several Spotify files, or one zip. Each is parsed and dropped; only weeks are kept.
      const r = await importSpotify(
        files.map((f) => ({ blob: f, name: f.name })),
        { now: Date.now() },
      );
      finish("real", genericFrom(r));
    });
  };

  const readFile = (file: File | undefined) =>
    file &&
    run(async () => {
      if (info.kind === "phone") {
        const r = parseScreenTime(await file.text());
        finish("real", { weeks: r.weeks, source: r.source, version: r.version });
        passFlags(
          store,
          "android",
          r.flags.map((f) => ({ at: f.at, level: f.level, key: `android:${f.id}`, answer: f.answer })),
        );
        return;
      }
      const platform = source as ExportPlatform;
      // Profile files first, then each data file as it unpacks; nothing big is held in memory.
      const r = await importExport(file, file.name, platform, { now: Date.now(), tone: store.toneModel });
      finish("real", genericFrom(r));
      passFlags(store, platform, r.flags);
    });

  const lines = summaryLines(source, accounts);

  return (
    <div className="fade-in">
      <button className="btn btn-quiet btn-sm" onClick={onClose} style={{ paddingLeft: 0 }}>
        Back to accounts
      </button>
      <p className="label" style={{ marginTop: 6 }}>
        {info.group}
      </p>
      <h1 className="title">{info.name}</h1>
      <h2 className="label">What Stability reads</h2>
      <p>{info.reads}</p>
      <h2 className="label">What it keeps</h2>
      <p>{info.keeps}</p>
      {info.more.map((m) => (
        <p key={m} className="small muted">
          {m}
        </p>
      ))}
      {info.howTo && (
        <ol className="small" style={{ paddingLeft: 18 }}>
          {info.howTo.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ol>
      )}
      {source === "lastfm" && (
        <p className="small">
          <a href="https://www.last.fm" target="_blank" rel="noreferrer">
            Music data from Last.fm
          </a>
        </p>
      )}

      {link ? (
        <section className="card" aria-live="polite">
          <p className="label" style={{ margin: 0 }}>
            {link.mode === "sample" ? "Sample data, not your account" : "Connected"}
          </p>
          {lines.map((l) => (
            <p key={l} className="small" style={{ margin: "8px 0 0" }}>
              {l}
            </p>
          ))}
          <p className="mono small" style={{ marginTop: 10 }}>
            Read on this phone. Nothing was uploaded.
          </p>
          <button className="btn" onClick={() => disconnectSource(store, source)}>
            Disconnect
          </button>
        </section>
      ) : info.kind === "server" || missing ? (
        <section className="card">
          <p style={{ marginTop: 0 }}>{info.kind === "server" ? "Needs the phone app or a server." : "Not set up yet."}</p>
          {info.kind !== "server" && <p className="small muted">This copy of Stability has no key for {info.name}. Sample data shows how it works.</p>}
          <div className="btn-col">
            <button className="btn btn-primary" onClick={useSample} disabled={phase === "working"}>
              Use sample data
            </button>
            <button className="btn btn-quiet" onClick={onClose}>
              Not now
            </button>
          </div>
        </section>
      ) : (
        <section className="card">
          {info.kind === "lastfm" && (
            <label className="field" style={{ marginTop: 0 }}>
              <span className="label">Your Last.fm username</span>
              <input value={user} maxLength={40} autoCapitalize="none" autoComplete="off" onChange={(e) => setUser(e.target.value)} />
            </label>
          )}
          {isFile && (
            <label className="field" style={{ marginTop: 0 }}>
              <span className="label">
                {info.kind === "phone" ? "File from the Stability app (.json)" : source === "spotify" ? "Spotify data (.zip, or one or more .json)" : "Export file (.zip or .json)"}
              </span>
              <input
                type="file"
                multiple={source === "spotify"}
                accept=".zip,.json,application/zip,application/json"
                onChange={(e) => readFiles(e.target.files)}
              />
            </label>
          )}
          <div className="btn-col">
            {signs &&
              (phase === "signin" ? (
                <button className="btn btn-primary" onClick={signIn}>
                  Continue with {info.kind === "google" ? "Google" : info.kind === "microsoft" ? "Microsoft" : "Fitbit"}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={prepare} disabled={phase !== "idle"}>
                  {phase === "loading" ? "Getting sign-in ready" : "Connect"}
                </button>
              ))}
            {info.kind === "lastfm" && (
              <button className="btn btn-primary" onClick={connectLastfm} disabled={phase !== "idle"}>
                Connect
              </button>
            )}
            {isFile && (
              <button className="btn" onClick={useSample} disabled={phase !== "idle"}>
                Use sample data
              </button>
            )}
            <button className="btn btn-quiet" onClick={onClose}>
              Not now
            </button>
          </div>
          {signs && (
            <p className="small muted" style={{ marginBottom: 0 }}>
              You sign in on the service's own screen. Stability never sees your password.
            </p>
          )}
        </section>
      )}
      {phase === "working" && (
        <p className="small" role="status">
          Reading on this phone.
        </p>
      )}
      {err && (
        <p className="small" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}

export function Connect({ initial }: { initial?: SourceId | null }) {
  const snap = useSnap();
  const [open, setOpen] = useState<SourceId | "import" | null>(initial ?? null);
  const sources = snap.sim.world.teen.sources ?? {};

  if (open === "import")
    return (
      <div>
        <button className="btn btn-quiet btn-sm" onClick={() => setOpen(null)} style={{ paddingLeft: 0 }}>
          Back to accounts
        </button>
        <ImportData />
      </div>
    );
  if (open) return <Account key={open} source={open} onClose={() => setOpen(null)} />;

  return (
    <div>
      <p className="label">Connect</p>
      <h1 className="title" style={{ fontSize: 20 }}>
        Accounts and files you can connect
      </h1>
      <p className="small">You sign in yourself, on this phone. Stability reads them here and keeps weekly numbers only.</p>
      {GROUP_ORDER.map((group) => (
        <section key={group} aria-label={group}>
          <h2 className="label" style={{ marginTop: 16 }}>
            {group}
          </h2>
          {SOURCES.filter((k) => SOURCE_INFO[k].group === group).map((k) => {
            const l = sources[k];
            const info = SOURCE_INFO[k];
            const state = l
              ? l.mode === "sample"
                ? "Sample data"
                : "Connected"
              : info.kind === "server"
                ? "Needs the phone app or a server"
                : keyMissing(k)
                  ? "Not set up yet"
                  : info.kind === "file" || info.kind === "phone"
                    ? "Add a file"
                    : "Not connected";
            return (
              <button key={k} className="list-note" onClick={() => setOpen(k)}>
                <span style={{ display: "block", fontWeight: 500 }}>{info.name}</span>
                <span className="small muted">{state}</span>
              </button>
            );
          })}
        </section>
      ))}
      <button className="list-note card-soft" onClick={() => setOpen("import")}>
        <span style={{ display: "block", fontWeight: 500 }}>Look at a sleep and steps file, or one Spotify file</span>
        <span className="small muted">Shown here only. To use Spotify in the rules, open Spotify under Music.</span>
      </button>
    </div>
  );
}
