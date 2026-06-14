const MERC_CDN = 'https://unpkg.com/@mercuryworkshop/';
importScripts(MERC_CDN + "scramjet-controller@0.0.13/dist/controller.sw.js");
addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  "/scramjet/scramjet.wasm"===url.pathname&&e.respondWith(fetch(MERC_CDN + "scramjet@alpha/dist/scramjet.wasm").then(e=>new Response(e.body,{status:200,statusText:"OK",headers:{"Content-Type":"application/wasm","Access-Control-Allow-Origin":"*"}})));
  "/controller/controller.inject.js"===url.pathname&&e.respondWith(fetch(MERC_CDN+"scramjet-controller@0.0.13/dist/controller.inject.js").then(e=>{const t=new Headers(e.headers);return t.set("Access-Control-Allow-Origin","*"),t.set("Content-Type","application/javascript"),new Response(e.body,{status:200,statusText:"OK",headers:t})}));
  ($scramjetController.shouldRoute(e)) && e.respondWith($scramjetController.route(e));
});