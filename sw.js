const MERC_NPM = "https://cdn.jsdelivr.net/npm/@mercuryworkshop/";
const MERC_UNPKG = "https://unpkg.com/@mercuryworkshop/";
const SJ_VER = "scramjet@2.0.67-alpha.1";
const CTRL_VER = "scramjet-controller@0.0.13";

importScripts(MERC_UNPKG + CTRL_VER + "/dist/controller.sw.js");

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(clients.claim()));

addEventListener("fetch", (e) => {
  const { pathname } = new URL(e.request.url);

  if (pathname === "/scramjet/scramjet.js") {
    e.respondWith(
      fetch(MERC_NPM + SJ_VER + "/dist/scramjet.js").then((r) => {
        const h = new Headers(r.headers);
        h.set("Access-Control-Allow-Origin", "*");
        h.set("Content-Type", "application/javascript");
        return new Response(r.body, { status: 200, headers: h });
      })
    );
    return;
  }

  if (pathname === "/scramjet/scramjet.wasm") {
    e.respondWith(
      fetch(MERC_NPM + SJ_VER + "/dist/scramjet.wasm").then(
        (r) =>
          new Response(r.body, {
            status: 200,
            headers: {
              "Content-Type": "application/wasm",
              "Access-Control-Allow-Origin": "*",
            },
          })
      )
    );
    return;
  }

  if (pathname === "/controller/controller.inject.js") {
    e.respondWith(
      fetch(MERC_UNPKG + CTRL_VER + "/dist/controller.inject.js").then((r) => {
        const h = new Headers(r.headers);
        h.set("Access-Control-Allow-Origin", "*");
        h.set("Content-Type", "application/javascript");
        return new Response(r.body, { status: 200, headers: h });
      })
    );
    return;
  }

  if ($scramjetController.shouldRoute(e)) {
    e.respondWith($scramjetController.route(e));
  }
});
