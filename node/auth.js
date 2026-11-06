import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";

// Account storage for the chat. Passwords are never stored in plaintext: each
// user gets a random salt and a scrypt-derived hash, persisted to users.json.
// Active sessions are persisted so a server restart does not invalidate logins.
const scryptAsync = promisify(scrypt);
const USERS_FILE = new URL("./users.json", import.meta.url);
const SESSIONS_FILE = new URL("./sessions.json", import.meta.url);
const KEYLEN = 64;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 4096;
const USERNAME_RE = /^[A-Za-z0-9_-]{3,24}$/;
const PW_MIN = 6;
const PW_MAX = 128;

function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
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
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      users = parsed;
    }
  } catch {
    /* no users file yet */
  }

  let writeTimer = null;
  const persistUsers = () => {
    if (writeTimer) return;

    writeTimer = setTimeout(() => {
      writeTimer = null;
      try {
        writeFileSync(USERS_FILE, JSON.stringify(users));
      } catch (e) {
        console.error("auth: failed to persist users:", e.message);
      }
    }, 300);

    writeTimer.unref?.();
  };

  const sessions = new Map();

  // Restore unexpired sessions after a server restart.
  try {
    const saved = JSON.parse(readFileSync(SESSIONS_FILE, "utf8"));
    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
      for (const [token, session] of Object.entries(saved)) {
        if (
          typeof token === "string" &&
          session &&
          typeof session.username === "string" &&
          session.username.length > 0 &&
          Number.isFinite(session.expires) &&
          session.expires > Date.now()
        ) {
          sessions.set(token, session);
        }
      }
    }
  } catch {
    /* no sessions file yet */
  }

  const persistSessions = () => {
    const now = Date.now();

    for (const [token, session] of sessions) {
      if (session.expires <= now) sessions.delete(token);
    }

    try {
      // Session tokens grant account access; keep this file private.
      writeFileSync(SESSIONS_FILE, JSON.stringify(Object.fromEntries(sessions)), {
        mode: 0o600,
      });
    } catch (e) {
      console.error("auth: failed to persist sessions:", e.message);
    }
  };

  const issueToken = (username) => {
    const token = randomBytes(32).toString("hex");
    sessions.set(token, {
      username,
      expires: Date.now() + SESSION_TTL_MS,
    });
    persistSessions();
    return token;
  };

  const verifyToken = (token) => {
    if (!token) return null;

    const session = sessions.get(token);
    if (!session) return null;

    if (session.expires <= Date.now()) {
      sessions.delete(token);
      persistSessions();
      return null;
    }

    return session.username;
  };

  async function handleHttp(req, res) {
    const { pathname } = new URL(req.url, "http://localhost");
    const isSignup = pathname === "/chat/signup" || pathname === "/chat/signup/";
    const isLogin = pathname === "/chat/login" || pathname === "/chat/login/";
    const isLogout = pathname === "/chat/logout" || pathname === "/chat/logout/";
    const isSessionCheck = pathname === "/chat/session" || pathname === "/chat/session/";

    if (!isSignup && !isLogin && !isLogout && !isSessionCheck) return false;

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      send(res, 405, { ok: false, error: "Method not allowed" });
      return true;
    }

    let data;
    try {
      data = JSON.parse(await readBody(req));
    } catch {
      send(res, 400, { ok: false, error: "Bad request" });
      return true;
    }

    if (isLogout) {
      if (data && data.token) {
        sessions.delete(String(data.token));
        persistSessions();
      }
      send(res, 200, { ok: true });
      return true;
    }

    if (isSessionCheck) {
      const username = verifyToken(String((data && data.token) || ""));
      if (!username) {
        send(res, 401, { ok: false, error: "Session expired." });
        return true;
      }

      send(res, 200, { ok: true, username });
      return true;
    }

    const username = String((data && data.username) ?? "").trim();
    const password = String((data && data.password) ?? "");

    if (!USERNAME_RE.test(username)) {
      send(res, 400, {
        ok: false,
        error: "Username must be 3-24 letters, numbers, _ or -.",
      });
      return true;
    }

    if (password.length < PW_MIN || password.length > PW_MAX) {
      send(res, 400, {
        ok: false,
        error: "Password must be " + PW_MIN + "-" + PW_MAX + " characters.",
      });
      return true;
    }

    const key = username.toLowerCase();

    if (isSignup) {
      if (users[key]) {
        send(res, 409, { ok: false, error: "Username already taken." });
        return true;
      }

      const salt = randomBytes(16).toString("hex");
      users[key] = {
        username,
        salt,
        hash: await derive(password, salt),
      };

      persistUsers();
      send(res, 200, {
        ok: true,
        token: issueToken(username),
        username,
      });
      return true;
    }

    const record = users[key];
    let validPassword = false;

    if (
      record &&
      typeof record.salt === "string" &&
      typeof record.hash === "string"
    ) {
      const actualHash = Buffer.from(await derive(password, record.salt), "hex");
      const storedHash = Buffer.from(record.hash, "hex");
      validPassword =
        actualHash.length === storedHash.length &&
        timingSafeEqual(actualHash, storedHash);
    }

    if (!validPassword) {
      send(res, 401, { ok: false, error: "Invalid username or password." });
      return true;
    }

    send(res, 200, {
      ok: true,
      token: issueToken(record.username),
      username: record.username,
    });
    return true;
  }

  return { handleHttp, verifyToken };
}
