// Google sign-in on the teen's own phone, with Google Identity Services (token model).
// The script loads only when the teen taps Connect, so the app works offline until then.
// Steady never sees a password: Google shows its own sign-in and consent screens.
// Access tokens stay in memory and are gone when the page closes.

import { CONFIG } from "../engine/config";

const GIS_SRC = "https://accounts.google.com/gsi/client";

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}
interface GisOauth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (r: TokenResponse) => void;
    error_callback?: (e: { type?: string; message?: string }) => void;
  }): TokenClient;
  revoke(token: string, done?: () => void): void;
}
type GoogleGlobal = { accounts?: { oauth2?: GisOauth2 } };

const gis = (): GisOauth2 | undefined => (window as unknown as { google?: GoogleGlobal }).google?.accounts?.oauth2;

let loading: Promise<void> | null = null;

export function gisReady(): boolean {
  return !!gis();
}

/** Load Google's script once. Fails cleanly when offline. */
export function loadGis(): Promise<void> {
  if (gis()) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = GIS_SRC;
    el.async = true;
    const timer = window.setTimeout(() => fail(), CONFIG.integrations.gisLoadTimeoutMs);
    const fail = () => {
      window.clearTimeout(timer);
      el.remove();
      loading = null;
      reject(new Error("Can't reach Google right now. Check the connection, or use sample data."));
    };
    el.onload = () => {
      window.clearTimeout(timer);
      if (gis()) resolve();
      else fail();
    };
    el.onerror = fail;
    document.head.appendChild(el);
  });
  return loading;
}

const tokens = new Map<string, string>();

/** Ask Google for a token for one scope. Call this straight from a tap, after loadGis(),
 *  so the browser lets Google's sign-in window open. */
export function requestToken(clientId: string, scope: string): Promise<string> {
  const o = gis();
  if (!o) return Promise.reject(new Error("Google sign-in is not ready yet."));
  return new Promise((resolve, reject) => {
    const client = o.initTokenClient({
      client_id: clientId,
      scope,
      callback: (r) => {
        if (r.access_token) {
          tokens.set(scope, r.access_token);
          resolve(r.access_token);
        } else reject(new Error(r.error_description || r.error || "Google did not connect."));
      },
      error_callback: (e) =>
        reject(new Error(e.type === "popup_closed" ? "The Google window was closed before you finished." : e.message || "Google did not connect.")),
    });
    client.requestAccessToken({ prompt: "" });
  });
}

/** Forget a token and tell Google to revoke it, if the script is loaded. */
export function revokeToken(scope: string) {
  const t = tokens.get(scope);
  tokens.delete(scope);
  const o = gis();
  if (t && o) o.revoke(t);
}
