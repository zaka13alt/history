import { EpoxyServer } from "epoxy-server-node";
import { createServer } from "node:http";
import { connect } from "node:net";
import { readFileSync } from "node:fs";
import { createUseCounter } from "./use.js";
import { handlePasswordVerify } from "./password.js";

const userConfig = JSON.parse(
  readFileSync(new URL("./config.json", import.meta.url), "utf8")
);

// epoxy-server listens on 127.0.0.1:6001; the main app on :3000 forwards
// /wisp/ WebSocket upgrades to it.
const EPOXY_HOST = "127.0.0.1";
const EPOXY_PORT = 6001;
const APP_PORT = 3000;

const wisp = new EpoxyServer({
  ...userConfig,
  host: EPOXY_HOST,
  port: EPOXY_PORT,
  prefix: "/wisp",
  socks5: "socks5://127.0.0.1:35344", // no auth
  useRealIpHeaders: true, // log the real client IP we pass along
  logLevel: "error", // only errors are printed (to stderr)
});
try {
  await wisp.listen();
} catch (err) {
  console.error("epoxy failed to start:", err.message);
  process.exit(1);
}

function routeToEpoxy(req, socket, head) {
  const upstream = connect(EPOXY_PORT, EPOXY_HOST);
  const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    if (/^x-(real-ip|forwarded-for)$/i.test(req.rawHeaders[i])) continue;
    lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
  }
  lines.push(`X-Real-IP: ${socket.remoteAddress}`);
  upstream.write(lines.join("\r\n") + "\r\n\r\n");
  if (head?.length) upstream.write(head);
  socket.pipe(upstream).pipe(socket);
  const close = () => { socket.destroy(); upstream.destroy(); };
  upstream.on("error", (err) => {
    // resets/broken pipes are normal disconnects; anything else means epoxy is unreachable
    if (err.code !== "ECONNRESET" && err.code !== "EPIPE") console.error("epoxy forward error:", err.message);
    close();
  });
  socket.on("error", close);
}

const useCounter = createUseCounter();

const server = createServer(async (req, res) => {
  if (await handlePasswordVerify(req, res)) return;
  res.writeHead(426, { Upgrade: "websocket", Connection: "Upgrade" });
  res.end();
});
server.on("upgrade", (req, socket, head) => {
  if (useCounter.handleUpgrade(req, socket, head)) return;
  if (req.url.startsWith("/wisp/")) return routeToEpoxy(req, socket, head);
  socket.destroy();
});
server.on("error", (err) => {
  console.error("app server error:", err.message);
  process.exit(1);
});
server.listen(APP_PORT);

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    server.close();
    await wisp.close();
    process.exit(0);
  });
}
