// ChoreHeroes service worker.
// - Network-first for HTML/JS/CSS so users always get the latest deployed code.
// - Cache-first for everything else (images, fonts, icons) so repeat loads are fast.
// Bump the CACHE_NAME on every release to invalidate stale caches.
const CACHE_NAME = "choreheroes-v2-2";

const SHELL = ["/", "/manifest.webmanifest", "/icons/icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Only intercept same-origin requests; let cross-origin (Firebase APIs,
  // Stripe, fonts.googleapis.com) hit the network normally.
  if (url.origin !== self.location.origin) return;

  // Network-first for HTML/JS/CSS — never serve stale code.
  if (
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname === "/" ||
    url.pathname === ""
  ) {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const clone = r.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          return r;
        })
        .catch((err) => {
          console.warn("[sw] network fetch failed, falling back to cache:", url.pathname, err.message);
          return caches.match(e.request);
        })
    );
    return;
  }

  // Cache-first for everything else (images, fonts, icons).
  e.respondWith(
    caches.match(e.request).then(
      (cached) =>
        cached ||
        fetch(e.request)
          .then((r) => {
            if (r.ok) {
              caches.open(CACHE_NAME).then((c) => c.put(e.request, r.clone()));
            }
            return r;
          })
          .catch((err) => {
            console.warn("[sw] asset fetch failed, falling back to index.html:", url.pathname, err.message);
            return caches.match("/index.html");
          })
    )
  );
});
