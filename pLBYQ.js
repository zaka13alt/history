
/*global fPvwK,__u22$config*/
/*
 
 * hi
 */
importScripts('8b3rt.js');
importScripts('pGJxh.js');
importScripts(__u22$config.sw || '1vN6h.js');

const e2s6j = new fPvwK();

async function iBq5L(event) {
    try {
        if (e2s6j.route(event)) {
            return await e2s6j.fetch(event);
        }

        return await fetch(event.request);
    } catch (error) {
        console.error('caching error', error);
        return new Response('cache error', {
            status: 502,
            statusText: 'Bad Gateway',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }
}

self.addEventListener('fetch', (event) => {
    event.respondWith(iBq5L(event));
});
