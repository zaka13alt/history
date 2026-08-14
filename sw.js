importScripts("https://gcore.jsdelivr.net/gh/zaka13alt/english-homework@main/educationlaunch.js");

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(clients.claim()));

addEventListener("fetch", (e) => {
  if ($educationlaunch.shouldRoute(e)) {
    e.respondWith($educationlaunch.route(e));
  }
});
