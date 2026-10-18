import { WebSocketServer } from "ws";

const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_SOCKETS_PER_ID = 10;
const PING_INTERVAL_MS = 30000;

// Online users counter. Each browser connects a WebSocket to /use/?id=<client id>
// and receives {"online":N} whenever the number of distinct ids changes. A user is
// online for as long as at least one of their sockets is open.
export function createUseCounter() {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 });
  const users = new Map(); // id -> Set<WebSocket>

  const message = () => JSON.stringify({ online: users.size });
  const broadcast = () => {
    const msg = message();
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(msg);
    }
  };

  wss.on("connection", (ws, id) => {
    let sockets = users.get(id);
    const isNewUser = !sockets;
    if (!sockets) users.set(id, (sockets = new Set()));
    sockets.add(ws);

    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });
    ws.on("error", () => ws.terminate());
    ws.on("close", () => {
      sockets.delete(ws);
      if (sockets.size === 0) {
        users.delete(id);
        broadcast();
      }
    });

    if (isNewUser) broadcast();
    else ws.send(message());
  });

  // Drop connections that vanished without a close frame.
  setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, PING_INTERVAL_MS).unref();

  // Returns true if the upgrade request was for the counter (and was handled).
  function handleUpgrade(req, socket, head) {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== "/use" && url.pathname !== "/use/") return false;

    const id = url.searchParams.get("id");
    if (!id || !ID_RE.test(id) || (users.get(id)?.size ?? 0) >= MAX_SOCKETS_PER_ID) {
      socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
      return true;
    }

    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, id));
    return true;
  }

  return { handleUpgrade };
}
