// The page sign-in windows come back to (Microsoft and Fitbit). It passes the result to the
// Stability page that opened it and closes. Nothing is stored here.

const params = new URLSearchParams(window.location.search || window.location.hash.slice(1));
const state = params.get("state") ?? "";

if (state.startsWith("steadyfb.")) {
  // Fitbit (PKCE): hand the one-time code to the opener, which swaps it for a token.
  const ch = new BroadcastChannel("steady-oauth");
  ch.postMessage({ provider: "fitbit", state, code: params.get("code"), error: params.get("error_description") ?? params.get("error") });
  ch.close();
  window.close();
} else {
  // Microsoft (MSAL): MSAL's own bridge passes the response back.
  import("@azure/msal-browser/redirect-bridge")
    .then(({ broadcastResponseToMainFrame }) => broadcastResponseToMainFrame())
    .catch(() => window.close());
}
