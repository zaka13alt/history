// Base-aware service worker for static.html. importScripts resolves relative to
// this file's location, and routing uses the controller prefix (BASE + nZ970vr4/),
// so the whole thing works under any path the bundle is served from.
importScripts('stuff/LyzaHBeO/WBv0kYC0.js');

addEventListener('fetch', (event) => {
  if ($K4q9p2XvController.shouldRoute(event)) {
    event.respondWith($K4q9p2XvController.route(event));
  }
});
