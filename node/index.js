import { wispurr } from "wispurr";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

// 1. Read your config.json
const userConfig = JSON.parse(readFileSync("dist/config.json", "utf8"));

// 2. Pass it into the constructor (merged onto dist/config.json defaults)
const wisp = new wispurr(userConfig);

// 3. Spawn workers
await wisp.start(4);

const server = createServer();
server.on("upgrade", (req, socket, head) => wisp.route(req, socket, head));
server.listen(3000);
