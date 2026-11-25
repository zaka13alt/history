"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3002;
const HOST = "127.0.0.1";
const CACHE_FILE = path.join(__dirname, "ipgate-cache.json");
const DC_FILE = path.join(__dirname, "dc-ranges.json");
const SEED_FILE = path.join(__dirname, "dc-seed.txt");
const POS_TTL = 14 * 24 * 3600 * 1000;
const NEG_TTL = 2 * 24 * 3600 * 1000;
const SELF_IP = "135.148.218.234";
const DC_REFRESH_MS = 24 * 3600 * 1000;
const DC_SOURCES = [
  "https://ip-ranges.amazonaws.com/ip-ranges.json",
  "https://www.gstatic.com/ipranges/cloud.json",
  "https://www.gstatic.com/ipranges/goog.json",
  "https://www.cloudflare.com/ips-v4",
  "https://www.cloudflare.com/ips-v6",
  "https://docs.oracle.com/en-us/iaas/tools/public_ip_ranges.json",
  "https://api.fastly.com/public-ip-list",
  "https://digitalocean.com/geo/google.csv",
  "https://geoip.linode.com/",
  "https://geofeed.constant.com/",
];

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

const providers = [
  {
    name: "ip-api", perMin: 40, perDay: 0, times: [], day: 0, dayCount: 0,
    url: (ip) => "http://ip-api.com/json/" + encodeURIComponent(ip) + "?fields=status,hosting,proxy",
    parse: (j) => (j && j.status === "success") ? !!(j.hosting || j.proxy) : null,
  },
  {
    name: "proxycheck", perMin: 6, perDay: 90, times: [], day: 0, dayCount: 0,
    url: (ip) => "https://proxycheck.io/v2/" + encodeURIComponent(ip) + "?vpn=1&asn=1",
    parse: (j, ip) => {
      const o = j && j[ip];
      if (!o || typeof o !== "object") return null;
      if (o.proxy === "yes") return true;
      if (/host|data ?cent/i.test(o.type || "")) return true;
      if (o.proxy === "no") return false;
      return null;
    },
  },
];

async function queryProvider(pv, ip) {
  const now = Date.now();
  pv.times = pv.times.filter((t) => now - t < 60000);
  if (pv.times.length >= pv.perMin) return null;
  if (pv.perDay) {
    const d = Math.floor(now / 86400000);
    if (d !== pv.day) { pv.day = d; pv.dayCount = 0; }
    if (pv.dayCount >= pv.perDay) return null;
  }
  pv.times.push(now);
  if (pv.perDay) pv.dayCount++;
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(pv.url(ip), { signal: ctl.signal, headers: { "User-Agent": "ipgate" } });
    clearTimeout(to);
    if (r.status === 429) return null;
    const j = await r.json();
    const v = pv.parse(j, ip);
    return (v === true || v === false) ? v : null;
  } catch (e) {
    return null;
  }
}

const pending = new Map();
async function classify(ip) {
  const c = cache.get(ip);
  if (c && c.exp > Date.now()) return c.hosting;
  if (pending.has(ip)) return pending.get(ip);
  const p = (async () => {
    for (const pv of providers) {
      const r = await queryProvider(pv, ip);
      if (r === true || r === false) {
        cache.set(ip, { hosting: r, exp: Date.now() + (r ? POS_TTL : NEG_TTL) });
        dirty = true;
        return r;
      }
    }
    return dcHit(ip);
  })();
  pending.set(ip, p);
  try { return await p; } finally { pending.delete(ip); }
}

let dc4 = [];
let dc6 = [];

function ip4ToInt(s) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  let n = 0;
  for (let i = 1; i <= 4; i++) { const o = +m[i]; if (o > 255) return null; n = n * 256 + o; }
  return n >>> 0;
}
function ip6ToBig(s) {
  s = s.trim();
  if (s.indexOf(":") === -1) return null;
  const dbl = s.split("::");
  if (dbl.length > 2) return null;
  const left = dbl[0] === "" ? [] : dbl[0].split(":");
  const right = dbl.length === 2 ? (dbl[1] === "" ? [] : dbl[1].split(":")) : null;
  let groups;
  if (right === null) { groups = left; if (groups.length !== 8) return null; }
  else { const miss = 8 - left.length - right.length; if (miss < 1) return null; groups = left.concat(Array(miss).fill("0")).concat(right); }
  if (groups.length !== 8) return null;
  let n = 0n;
  for (const g of groups) { if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null; n = (n << 16n) | BigInt(parseInt(g, 16)); }
  return n;
}
function addToken(tok, raw4, raw6) {
  tok = tok.trim();
  if (!tok || tok[0] === "#") return;
  if (tok.indexOf(":") >= 0) {
    const sl = tok.split("/");
    const mask = sl[1] === undefined ? 128 : +sl[1];
    if (!(mask >= 0 && mask <= 128)) return;
    const b = ip6ToBig(sl[0]);
    if (b === null) return;
    const hostBits = 128n - BigInt(mask);
    const start = (b >> hostBits) << hostBits;
    const end = start + ((1n << hostBits) - 1n);
    raw6.push([start, end]);
  } else {
    const sl = tok.split("/");
    const mask = sl[1] === undefined ? 32 : +sl[1];
    if (!(mask >= 0 && mask <= 32)) return;
    const b = ip4ToInt(sl[0]);
    if (b === null) return;
    const hostBits = 32 - mask;
    const start = (hostBits >= 32 ? 0 : (b >>> hostBits) << hostBits) >>> 0;
    const end = (start + (hostBits >= 32 ? 0xffffffff : (1 << hostBits) - 1)) >>> 0;
    raw4.push([start, end]);
  }
}
function buildRanges(raw) {
  raw.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const out = [];
  for (const r of raw) {
    if (out.length) {
      const last = out[out.length - 1];
      const adj = typeof r[0] === "bigint" ? last[1] + 1n : last[1] + 1;
      if (r[0] <= adj) { if (r[1] > last[1]) last[1] = r[1]; continue; }
    }
    out.push([r[0], r[1]]);
  }
  return out;
}
function inRanges(ranges, x) {
  let lo = 0, hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = ranges[mid];
    if (x < r[0]) hi = mid - 1;
    else if (x > r[1]) lo = mid + 1;
    else return true;
  }
  return false;
}
function dcHit(ip) {
  if (!ip) return false;
  if (ip.indexOf(":") >= 0) { const b = ip6ToBig(ip); return b === null ? false : inRanges(dc6, b); }
  const n = ip4ToInt(ip);
  return n === null ? false : inRanges(dc4, n);
}
function buildFromTokens(tokens) {
  const raw4 = [], raw6 = [];
  for (const t of tokens) addToken(t, raw4, raw6);
  dc4 = buildRanges(raw4);
  dc6 = buildRanges(raw6);
}
function persistDc() {
  try {
    const obj = { ts: Date.now(), v4: dc4, v6: dc6.map((r) => [r[0].toString(), r[1].toString()]) };
    fs.writeFileSync(DC_FILE, JSON.stringify(obj));
  } catch (e) {}
}
function readSeedTokens() {
  try { return fs.readFileSync(SEED_FILE, "utf8").split(/\r?\n/); } catch (e) { return []; }
}

const V4_RE = /(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?/g;
const V6_RE = /(?:[0-9a-fA-F]{0,4}:){2,}[0-9a-fA-F]{0,4}(?:\/\d{1,3})?/g;
async function fetchTokens(url) {
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 15000);
    const r = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "ipgate-dc-sync" } });
    clearTimeout(to);
    if (!r.ok) return [];
    const text = await r.text();
    const out = [];
    const m4 = text.match(V4_RE); if (m4) for (const x of m4) out.push(x);
    const m6 = text.match(V6_RE); if (m6) for (const x of m6) out.push(x);
    return out;
  } catch (e) { return []; }
}
let refreshing = false;
async function refreshDc() {
  if (refreshing) return;
  refreshing = true;
  try {
    let tokens = readSeedTokens();
    const results = await Promise.all(DC_SOURCES.map(fetchTokens));
    for (const arr of results) tokens = tokens.concat(arr);
    if (tokens.length) {
      buildFromTokens(tokens);
      persistDc();
      console.log("ipgate dc index: " + dc4.length + " v4 + " + dc6.length + " v6 ranges from " + tokens.length + " tokens");
    }
  } finally { refreshing = false; }
}

(function initDc() {
  const seed = readSeedTokens();
  if (seed.length) buildFromTokens(seed);
  let age = Infinity;
  try {
    const o = JSON.parse(fs.readFileSync(DC_FILE, "utf8"));
    if (o && Array.isArray(o.v4) && Array.isArray(o.v6)) {
      const p4 = o.v4.map((r) => [r[0] >>> 0, r[1] >>> 0]);
      const p6 = o.v6.map((r) => [BigInt(r[0]), BigInt(r[1])]);
      dc4 = buildRanges(dc4.concat(p4));
      dc6 = buildRanges(dc6.concat(p6));
      age = Date.now() - (o.ts || 0);
    }
  } catch (e) {}
  if (age > DC_REFRESH_MS) setTimeout(refreshDc, 3000);
})();
setInterval(refreshDc, DC_REFRESH_MS).unref();

function isLocal(ip) {
  if (!ip) return true;
  if (ip === SELF_IP) return true;
  if (ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
  return false;
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/healthz") { res.writeHead(200); res.end("ok cache=" + cache.size + " dc4=" + dc4.length + " dc6=" + dc6.length); return; }
  let ip = (req.headers["x-real-client-ip"] || "").trim();
  if (!ip) ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  if (!ip) ip = (u.searchParams.get("ip") || "").trim();
  if (isLocal(ip)) { res.writeHead(204); res.end(); return; }
  let hosting = false;
  try { hosting = await classify(ip); } catch (e) { hosting = false; }
  if (hosting) { res.writeHead(204, { "X-Zk-Decoy": "1" }); res.end(); }
  else { res.writeHead(204); res.end(); }
}).listen(PORT, HOST, () => console.log("ipgate listening on " + HOST + ":" + PORT));
