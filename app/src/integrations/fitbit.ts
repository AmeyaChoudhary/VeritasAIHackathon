// Fitbit Web API, with OAuth 2.0 PKCE in a popup (no client secret). Sleep logs and daily steps.
//
// Status, checked November 14, 2026: Google ended support for the Fitbit Web API on
// September 30, 2026 and lists November 2, 2026 as the day its endpoints and Fitbit OAuth turn
// off (they answer HTTP 410). The Google Health API replaces it; its scopes are restricted and
// need Google's review. https://developers.google.com/health/about
// The reader below handles the Web API's responses, so it can serve the Android app or a server
// that still has data in that shape; the live connection will fail with 410 once it is off.

import { CONFIG, DAY, type Config } from "../engine/config";
import { localTime, mondayOfYmd, weeksBetween, type Getter, type TimeFns } from "./common";
import type { AggWeek } from "./agg";

const API = "https://api.fitbit.com";
export const FITBIT_SCOPES = "sleep activity";
export const FITBIT_STATUS =
  "Fitbit turned its Web API off on November 2, 2026. Its replacement, the Google Health API, needs Google's review before an app can use it, so connecting will most likely fail.";

// ---------------------------------------------------------------- PKCE sign-in

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function pkcePair(): Promise<{ verifier: string; challenge: string; state: string }> {
  const rnd = crypto.getRandomValues(new Uint8Array(48));
  const verifier = b64url(rnd);
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const state = `steadyfb.${b64url(crypto.getRandomValues(new Uint8Array(12)))}`;
  return { verifier, challenge, state };
}

export function fitbitAuthUrl(clientId: string, redirectUri: string, p: { challenge: string; state: string }): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: FITBIT_SCOPES,
    code_challenge: p.challenge,
    code_challenge_method: "S256",
    state: p.state,
    redirect_uri: redirectUri,
  });
  return `https://www.fitbit.com/oauth2/authorize?${q}`;
}

/** Open Fitbit's own sign-in. Call straight from a tap. The redirect page (auth.html) hands the
 *  code back on a BroadcastChannel; the token stays in memory. */
export function fitbitSignIn(clientId: string, p: { verifier: string; challenge: string; state: string }): Promise<string> {
  const redirectUri = new URL("./auth.html", window.location.href).toString();
  const win = window.open(fitbitAuthUrl(clientId, redirectUri, p), "steady-fitbit", "width=480,height=720");
  if (!win) return Promise.reject(new Error("The browser blocked Fitbit's sign-in window."));
  return new Promise((resolve, reject) => {
    const ch = new BroadcastChannel("steady-oauth");
    const timer = window.setTimeout(() => done(new Error("Fitbit sign-in took too long.")), 5 * 60 * 1000);
    const done = (err: Error | null, token?: string) => {
      window.clearTimeout(timer);
      ch.close();
      if (err) reject(err);
      else resolve(token as string);
    };
    ch.onmessage = async (ev: MessageEvent) => {
      const m = ev.data as { provider?: string; state?: string; code?: string; error?: string };
      if (m.provider !== "fitbit" || m.state !== p.state) return;
      if (!m.code) return done(new Error(m.error || "Fitbit did not connect."));
      try {
        const r = await fetch(`${API}/oauth2/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: clientId, grant_type: "authorization_code", code: m.code, code_verifier: p.verifier, redirect_uri: redirectUri }),
        });
        if (r.status === 410) return done(new Error("Fitbit's API has been turned off."));
        const j = (await r.json()) as { access_token?: string; errors?: { message?: string }[] };
        if (!j.access_token) return done(new Error(j.errors?.[0]?.message || "Fitbit did not connect."));
        done(null, j.access_token);
      } catch {
        done(new Error("Can't reach Fitbit right now."));
      }
    };
  });
}

// ---------------------------------------------------------------- reading

export interface FitbitSleep {
  dateOfSleep?: string;
  startTime?: string; // local time, no zone: "2026-11-09T23:30:00.000"
  minutesAsleep?: number;
  isMainSleep?: boolean;
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Bedtime as minutes after 6 p.m. of the evening before, so 23:30 is 330 and 00:30 is 390. */
export function bedtimeMinutes(startTime: string | undefined): number | null {
  const m = startTime ? /T(\d{2}):(\d{2})/.exec(startTime) : null;
  if (!m) return null;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return (mins - 18 * 60 + 24 * 60) % (24 * 60);
}

export interface FitbitNight {
  date: string;
  hours: number;
  bedtime: number | null;
}

export function fitbitNights(sleep: FitbitSleep[]): FitbitNight[] {
  const out: FitbitNight[] = [];
  for (const s of sleep) {
    if (s.isMainSleep === false || !s.dateOfSleep || typeof s.minutesAsleep !== "number") continue;
    if (s.minutesAsleep <= 0 || s.minutesAsleep > 20 * 60) continue;
    out.push({ date: s.dateOfSleep, hours: s.minutesAsleep / 60, bedtime: bedtimeMinutes(s.startTime) });
  }
  return out;
}

export function fitbitWeeks(
  nights: FitbitNight[],
  steps: { date: string; steps: number }[],
  range: { from: number; to: number },
  time: TimeFns = localTime,
  cfg: Config = CONFIG,
): AggWeek[] {
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return weeksBetween(range.from, range.to, time).map(({ weekOf, complete }) => {
    // Fitbit's dates are the teen's own local dates, so the week comes straight from the date.
    const weekOfDate = (d: string) => mondayOfYmd(d);
    const n = nights.filter((x) => weekOfDate(x.date) === weekOf);
    const st = steps.filter((x) => weekOfDate(x.date) === weekOf && x.steps > 0);
    const contrib: AggWeek["contrib"] = {};
    const sleep = mean(n.map((x) => x.hours));
    const stepsMean = mean(st.map((x) => x.steps));
    if (n.length >= cfg.minDaysPerWeek && sleep != null) contrib.sleep = sleep;
    if (st.length >= cfg.minDaysPerWeek && stepsMean != null) contrib.steps = stepsMean;
    return {
      weekOf,
      complete,
      contrib,
      show: { sleepHours: sleep, nights: n.length, bedtime: mean(n.map((x) => x.bedtime).filter((b): b is number => b != null)), steps: stepsMean, stepDays: st.length },
    };
  });
}

export async function readFitbit(get: Getter, opts: { now: number; time?: TimeFns; cfg?: Config }) {
  const cfg = opts.cfg ?? CONFIG;
  const from = opts.now - cfg.integrations.windowDays * DAY;
  const start = ymd(from);
  const end = ymd(opts.now);
  const sleep = (await get(`${API}/1.2/user/-/sleep/date/${start}/${end}.json`)) as { sleep?: FitbitSleep[] };
  const steps = (await get(`${API}/1/user/-/activities/steps/date/${start}/${end}.json`)) as { "activities-steps"?: { dateTime?: string; value?: string }[] };
  const nights = fitbitNights(sleep.sleep ?? []);
  const daily = (steps["activities-steps"] ?? [])
    .map((d) => ({ date: d.dateTime ?? "", steps: Number(d.value) }))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date) && Number.isFinite(d.steps));
  return { weeks: fitbitWeeks(nights, daily, { from, to: opts.now }, opts.time ?? localTime, cfg), nights: nights.length };
}
