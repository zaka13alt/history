importScripts("/study.js");

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(clients.claim()));

addEventListener("fetch", (e) => {
  if ($educationlaunch.shouldRoute(e)) {
    e.respondWith($educationlaunch.route(e));
  }
});
