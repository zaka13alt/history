import { wispurr } from "wispurr";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createUseCounter } from "./use.js";
import { handlePasswordVerify } from "./password.js";

const userConfig = JSON.parse(
  readFileSync(new URL("./config.json", import.meta.url), "utf8")
);

const wisp = new wispurr(userConfig);
console.log(wisp.config); // sanity check: your values should show up here
await wisp.start(4);

const useCounter = createUseCounter();

const server = createServer(async (req, res) => {
  if (await handlePasswordVerify(req, res)) return;
  res.writeHead(426, { Upgrade: "websocket", Connection: "Upgrade" });
  res.end();
});
server.on("upgrade", (req, socket, head) => {
  if (useCounter.handleUpgrade(req, socket, head)) return;
  wisp.route(req, socket, head);
});
server.listen(3000);
