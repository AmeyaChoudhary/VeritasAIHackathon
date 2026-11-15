// Spotify sign-in: Authorization Code with PKCE in a popup, no client secret. The popup comes back
// to auth.html, which passes the one-time code to this page on a BroadcastChannel; this page swaps
// it for an access token. The token stays in memory for the one read and is then dropped. The
// refresh token Spotify sends is not kept.
//
// Spotify only accepts redirect addresses registered in the app's dashboard, and it does not
// accept "localhost". The registered ones are http://127.0.0.1:5210/auth.html (the dev server) and
// the GitHub Pages copy's app/auth.html.
//
// This file is small on purpose: auth.html loads its constants.

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

/** From app/.env.local (see .env.example). Without it, Spotify is read from the data file only. */
export const SPOTIFY_CLIENT_ID = (env.VITE_SPOTIFY_CLIENT_ID ?? "").trim();

export const SPOTIFY_SCOPES = "user-read-recently-played user-top-read";
export const SPOTIFY_STATE_PREFIX = "steadysp.";
export const OAUTH_CHANNEL = "steady-oauth";
const AUTHORIZE = "https://accounts.spotify.com/authorize";
export const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

export interface Pkce {
  verifier: string;
  challenge: string;
  state: string;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A fresh code verifier (64 characters), its S256 challenge, and a state that names Spotify. */
export async function spotifyPkce(): Promise<Pkce> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const state = `${SPOTIFY_STATE_PREFIX}${b64url(crypto.getRandomValues(new Uint8Array(12)))}`;
  return { verifier, challenge, state };
}

/** auth.html next to the app's own page, with no query or hash. */
export function spotifyRedirectUri(href: string): string {
  return new URL("./auth.html", href).toString();
}

export function spotifyAuthUrl(clientId: string, redirectUri: string, p: { challenge: string; state: string }): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SPOTIFY_SCOPES,
    code_challenge_method: "S256",
    code_challenge: p.challenge,
    redirect_uri: redirectUri,
    state: p.state,
  });
  return `${AUTHORIZE}?${q}`;
}

/** The body of the code-for-token request. PKCE: the verifier stands in for a client secret. */
export function spotifyTokenBody(clientId: string, redirectUri: string, code: string, verifier: string): URLSearchParams {
  return new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier });
}

/** Swap the one-time code for an access token. */
export async function spotifyToken(clientId: string, redirectUri: string, code: string, verifier: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  let r: Response;
  try {
    r = await fetchImpl(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: spotifyTokenBody(clientId, redirectUri, code, verifier),
    });
  } catch {
    throw new Error("Can't reach Spotify right now.");
  }
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
  if (!r.ok || !j.access_token) throw new Error(j.error_description || "Spotify did not connect.");
  return j.access_token;
}

/** Open Spotify's own sign-in. Call it straight from a tap, so the browser allows the window. */
export function spotifySignIn(clientId: string, p: Pkce): Promise<string> {
  const redirectUri = spotifyRedirectUri(window.location.href);
  const win = window.open(spotifyAuthUrl(clientId, redirectUri, p), "steady-spotify", "width=480,height=760");
  if (!win) return Promise.reject(new Error("The browser blocked Spotify's sign-in window."));
  return new Promise((resolve, reject) => {
    const ch = new BroadcastChannel(OAUTH_CHANNEL);
    const timer = window.setTimeout(() => done(new Error("Spotify sign-in took too long.")), 5 * 60 * 1000);
    const done = (err: Error | null, token?: string) => {
      window.clearTimeout(timer);
      ch.close();
      if (err) reject(err);
      else resolve(token as string);
    };
    ch.onmessage = (ev: MessageEvent) => {
      const m = ev.data as { provider?: string; state?: string; code?: string | null; error?: string | null };
      if (m.provider !== "spotify" || m.state !== p.state) return;
      if (!m.code) return done(new Error(m.error === "access_denied" ? "Spotify sign-in was cancelled." : m.error || "Spotify did not connect."));
      spotifyToken(clientId, redirectUri, m.code, p.verifier).then(
        (t) => done(null, t),
        (e: Error) => done(e),
      );
    };
  });
}

/** True when this page's address can't be a Spotify redirect (Spotify refuses "localhost"). */
export function spotifyNeeds127(href: string): boolean {
  try {
    return new URL(href).hostname === "localhost";
  } catch {
    return false;
  }
}
