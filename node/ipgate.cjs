"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3002;
const HOST = "127.0.0.1";
const CACHE_FILE = path.join(__dirname, "ipgate-cache.json");
const POS_TTL = 14 * 24 * 3600 * 1000;
const NEG_TTL = 2 * 24 * 3600 * 1000;
const API_BUDGET = 40;
const SELF_IP = "135.148.218.234";

const cache = new Map();
try {
  const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  const now = Date.now();
  for (const k in raw) if (raw[k].exp > now) cache.set(k, raw[k]);
} catch (e) {}


let dirty = false;
setInterval(() => {
  if (!dirty) return;
  dirty = false;
  const now = Date.now();
  const obj = {};
  for (const [k, v] of cache) if (v.exp > now) obj[k] = v;
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(obj)); } catch (e) {}
}, 60000).unref();

let apiTimes = [];
const pending = new Map();

function isLocal(ip) {
  if (!ip) return true;
  if (ip === SELF_IP) return true;
  if (ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
  return false;
}

async function classify(ip) {
  const c = cache.get(ip);
  if (c && c.exp > Date.now()) return c.hosting;
  if (pending.has(ip)) return pending.get(ip);
  const p = (async () => {
    const now = Date.now();
    apiTimes = apiTimes.filter((t) => now - t < 60000);
    if (apiTimes.length >= API_BUDGET) return false;
    apiTimes.push(now);
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch("http://ip-api.com/json/" + encodeURIComponent(ip) + "?fields=status,hosting,proxy", { signal: ctl.signal });
      clearTimeout(to);
      const j = await r.json();
      if (j.status !== "success") return false;
      const hosting = !!(j.hosting || j.proxy);
      cache.set(ip, { hosting, exp: Date.now() + (hosting ? POS_TTL : NEG_TTL) });
      dirty = true;
      return hosting;
    } catch (e) {
      return false;
    }
  })();
  pending.set(ip, p);
  try { return await p; } finally { pending.delete(ip); }
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/healthz") { res.writeHead(200); res.end("ok " + cache.size); return; }
  let ip = (req.headers["x-real-client-ip"] || "").trim();
  if (!ip) ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  if (!ip) ip = (u.searchParams.get("ip") || "").trim();
  if (isLocal(ip)) { res.writeHead(204); res.end(); return; }
  let hosting = false;
  try { hosting = await classify(ip); } catch (e) { hosting = false; }
  if (hosting) { res.writeHead(204, { "X-Zk-Decoy": "1" }); res.end(); }
  else { res.writeHead(204); res.end(); }
}).listen(PORT, HOST, () => console.log("ipgate listening on " + HOST + ":" + PORT));
