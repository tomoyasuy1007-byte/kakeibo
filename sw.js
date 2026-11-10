// オフラインでも開けるようにアプリのファイルを保存しておく。
// ファイルを更新したら VERSION を上げる。
const VERSION = "kakeibo-v8";
const FILES = ["./", "./index.html", "./sync.js", "./firebase-config.js", "./manifest.json",
  "./apple-touch-icon.png", "./icon-192.png", "./icon-512.png"];
// アプリ本体と、読み込むプログラム（文字認識・Firebase）だけを保存する。
// 同期の通信やログインの画面は保存しない。
const CACHE_HOSTS = ["cdn.jsdelivr.net", "www.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" })))));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});

// ネットにつながるときは最新版を取り、つながらないときは保存版を使う
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!(sameOrigin || CACHE_HOSTS.includes(url.hostname))) return;
  if (sameOrigin && url.pathname.startsWith("/__/")) return;  // ログイン用のページ
  e.respondWith(
    // ブラウザの一時保存を使わず、毎回サーバーに新しい版があるか確かめる
    fetch(sameOrigin ? new Request(url.href, { cache: "no-cache" }) : e.request)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
