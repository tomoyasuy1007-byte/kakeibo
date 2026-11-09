// オフラインでも開けるようにアプリのファイルを保存しておく。
// ファイルを更新したら VERSION を上げる。
const VERSION = "kakeibo-v3";
const FILES = ["./", "./index.html", "./manifest.json", "./apple-touch-icon.png", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});

// ネットにつながるときは最新版を取り、つながらないときは保存版を使う
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
