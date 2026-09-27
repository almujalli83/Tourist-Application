/*
 * Offline listening for the audio guides. Registered only by the audio guide pages (scope
 * /{locale}/audio), so the rest of the site is unaffected.
 * - Pages: network first, the saved copy when offline.
 * - App files (/_next/static, content-hashed): saved copy first.
 * - Tour data: network first, the downloaded copy when offline.
 * - Narration audio: the downloaded copy first (with byte ranges for Safari).
 */
const PAGES = "ta-audio-pages";
const STATIC = "ta-audio-static";
const DATA = "ta-audio-data";
const CLIPS = "ta-audio-clips";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

async function networkFirst(req, cacheName, save) {
  try {
    const res = await fetch(req);
    if (save && res.ok) {
      const c = await caches.open(cacheName);
      await c.put(req, res.clone());
    }
    return res;
  } catch (err) {
    const hit = await caches.match(req, { cacheName, ignoreSearch: req.mode === "navigate" });
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req, cacheName) {
  const hit = await caches.match(req, { cacheName });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(cacheName)).put(req, res.clone());
  return res;
}

async function clip(req) {
  const url = req.url;
  const hit = await caches.match(url, { cacheName: CLIPS });
  if (!hit) return fetch(req);
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "");
  if (!range || (!range[1] && !range[2])) return hit;
  const buf = await hit.arrayBuffer();
  const size = buf.byteLength;
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      "content-type": hit.headers.get("content-type") || "audio/mpeg",
      "content-range": `bytes ${start}-${end}/${size}`,
      "content-length": String(end - start + 1),
      "accept-ranges": "bytes",
    },
  });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") return e.respondWith(networkFirst(req, PAGES, true));
  if (url.pathname.startsWith("/_next/static/")) return e.respondWith(cacheFirst(req, STATIC));
  if (url.pathname.startsWith("/api/audio/clip/")) return e.respondWith(clip(req));
  if (url.pathname.startsWith("/api/audio/tours")) return e.respondWith(networkFirst(req, DATA, true));
});
