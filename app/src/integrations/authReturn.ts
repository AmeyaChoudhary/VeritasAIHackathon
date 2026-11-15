// The script of auth.html, the page sign-in windows come back to. Spotify's answer is passed to
// the Stability page that opened the window, and the window closes. Microsoft and Fitbit answers
// go on to src/auth/redirect.ts. Nothing is stored here.

import { OAUTH_CHANNEL, SPOTIFY_STATE_PREFIX } from "./spotifyAuth";

const params = new URLSearchParams(window.location.search || window.location.hash.slice(1));
const state = params.get("state") ?? "";

if (state.startsWith(SPOTIFY_STATE_PREFIX)) {
  // The one-time code is read above; take it out of the address and the window's history.
  window.history.replaceState(null, "", window.location.pathname);
  const ch = new BroadcastChannel(OAUTH_CHANNEL);
  ch.postMessage({ provider: "spotify", state, code: params.get("code"), error: params.get("error") });
  ch.close();
  window.close();
} else {
  // redirect.ts is a plain script with no exports; importing it runs it.
  // @ts-expect-error TS2306: not a module, which is fine for a side-effect import.
  void import("../auth/redirect");
}
