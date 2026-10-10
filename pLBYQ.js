
/*global fPvwK,__u22$config*/
/*
 
 * hi
 */
importScripts('8b3rt.js');
importScripts('pGJxh.js');
importScripts(__u22$config.sw || '1vN6h.js');

const e2s6j = new fPvwK();

// Minimal adult-only blocklist
const blockedKeywords = __u22$config.theBadKeywords; // Add more domains if needed

// Utility: check if a URL/host should be blocked
function isBlocked(host, fullUrl) {
  return blockedKeywords.some(
    (keyword) => host.includes(keyword) || fullUrl.includes(keyword)
  );
}

async function handleRequest(event) {
  const url = event.request.url;
  const prefix = self.__u22$config.prefix;

  if (url.startsWith(location.origin + prefix)) {
    const encoded = url.slice((location.origin + prefix).length);
    const decoded = self.__u22$config.decodeUrl(encoded);
    const href = new URL(decoded).href;
    const host = new URL(decoded).hostname;

    if (isBlocked(host, decoded)) {
      // 
      return new Response(
        `
        <!doctype html><html lang="en"><meta charset="UTF-8"><meta content="width=device-width,initial-scale=1" name="viewport"><title>bro...</title><style>body{background-color:#000;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;font-family:sans-serif}h1{color:#fff;margin:0;font-size:2rem}</style><h1>gooner detected bro get a life and touch some grass and if you go to my school deadass i might tell the teacher but idk...</h1>
        `,
        { status: 404, headers: { "Content-Type": "text/html" } }
      );
    }
  }

  // 
  if (e2s6j.route(event)) return await e2s6j.fetch(event);
  return await fetch(event.request);
}

self.addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event));
});
