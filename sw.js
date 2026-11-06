const CACHE="incflow-v1-1";
const ASSETS=["./","./index.html","./manifest.json","./icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      // "reload": take the files from GitHub Pages, not from the browser's HTTP cache (kept up to 10 minutes).
      .then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("incflow-") && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  // The spreadsheet (Apps Script) always goes to the network.
  if (new URL(event.request.url).origin !== self.location.origin) return;

  // The page: network first, so a new deployment shows at once.
  if (event.request.mode === "navigate") {
    const key = "./index.html";
    event.respondWith(
      fetch(event.request.url, { cache: "no-cache", credentials: "same-origin" })
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(key, copy));
          }
          return response;
        })
        .catch(() => caches.match(key))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
      return response;
    }))
  );
});
