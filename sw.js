// Service worker Hai Goma CRM.
// Aturan: data chat/booking TIDAK pernah di-cache (selalu langsung ke server).
// Hanya halaman & ikon yang disimpan, supaya aplikasi tetap terbuka walau sinyal jelek.
const CACHE = "goma-crm-shell-v3";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/badge-96.png", "/bell.wav"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API Worker, WhatsApp, dll: lewatkan

  // Halaman: ambil yang terbaru dulu, cadangan dari cache bila offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put("/", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/").then(r => r || Response.error()))
    );
    return;
  }

  // Ikon & manifest: cache dulu.
  if (/\.(png|webmanifest|ico|wav)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }))
    );
  }
});

// ---------- Notifikasi chat baru (Web Push) ----------
self.addEventListener("push", event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; }
  catch (_) { d = { title: "Goma CRM", body: event.data ? event.data.text() : "Pesan baru" }; }
  event.waitUntil((async () => {
    // Bila CRM sedang terbuka di layar, tidak perlu menampilkan notifikasi lagi
    // (kecuali iPhone/iPad, yang mewajibkan setiap push tampil).
    const apple = /iPhone|iPad|iPod|Macintosh/i.test(self.navigator.userAgent || "");
    if (!apple) {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = wins.filter(w => w.visibilityState === "visible" && w.focused);
      if (open.length) {
        open.forEach(w => w.postMessage({ type: "ring", chatId: d.chatId == null ? null : d.chatId }));
        return;
      }
    }
    await self.registration.showNotification(d.title || "Goma CRM", {
      body: d.body || "Pesan baru",
      tag: d.tag || undefined,
      renotify: Boolean(d.tag),
      icon: "/icon-192.png",
      badge: "/badge-96.png",
      data: { chatId: d.chatId == null ? null : d.chatId }
    });
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const id = event.notification.data ? event.notification.data.chatId : null;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (wins.length) {
      const w = wins[0];
      try { await w.focus(); } catch (_) {}
      if (id != null) w.postMessage({ type: "open-chat", chatId: id });
      return;
    }
    await self.clients.openWindow(id != null ? "/#chat=" + id : "/");
  })());
});
