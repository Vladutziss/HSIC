// Molted service worker: installable shell + offline page + push notifications, nothing more.
// User data never touches a cache: only same-origin GET requests for the built static files
// (/assets/*, icons) and the offline page are stored; everything else goes straight to the network.
// Bump VERSION to drop the old cache on the next activate.

const VERSION = "molted-v1";
const SHELL = ["/offline.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"];
const STATIC = /^\/(assets\/|icons\/)/;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Clerk, Supabase, fonts: always the network

  if (req.mode === "navigate") {
    // network first; the page itself is never cached, so a stale (or someone else's) screen cannot be served
    e.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }

  if (STATIC.test(url.pathname) || SHELL.includes(url.pathname)) {
    // build files are content-hashed, so cache first is safe
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
  }
});

// Push: the server (supabase/functions/push) sends {title, body, url, tag}. Shown as they come; a tap focuses
// an open Molted window or opens one.
self.addEventListener("push", (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    data = { body: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    self.registration.showNotification(data.title || "Molted", {
      body: data.body || "",
      tag: data.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/favicon-32.png",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => new URL(w.url).origin === self.location.origin);
      return open ? open.focus() : self.clients.openWindow(url);
    })
  );
});
