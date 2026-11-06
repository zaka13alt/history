import { WebSocketServer } from "ws";
import { readFileSync, writeFileSync } from "node:fs";

// Global chat with text channels, hardcoded owner/admin roles, and basic
// moderation commands (/ban, /timeout, ...). Auth (username) comes from auth.js.
const MSG_MAX = 500;
const HISTORY_MAX = 50;
// Anti-spam (per user, shared across all their tabs/sockets).
const RATE_WINDOW_MS = 5000; // at most RATE_MAX messages per window
const RATE_MAX = 5;
const MIN_GAP_MS = 600; // minimum time between two messages
const DUP_WINDOW_MS = 30000; // same text can't be repeated within this window
const STRIKE_WINDOW_MS = 30000; // this many spam strikes in the window...
const STRIKE_MAX = 3;
const AUTO_TIMEOUT_S = 60; // ...earns an automatic timeout
const PING_INTERVAL_MS = 30000;
const HISTORY_FILE = new URL("chat-history.json", import.meta.url);
const MOD_FILE = new URL("chat-mod.json", import.meta.url);

// Text channels.
const CHANNELS = ["general", "games", "proxies", "offtopic"];
const DEFAULT_CHANNEL = "general";

// Hardcoded roles by lowercase username. Everyone else is a member.
// Add more like: zaka: "owner", someadmin: "admin",
const ROLES = { zakaontop: "owner" };
const RANK = { member: 0, admin: 1, owner: 2 };

// Users promoted with /mod (lowercase usernames), persisted in chat-mod.json.
const mods = new Set();

const roleOf = (u) => {
  const k = String(u).toLowerCase();
  return ROLES[k] || (mods.has(k) ? "admin" : "member");
};
const rankOf = (u) => RANK[roleOf(u)];

const BAD_WORDS = ["fuck", "shit", "bitch", "asshole", "cunt", "nigger", "faggot"];
const badRe = BAD_WORDS.length ? new RegExp(String.raw`\b(` + BAD_WORDS.join("|") + String.raw`)\b`, "gi") : null;

function clean(s, max) {
  return String(s == null ? "" : s)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function maskWords(s) {
  return badRe ? s.replace(badRe, (m) => "*".repeat(m.length)) : s;
}

export function createChat(auth) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const histories = {};
  CHANNELS.forEach((c) => (histories[c] = []));

  try {
    const parsed = JSON.parse(readFileSync(HISTORY_FILE, "utf8"));
    if (parsed && typeof parsed === "object") {
      CHANNELS.forEach((c) => {
        if (Array.isArray(parsed[c])) histories[c] = parsed[c].slice(-HISTORY_MAX);
      });
    }
  } catch {
    /* none yet */
  }

  const bans = new Set(); // lowercase usernames
  const timeouts = new Map(); // lowercase username -> expiry ts

  try {
    const mod = JSON.parse(readFileSync(MOD_FILE, "utf8"));
    if (mod && Array.isArray(mod.bans)) mod.bans.forEach((u) => bans.add(String(u).toLowerCase()));
    if (mod && Array.isArray(mod.mods)) mod.mods.forEach((u) => mods.add(String(u).toLowerCase()));
    if (mod && mod.timeouts)
      for (const k in mod.timeouts) if (mod.timeouts[k] > Date.now()) timeouts.set(k, mod.timeouts[k]);
  } catch {
    /* none yet */
  }

  let histTimer = null,
    modTimer = null;
  const persistHist = () => {
    if (histTimer) return;
    histTimer = setTimeout(() => {
      histTimer = null;
      try {
        writeFileSync(HISTORY_FILE, JSON.stringify(histories));
      } catch (e) {
        console.error("chat hist persist:", e.message);
      }
    }, 400);
    histTimer.unref?.();
  };

  const persistMod = () => {
    if (modTimer) return;
    modTimer = setTimeout(() => {
      modTimer = null;
      const t = {};
      timeouts.forEach((v, k) => {
        if (v > Date.now()) t[k] = v;
      });
      try {
        writeFileSync(MOD_FILE, JSON.stringify({ bans: [...bans], mods: [...mods], timeouts: t }));
      } catch (e) {
        console.error("chat mod persist:", e.message);
      }
    }, 300);
    modTimer.unref?.();
  };

  // lowercase username -> { times: [], last: [{text, ts}], strikes: [] }
  const spam = new Map();
  const spamState = (u) => {
    let s = spam.get(u);
    if (!s) spam.set(u, (s = { times: [], last: [], strikes: [] }));
    return s;
  };
  // Returns an error string if the message should be blocked, else null.
  function checkSpam(username, text) {
    const u = username.toLowerCase();
    const s = spamState(u);
    const now = Date.now();
    s.times = s.times.filter((t) => now - t < RATE_WINDOW_MS);
    s.last = s.last.filter((m) => now - m.ts < DUP_WINDOW_MS);
    const norm = text.toLowerCase().replace(/\s+/g, " ");

    let reason = null;
    if (s.times.length && now - s.times[s.times.length - 1] < MIN_GAP_MS) reason = "Slow down a little.";
    else if (s.times.length >= RATE_MAX) reason = "You're sending messages too fast.";
    else if (s.last.some((m) => m.text === norm)) reason = "Don't repeat the same message.";

    if (!reason) {
      s.times.push(now);
      s.last.push({ text: norm, ts: now });
      if (s.last.length > 5) s.last.shift();
      return null;
    }

    s.strikes = s.strikes.filter((t) => now - t < STRIKE_WINDOW_MS);
    s.strikes.push(now);
    if (s.strikes.length >= STRIKE_MAX && rankOf(username) < RANK.admin) {
      s.strikes = [];
      timeouts.set(u, now + AUTO_TIMEOUT_S * 1000);
      persistMod();
      return "You've been timed out for " + AUTO_TIMEOUT_S + "s for spamming.";
    }
    return reason;
  }

  setInterval(() => {
    const now = Date.now();
    for (const [u, s] of spam)
      if (!s.times.some((t) => now - t < DUP_WINDOW_MS) && !s.strikes.some((t) => now - t < STRIKE_WINDOW_MS)) spam.delete(u);
  }, 60000).unref();

  const sendTo = (ws, obj) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };

  const broadcastChannel = (channel, obj) => {
    const m = JSON.stringify(obj);
    for (const c of wss.clients) if (c.readyState === c.OPEN && c.channel === channel) c.send(m);
  };

  const sysTo = (ws, text) => sendTo(ws, { type: "system", text });
  const sysChannel = (channel, text) => broadcastChannel(channel, { type: "system", channel, text });

  function timedOut(username) {
    const u = username.toLowerCase();
    const exp = timeouts.get(u);
    if (!exp) return 0;
    if (exp <= Date.now()) {
      timeouts.delete(u);
      return 0;
    }
    return exp;
  }

  function disconnectUser(username) {
    const u = username.toLowerCase();
    for (const c of wss.clients)
      if (c.username && c.username.toLowerCase() === u) {
        try {
          c.close(4003, "banned");
        } catch (e) {}
      }
  }

  // Push a role change to all of a user's open sockets.
  function refreshRole(username) {
    const u = username.toLowerCase();
    const role = roleOf(username);
    for (const c of wss.clients)
      if (c.username && c.username.toLowerCase() === u) {
        c.role = role;
        sendTo(c, { type: "role", role });
      }
  }

  function handleCommand(ws, raw) {
    const parts = raw.slice(1).trim().split(/\s+/);
    const cmd = (parts[0] || "").toLowerCase();
    const isMod = rankOf(ws.username) >= RANK.admin;
    const isOwner = rankOf(ws.username) >= RANK.owner;

    if (cmd === "help") {
      sysTo(ws, "Commands: /help" + (isMod ? " | /ban <user> [reason] | /unban <user> | /timeout <user> <seconds> | /untimeout <user>" : "") + (isOwner ? " | /mod <user> | /unmod <user>" : ""));
      return;
    }

    if (cmd === "mod" || cmd === "unmod") {
      if (!isOwner) {
        sysTo(ws, "Only the owner can use that command.");
        return;
      }
      const target = parts[1];
      if (!target) {
        sysTo(ws, "Usage: /" + cmd + " <username>");
        return;
      }
      const tu = target.toLowerCase();
      if (ROLES[tu]) {
        sysTo(ws, target + " already has a hardcoded role (" + ROLES[tu] + ").");
        return;
      }
      if (cmd === "mod") {
        if (mods.has(tu)) return sysTo(ws, target + " is already a mod.");
        mods.add(tu);
        persistMod();
        refreshRole(target);
        sysChannel(ws.channel, target + " was made a mod by " + ws.username + ".");
      } else {
        if (!mods.has(tu)) return sysTo(ws, target + " isn't a mod.");
        mods.delete(tu);
        persistMod();
        refreshRole(target);
        sysChannel(ws.channel, target + " is no longer a mod.");
      }
      return;
    }

    if (["ban", "unban", "timeout", "untimeout"].includes(cmd)) {
      if (!isMod) {
        sysTo(ws, "You don't have permission to use that command.");
        return;
      }
      const target = parts[1];
      if (!target) {
        sysTo(ws, "Usage: /" + cmd + " <username> ...");
        return;
      }
      const tu = target.toLowerCase();
      if ((cmd === "ban" || cmd === "timeout") && rankOf(target) >= rankOf(ws.username)) {
        sysTo(ws, "You can't moderate " + target + ".");
        return;
      }

      if (cmd === "ban") {
        bans.add(tu);
        persistMod();
        disconnectUser(target);
        sysChannel(ws.channel, target + " was banned by " + ws.username + ".");
      } else if (cmd === "unban") {
        bans.delete(tu);
        persistMod();
        sysTo(ws, target + " was unbanned.");
      } else if (cmd === "timeout") {
        const secs = Math.max(1, Math.min(86400, parseInt(parts[2], 10) || 60));
        timeouts.set(tu, Date.now() + secs * 1000);
        persistMod();
        sysChannel(ws.channel, target + " was timed out for " + secs + "s by " + ws.username + ".");
      } else if (cmd === "untimeout") {
        timeouts.delete(tu);
        persistMod();
        sysTo(ws, target + "'s timeout was removed.");
      }
      return;
    }
    sysTo(ws, "Unknown command: /" + cmd + " (try /help)");
  }

  wss.on("connection", (ws, username) => {
    ws.username = username;
    ws.role = roleOf(username);
    ws.channel = DEFAULT_CHANNEL;
    ws.isAlive = true;

    ws.on("pong", () => {
      ws.isAlive = true;
    });
    ws.on("error", () => ws.terminate());

    if (bans.has(username.toLowerCase())) {
      sysTo(ws, "You are banned from the chat.");
      try {
        ws.close(4003, "banned");
      } catch (e) {}
      return;
    }

    sendTo(ws, { type: "welcome", channels: CHANNELS, channel: ws.channel, role: ws.role, username });
    sendTo(ws, { type: "history", channel: ws.channel, messages: histories[ws.channel] });

    ws.on("message", (rawBuf) => {
      let data;
      try {
        data = JSON.parse(rawBuf.toString());
      } catch {
        return;
      }

      if (data.type === "join") {
        const ch = String(data.channel || "");
        if (CHANNELS.includes(ch)) {
          ws.channel = ch;
          sendTo(ws, { type: "history", channel: ch, messages: histories[ch] });
        }
        return;
      }

      const text = clean(data.text, MSG_MAX);
      if (!text) return;

      if (text[0] === "/") {
        handleCommand(ws, text);
        return;
      }

      if (bans.has(username.toLowerCase())) {
        sysTo(ws, "You are banned.");
        return;
      }

      const exp = timedOut(username);
      if (exp) {
        sysTo(ws, "You are timed out for " + Math.ceil((exp - Date.now()) / 1000) + "s.");
        return;
      }

      const spamErr = checkSpam(username, text);
      if (spamErr) {
        sysTo(ws, spamErr);
        return;
      }
      const now = Date.now();

      const message = {
        type: "msg",
        channel: ws.channel,
        name: ws.username,
        role: ws.role,
        text: maskWords(text),
        ts: now,
      };

      const hist = histories[ws.channel];
      hist.push(message);
      if (hist.length > HISTORY_MAX) hist.shift();
      persistHist();

      broadcastChannel(ws.channel, message);
    });
  });

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

  function handleUpgrade(req, socket, head) {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== "/chat" && url.pathname !== "/chat/") return false;

    let token = url.searchParams.get("token");
    if (!token) {
      socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      return true;
    }

    // Strip "Bearer " if client-side code prepends it to the token query param
    if (token.startsWith("Bearer ")) {
      token = token.slice(7);
    }

    let authResult = null;
    if (auth && typeof auth.verifyToken === "function") {
      authResult = auth.verifyToken(token);
    }

    if (!authResult) {
      socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      return true;
    }

    // Extract username whether authResult is a direct string or a decoded payload object
    const username = typeof authResult === "string" ? authResult : authResult.username;

    if (!username) {
      socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      return true;
    }

    // Upgrade even when banned so the connection handler can close with 4003,
    // allowing the client to distinguish a ban from an expired/invalid session.
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, username));
    return true;
  }

  return { handleUpgrade };
}
