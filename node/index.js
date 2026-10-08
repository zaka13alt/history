import { wispurr } from "wispurr";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const userConfig = JSON.parse(
  readFileSync(new URL("./config.json", import.meta.url), "utf8")
);

const wisp = new wispurr(userConfig);
console.log(wisp.config); // sanity check: your values should show up here
await wisp.start(4);

const server = createServer();
server.on("upgrade", (req, socket, head) => wisp.route(req, socket, head));
server.listen(3000);
