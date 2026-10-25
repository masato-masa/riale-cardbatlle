// オフラインでも遊べるようにするための Service Worker。
// - ページ（HTML）はネットワーク優先（新しい版をすぐ反映）、つながらなければ保存した版。
// - 名前にハッシュの入った assets/ の絵・音・JS は、一度読めば保存したものを使う（中身が変われば名前も変わる）。
const CACHE = 'rcb-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const url = new URL(req.url);
  if (url.pathname.includes('/assets/')) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone(); // 本体が読まれる前に写しを作る
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r ?? Response.error())),
  );
});
