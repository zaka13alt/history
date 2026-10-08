
importScripts("./.assets/index-t6p2d8.js");
importScripts("/h.js");

const blockedKeywords = _c.theBadKeywords;

self.addEventListener("activate", (event) => {
	event.waitUntil(clients.claim());
});

function isBlocked(host, fullUrl) {
	return blockedKeywords.some(
		(keyword) =>
			host.includes(keyword) ||
			fullUrl.includes(keyword)
	);
}

async function handleRequest(event) {
	const url = event.request.url;

	// URL format:
	// /bootstrap/{controllerId}/{frameId}/{encodedUrl}
	// Example:
	// /bootstrap/assetswcptnsl0/25ei521o/https%3A%2F%2Fexample.com
	const match = new URL(url).pathname.match(
		/^\/bootstrap\/[a-z0-9]+\/[a-z0-9]+\/(.*)$/i
	);

	if (match) {
		try {
			const decoded = decodeURIComponent(match[1]);
			const parsedUrl = new URL(decoded);

			const href = parsedUrl.href;
			const host = parsedUrl.hostname;

			if (isBlocked(host, href)) {
				return new Response(
					"gooner detected bro get a life and touch some grass and if you go to my school deadass i might tell the teacher but idk...",
					{
						status: 403,
						headers: {
							"Content-Type": "text/html; charset=utf-8",
							"Cross-Origin-Embedder-Policy": "require-corp"
						}
					}
				);
			}
		} catch (e) {
			// URL parsing failed; let the request through.
		}
	}

	return dGFzazR6MTMzNw.route(event);
}

self.addEventListener("fetch", (event) => {
	if (dGFzazR6MTMzNw.shouldRoute(event)) {
		event.respondWith(handleRequest(event));
	}
});

