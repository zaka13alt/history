import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";

// Account storage for the chat. Passwords are never stored in plaintext: each
// user gets a random salt and a scrypt-derived hash, persisted to users.json.
// Sessions (token -> username) live in memory and expire; a restart logs
// everyone out but accounts remain.
const scryptAsync = promisify(scrypt);
const USERS_FILE = new URL("./users.json", import.meta.url);
const KEYLEN = 64;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 4096;
const USERNAME_RE = /^[A-Za-z0-9_-]{3,24}$/;
const PW_MIN = 6;
const PW_MAX = 128;
const RATE_WINDOW_MS = 60000;
const RATE_MAX = 20;

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { reject(new Error("too large")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function derive(password, salt) {
  return (await scryptAsync(password, salt, KEYLEN)).toString("hex");
}

export function createAuth() {
  let users = {};
  try {
    const parsed = JSON.parse(readFileSync(USERS_FILE, "utf8"));
    if (parsed && typeof parsed === "object") users = parsed;
  } catch { /* no users yet */ }

  let writeTimer = null;
  const persist = () => {
    if (writeTimer) return;
    writeTimer = setTimeout(() => {
      writeTimer = null;
      try { writeFileSync(USERS_FILE, JSON.stringify(users)); }
      catch (e) { console.error("auth: failed to persist users:", e.message); }
    }, 300);
    writeTimer.unref?.();
  };

  const sessions = new Map();
  const issueToken = (username) => {
    const token = randomBytes(32).toString("hex");
    sessions.set(token, { username, expires: Date.now() + SESSION_TTL_MS });
    return token;
  };
  const verifyToken = (token) => {
    if (!token) return null;
    const s = sessions.get(token);
    if (!s) return null;
    if (s.expires < Date.now()) { sessions.delete(token); return null; }
    return s.username;
  };

  const attempts = new Map();
  const throttled = (ip) => {
    const now = Date.now();
    const a = (attempts.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
    a.push(now);
    attempts.set(ip, a);
    return a.length > RATE_MAX;
  };

  async function handleHttp(req, res) {
    const { pathname } = new URL(req.url, "http://localhost");
    const isSignup = pathname === "/chat/signup" || pathname === "/chat/signup/";
    const isLogin = pathname === "/chat/login" || pathname === "/chat/login/";
    const isLogout = pathname === "/chat/logout" || pathname === "/chat/logout/";
    if (!isSignup && !isLogin && !isLogout) return false;

    if (req.method !== "POST") { res.setHeader("Allow", "POST"); send(res, 405, { ok: false, error: "Method not allowed" }); return true; }

    let data;
    try { data = JSON.parse(await readBody(req)); }
    catch { send(res, 400, { ok: false, error: "Bad request" }); return true; }

    if (isLogout) {
      if (data && data.token) sessions.delete(String(data.token));
      send(res, 200, { ok: true });
      return true;
    }

    const ip = (req.headers["x-real-ip"] || req.socket.remoteAddress || "").toString();
    if (throttled(ip)) { send(res, 429, { ok: false, error: "Too many attempts, slow down." }); return true; }

    const username = String((data && data.username) ?? "").trim();
    const password = String((data && data.password) ?? "");
    if (!USERNAME_RE.test(username)) { send(res, 400, { ok: false, error: "Username must be 3-24 letters, numbers, _ or -." }); return true; }
    if (password.length < PW_MIN || password.length > PW_MAX) { send(res, 400, { ok: false, error: "Password must be " + PW_MIN + "-" + PW_MAX + " characters." }); return true; }

    const key = username.toLowerCase();

    if (isSignup) {
      if (users[key]) { send(res, 409, { ok: false, error: "Username already taken." }); return true; }
      const salt = randomBytes(16).toString("hex");
      users[key] = { username, salt, hash: await derive(password, salt) };
      persist();
      send(res, 200, { ok: true, token: issueToken(username), username });
      return true;
    }

    const rec = users[key];
    let ok = false;
    if (rec) {
      const a = Buffer.from(await derive(password, rec.salt), "hex");
      const b = Buffer.from(rec.hash, "hex");
      ok = a.length === b.length && timingSafeEqual(a, b);
    }
    if (!ok) { send(res, 401, { ok: false, error: "Invalid username or password." }); return true; }
    send(res, 200, { ok: true, token: issueToken(rec.username), username: rec.username });
    return true;
  }

  return { handleHttp, verifyToken };
}
