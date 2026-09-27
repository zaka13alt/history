import { wispurr } from "wispurr";
import { createServer } from "node:http";

const baseConfig = {
	port: 6001,
	allowTCP: true,
	allowUDP: true,
	allowDirectIP: true,
	allowPrivateIPs: false,
	allowLoopbackIPs: false,
	tcpBufferSize: 1048576,
	socketBufferSize: 33554432,
	pendingQueueSize: 268435456,
	bufferRemainingLength: 32768,
	tcpNoDelay: true,
	blacklist: { hostnames: {}, ports: {} },
	whitelist: { hostnames: {}, ports: {} },
	websocketPermessageDeflate: false,
	dnsServers: [],
	dnsMethod: "resolve",
	dnsResultOrder: "ipv4first",
	enableTwisp: false,
	enableV2: true,
	handshakeTimeoutSeconds: 10,
	motd: "",
	passwordAuth: false,
	passwordAuthRequired: false,
	passwordUsers: {},
	parseRealIP: true,
	trustedProxies: ["127.0.0.1"],
	trustedHeaders: ["CF-Connecting-IP", "X-Forwarded-For"],
	nonWSResponse: "404 not found",
	logLevel: "error",
	maxMessageSize: 1048581,
	staticDir: "",
	bandwidthLimitKbps: 0,
	connectionsLimitPerIP: 0,
	connectionWindowSeconds: 0,
	floodProtection: {
		enabled: false,
		maxConnectsPerSourceIPPerSecond: 0,
		maxConnectsPerDestPerSecond: 0,
		maxConnectsPerDestPerMinute: 0,
		maxInFlightSyns: 0,
		maxConcurrentStreamsPerConnection: 0,
		maxConcurrentConnections: 0,
		synFloodSignature: {
			enabled: false,
			windowMs: 2000,
			minSamples: 32,
			failedHandshakeRatio: 0.75
		},
		wsCloseAfterViolations: 0,
		logBlockedDials: false
	},
	reputation: {
		enabled: false,
		storePath: "./data/wispurr-reputation.json",
		saveIntervalSeconds: 30,
		scoreDecayPerHour: 1,
		evictAfterDays: 7,
		thresholds: { warn: 21, throttle: 51, strict: 81 },
		weights: {},
		destinationWeights: {}
	}
};

// Pool 1: direct, no proxy — used for /np/
const wispDirect = new wispurr({ ...baseConfig, port: 6001 });

// Pool 2: everything else — goes through the SOCKS proxy
const wispProxied = new wispurr({
	...baseConfig,
	port: 6101, // different base port so the two pools don't collide
	proxy: "socks5://127.0.0.1:35344",
});

await wispDirect.start(4);
await wispProxied.start(4);

const server = createServer();
server.on("upgrade", (req, socket, head) => {
	if (req.url && req.url.startsWith("/np/")) {
		wispDirect.route(req, socket, head);
	} else {
		wispProxied.route(req, socket, head);
	}
});
server.listen(3000);
