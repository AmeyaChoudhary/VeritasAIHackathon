// Steady's service worker: keeps the app's own files so it opens and runs with no network.
// Nothing here sends data anywhere. It only answers requests for this app's files.
const CACHE = "steady-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./models/tone.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Only this app's own files. Sign-in and account requests go straight to the network.
  if (req.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith(new URL("./", self.location).pathname)) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: req.mode === "navigate" });
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit || (req.mode === "navigate" ? cache.match("./index.html") : Response.error()));
      return hit || fresh;   // show what we have at once, and refresh it in the background
    }),
  );
});
