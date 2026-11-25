import { WebSocketServer } from "ws";
import { readFileSync, writeFileSync } from "node:fs";

// Global chat with text channels, hardcoded owner/admin roles, and basic
// moderation commands (/ban, /timeout, ...). Auth (username) comes from auth.js.
const MSG_MAX = 500;
const HISTORY_MAX = 50;
const DM_MAX = 60;
const BIO_MAX = 200;
const PFP_MAX = 30000;
const BANNER_MAX = 60000;
// Anti-spam (per user, shared across all their tabs/sockets).
const RATE_WINDOW_MS = 5000; // at most RATE_MAX messages per window
const RATE_MAX = 5;
const MIN_GAP_MS = 600; // minimum time between two messages
const DUP_WINDOW_MS = 30000; // same text can't be repeated within this window
const STRIKE_WINDOW_MS = 30000; // this many spam strikes in the window...
const STRIKE_MAX = 3;
const AUTO_TIMEOUT_S = 60; // ...earns an automatic timeout
const PING_INTERVAL_MS = 30000;
// Raid / auto-mod tuning. Deliberately lenient on per-IP limits because many
// legit users share one public IP (school/library NAT); the real defense is the
// per-connection + cross-account detection below.
const MAX_CONN_PER_IP = 25; // concurrent sockets from one IP
const IP_JOIN_WINDOW_MS = 120000;
const IP_JOIN_MAX = 15; // >this distinct users from one IP in the window => soft throttle
const IP_THROTTLE_MS = 600000; // 10 min soft connection throttle
const RAID_JOIN_WINDOW_MS = 60000;
const RAID_JOIN_MAX = 8; // >this distinct NEW accounts joining in 60s => raid mode
const RAID_MSG_WINDOW_MS = 12000;
const RAID_MSG_MAX = 35; // >this messages chat-wide in 12s => raid mode
const RAID_MODE_MS = 300000; // raid mode holds for 5 min (sliding)
const RAID_NEW_MS = 600000; // an account is "new" for 10 min after first seen
const HISTORY_FILE = new URL("chat-history.json", import.meta.url);
const MOD_FILE = new URL("chat-mod.json", import.meta.url);
const STATS_FILE = new URL("chat-stats.json", import.meta.url);
const DM_FILE = new URL("chat-dms.json", import.meta.url);
const PROFILE_FILE = new URL("chat-profiles.json", import.meta.url);

// Text channels.
const CHANNELS = ["general", "announcements", "rules", "games", "proxies", "offtopic"];
const DEFAULT_CHANNEL = "general";

// Hardcoded roles by lowercase username. Everyone else is a member.
// Add more like: zaka: "owner", someadmin: "admin",
const ROLES = { zakalol: "owner", officialdomsxze: "coowner" };
const RANK = { member: 0, admin: 1, coowner: 2, owner: 3 };

// Users promoted with /mod (lowercase usernames), persisted in chat-mod.json.
const mods = new Set();

const ranks = new Map();
const userRanks = new Map();
const dms = new Map();
const profiles = new Map();
const roleOf = (u) => {
  const k = String(u).toLowerCase();
  if (ROLES[k]) return ROLES[k];
  if (mods.has(k)) return "admin";
  const r = userRanks.get(k);
  if (r && ranks.has(r)) return ranks.get(r);
  return "member";
};
const rankOf = (u) => {
  const r = RANK[roleOf(u)];
  return r != null ? r : RANK.admin;
};

const BAD_WORDS = [
  // slurs
  "nigger", "nigga", "nignog", "coon", "jigaboo", "porchmonkey", "faggot", "fag",
  "dyke", "tranny", "shemale", "chink", "gook", "spic", "spick", "wetback",
  "beaner", "kike", "wop", "dago", "paki", "raghead", "towelhead", "sandnigger",
  "retard", "tard", "spaz", "mongoloid", "cripple", "midget", "redskin", "injun",
  "chinaman", "negro", "honky",
  // profanity
  "fuck", "motherfucker", "fucker", "fuckboy", "fuckwit", "fuckface", "clusterfuck",
  "shit", "bullshit", "shitty", "bitch", "asshole", "ass", "jackass", "dumbass",
  "cunt", "bastard", "dick", "dickhead", "dickwad", "piss", "prick", "slut",
  "whore", "hoe", "thot", "skank", "douche", "douchebag", "twat", "wanker",
  "bollocks", "arse", "arsehole", "goddamn",
  // nsfw / sexual
  "tit", "titty", "titties", "boob", "boobies", "booty", "pussy", "pussies",
  "cock", "cum", "cumshot", "cumming", "dildo", "blowjob", "handjob", "rimjob",
  "anal", "penis", "vagina", "clit", "clitoris", "boner", "horny", "orgasm",
  "orgy", "nude", "nudes", "porn", "porno", "pornhub", "xxx", "bdsm", "milf",
  "dilf", "gangbang", "deepthroat", "creampie", "bukkake", "fap", "jizz",
  "jerkoff", "masturbate", "ejaculate", "hentai", "coochie", "smut", "sex",
  "rape", "raping", "rapist", "molest", "incest", "bestiality", "pedo", "pedophile",
];
// Leading \b prevents matching inside innocent words (Scunthorpe, cockpit, analysis,
// Montenegro, class, cumbersome); optional suffix group catches common inflections
// (plurals, -ing/-ed/-er) without listing every variant.
const badRe = BAD_WORDS.length
  ? new RegExp(String.raw`\b(` + BAD_WORDS.join("|") + String.raw`)(?:s|es|ed|d|ing|in|er|ers|y|ies|z|zes)?\b`, "gi")
  : null;

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
// Content-based spam: a short token repeated to fill length, or very low
// character diversity over length. Catches raid floods like "niggernigger...",
// "676767...", "aaaaaa..." regardless of what the token is.
function isFloodSpam(t) {
  const s = String(t).replace(/\s+/g, "");
  if (s.length < 20) return false;
  if (new Set(s.toLowerCase()).size <= 4) return true;
  for (let p = 1; p <= 16; p++) {
    if (s.length / p < 4) break;
    const unit = s.slice(0, p);
    if (unit.repeat(Math.ceil(s.length / p)).slice(0, s.length) === s) return true;
  }
  return false;
}

// Disguised-slur detection. The display mask (badRe) is \b-anchored, so it misses
// concatenated/spaced/leet slurs ("niggernigger", "n i g g e r", "n1gger"). This
// undoes leetspeak + separators + stretched repeats, then substring-matches a
// curated set of unambiguous slurs for an automatic timeout.
const LEET = { "0": "o", "1": "i", "!": "i", "|": "i", "3": "e", "4": "a", "@": "a", "5": "s", "$": "s", "7": "t", "8": "b", "9": "g", "+": "t", "(": "c" };
const HARD_SLURS = ["nigger", "nigga", "nignog", "faggot", "jigaboo", "porchmonkey", "sandnigger", "kike", "tranny", "shemale", "wetback", "beaner", "chinaman", "raghead", "towelhead"];
function normSlur(s) {
  let t = String(s).toLowerCase().replace(/[0-9@!$+|()]/g, (c) => LEET[c] || "");
  return t.replace(/[^a-z]/g, "").replace(/(.)\1{2,}/g, "$1");
}
function hardSlurHit(s) {
  const t = normSlur(s);
  return HARD_SLURS.some((w) => t.includes(w));
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

  // Read-only #rules channel: seed the community rules if empty (only admins/mods can post).
  if (!histories.rules || histories.rules.length === 0) {
    const rt = Date.now();
    const rule = (i, text) => ({ type: "msg", channel: "rules", name: "📋 Rules", role: "owner", text, ts: rt + i });
    histories.rules = [
      rule(0, "Welcome! Please read the rules. Only admins and mods can post in this channel."),
      rule(1, "1. No swearing or excessive profanity."),
      rule(2, "2. No racial slurs, hate speech, or discrimination of any kind."),
      rule(3, "3. No harassment, bullying, threats, or doxxing."),
      rule(4, "4. No NSFW, sexual, or otherwise inappropriate content."),
      rule(5, "5. No spamming, flooding, or advertising."),
      rule(6, "6. No impersonating staff or other members."),
      rule(7, "7. Be respectful. Breaking the rules results in a timeout or ban."),
    ];
  }

  const bans = new Set(); // lowercase usernames
  const ipbans = new Set(); // banned ip keys (chat-level): /64 for ipv6, exact for ipv4
  const userIPs = new Map(); // lowercase username -> last-seen client ip (in-memory)
  const ipKey = (ip) => (ip && ip.includes(":") ? ip.split(":").slice(0, 4).join(":") + "::/64" : ip);
  // --- auto-mod / raid state ---
  const firstSeen = new Map(); // lowercase user -> first-seen ts (this process)
  const ipJoins = new Map(); // ipKey -> [{ u, ts }]
  const ipThrottle = new Map(); // ipKey -> expiry ts (soft connection throttle)
  const recentJoins = []; // { u, ts } new-account joins (raid signal)
  const recentMsgs = []; // message timestamps (raid signal)
  const slowmode = new Map(); // channel -> seconds between messages
  const slowLast = new Map(); // "channel|user" -> last post ts
  const startupAt = Date.now();
  let raidUntil = 0, raidForced = false, raidOn = false, lockdown = false;
  const raidActive = () => raidForced || raidOn;
  const isNewAccount = (u) => {
    const t = firstSeen.get(String(u).toLowerCase());
    return !t || Date.now() - t < RAID_NEW_MS;
  };
  function enterRaid() {
    const was = raidActive();
    raidUntil = Date.now() + RAID_MODE_MS;
    raidOn = true;
    if (!was) for (const ch of CHANNELS) sysChannel(ch, "⚠️ Raid protection ON — newer accounts can't post for a few minutes.");
  }
  function noteJoin(u) {
    if (Date.now() - startupAt < 90000) return; // ignore the reconnect burst after a restart
    const now = Date.now();
    while (recentJoins.length && now - recentJoins[0].ts > RAID_JOIN_WINDOW_MS) recentJoins.shift();
    if (isNewAccount(u)) recentJoins.push({ u: String(u).toLowerCase(), ts: now });
    if (new Set(recentJoins.map((e) => e.u)).size > RAID_JOIN_MAX) enterRaid();
  }
  function noteMsg() {
    const now = Date.now();
    while (recentMsgs.length && now - recentMsgs[0] > RAID_MSG_WINDOW_MS) recentMsgs.shift();
    recentMsgs.push(now);
    if (now - startupAt > 90000 && recentMsgs.length > RAID_MSG_MAX) enterRaid();
  }

  const timeouts = new Map(); // lowercase username -> expiry ts

  try {
    const mod = JSON.parse(readFileSync(MOD_FILE, "utf8"));
    if (mod && Array.isArray(mod.bans)) mod.bans.forEach((u) => bans.add(String(u).toLowerCase()));
    if (mod && Array.isArray(mod.ipbans)) mod.ipbans.forEach((x) => ipbans.add(String(x)));
    if (mod && Array.isArray(mod.mods)) mod.mods.forEach((u) => mods.add(String(u).toLowerCase()));
    if (mod && Array.isArray(mod.ranks)) mod.ranks.forEach((r) => { const rl = clean(r, 24); if (rl) ranks.set(rl.toLowerCase(), rl); });
    if (mod && mod.userRanks && typeof mod.userRanks === "object") for (const [u, r] of Object.entries(mod.userRanks)) userRanks.set(String(u).toLowerCase(), String(r).toLowerCase());
    if (mod && mod.timeouts)
      for (const k in mod.timeouts) if (mod.timeouts[k] > Date.now()) timeouts.set(k, mod.timeouts[k]);
  } catch {
    /* none yet */
  }

  const counts = new Map(); // username -> total messages sent (all-time)
  try {
    const st = JSON.parse(readFileSync(STATS_FILE, "utf8"));
    if (st && typeof st === "object") for (const k in st) counts.set(k, st[k] | 0);
  } catch {
    /* none yet */
  }

  try {
    const d = JSON.parse(readFileSync(DM_FILE, "utf8"));
    if (d && typeof d === "object") for (const [k, v] of Object.entries(d)) if (Array.isArray(v)) dms.set(k, v.slice(-DM_MAX));
  } catch {
    /* none yet */
  }
  let dmTimer = null;
  const persistDm = () => {
    if (dmTimer) return;
    dmTimer = setTimeout(() => {
      dmTimer = null;
      try {
        writeFileSync(DM_FILE, JSON.stringify(Object.fromEntries(dms)));
      } catch (e) {
        console.error("chat dm persist:", e.message);
      }
    }, 400);
    dmTimer.unref?.();
  };
  const pairKey = (a, b) => [String(a).toLowerCase(), String(b).toLowerCase()].sort().join("|");
  const sendToUser = (username, obj) => {
    const u = String(username).toLowerCase();
    const m = JSON.stringify(obj);
    for (const c of wss.clients) if (c.username && c.username.toLowerCase() === u && c.readyState === c.OPEN) c.send(m);
  };
  const dmConvos = (username) => {
    const u = String(username).toLowerCase();
    const out = [];
    for (const [key, arr] of dms) {
      if (!arr.length) continue;
      const pair = key.split("|");
      if (!pair.includes(u)) continue;
      const otherLc = pair[0] === u ? pair[1] : pair[0];
      const last = arr[arr.length - 1];
      const other = last.from.toLowerCase() === otherLc ? last.from : last.to;
      out.push({ user: other, last: last.text, ts: last.ts });
    }
    out.sort((a, b) => b.ts - a.ts);
    return out;
  };

  try {
    const pr = JSON.parse(readFileSync(PROFILE_FILE, "utf8"));
    if (pr && typeof pr === "object") for (const [k, v] of Object.entries(pr)) if (v && typeof v === "object") profiles.set(String(k).toLowerCase(), { bio: String(v.bio || "").slice(0, BIO_MAX), pfp: String(v.pfp || "").slice(0, PFP_MAX), banner: String(v.banner || "").slice(0, BANNER_MAX) });
  } catch {
    /* none yet */
  }
  let profTimer = null;
  const persistProfile = () => {
    if (profTimer) return;
    profTimer = setTimeout(() => {
      profTimer = null;
      try {
        writeFileSync(PROFILE_FILE, JSON.stringify(Object.fromEntries(profiles)));
      } catch (e) {
        console.error("chat profile persist:", e.message);
      }
    }, 500);
    profTimer.unref?.();
  };
  const profOf = (u) => profiles.get(String(u).toLowerCase()) || { bio: "", pfp: "", banner: "" };
  const broadcastAll = (obj) => {
    const m = JSON.stringify(obj);
    for (const c of wss.clients) if (c.readyState === c.OPEN) c.send(m);
  };

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
        writeFileSync(MOD_FILE, JSON.stringify({ bans: [...bans], mods: [...mods], ipbans: [...ipbans], timeouts: t, ranks: [...ranks.values()], userRanks: Object.fromEntries(userRanks) }));
      } catch (e) {
        console.error("chat mod persist:", e.message);
      }
    }, 300);
    modTimer.unref?.();
  };

  let statsTimer = null;
  const persistStats = () => {
    if (statsTimer) return;
    statsTimer = setTimeout(() => {
      statsTimer = null;
      try {
        writeFileSync(STATS_FILE, JSON.stringify(Object.fromEntries(counts)));
      } catch (e) {
        console.error("chat stats persist:", e.message);
      }
    }, 2000);
    statsTimer.unref?.();
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
    else if (isFloodSpam(norm)) reason = "That looks like spam.";

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
      sysTo(ws, "Commands: /help | /stats" + (isMod ? " | /ban <user> [reason] | /unban <user> | /timeout <user> <seconds> | /untimeout <user> | /ipban <user> | /ipunban <user> | /delete last <n> | /slowmode <sec> | /lockdown | /raidmode on|off | /rank add <rank> | /rank remove <rank> | /rank add user <user> <rank> | /rank delete user <user>" : "") + (isOwner ? " | /mod <user> | /unmod <user>" : ""));
      return;
    }

    if (cmd === "stats") {
      const arr = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      const total = arr.reduce((acc, e) => acc + e[1], 0);
      const top = arr.slice(0, 10).map((e, i) => (i + 1) + ". " + e[0] + " — " + e[1]);
      const myCount = counts.get(ws.username) || 0;
      const myRank = arr.findIndex((e) => e[0] === ws.username) + 1;
      let out = "\uD83D\uDCCA Top chatters (" + total + " messages, " + arr.length + " users):\n" + (top.join("\n") || "no messages yet");
      out += "\n— You: " + (myRank > 0 ? "#" + myRank + " with " + myCount + " messages" : "no messages yet");
      sysTo(ws, out);
      return;
    }

    if (cmd === "lockdown") {
      if (!isMod) { sysTo(ws, "Only mods can use that."); return; }
      const a = String(parts[1] || "").toLowerCase();
      lockdown = a === "on" ? true : a === "off" ? false : !lockdown;
      sysChannel(ws.channel, "Lockdown " + (lockdown ? "ENABLED — only staff can post" : "disabled") + " by " + ws.username + ".");
      return;
    }

    if (cmd === "raidmode") {
      if (!isMod) { sysTo(ws, "Only mods can use that."); return; }
      const a = String(parts[1] || "").toLowerCase();
      if (a === "off") { raidForced = false; raidOn = false; raidUntil = 0; sysChannel(ws.channel, "Raid mode OFF (" + ws.username + ")."); }
      else { raidForced = true; enterRaid(); sysChannel(ws.channel, "Raid mode forced ON by " + ws.username + "."); }
      return;
    }

    if (cmd === "slowmode") {
      if (!isMod) { sysTo(ws, "Only mods can use that."); return; }
      const secs = Math.max(0, Math.min(300, parseInt(parts[1], 10) || 0));
      if (secs) slowmode.set(ws.channel, secs); else slowmode.delete(ws.channel);
      sysChannel(ws.channel, secs ? ("Slowmode: " + secs + "s between messages in #" + ws.channel + " (" + ws.username + ").") : ("Slowmode off in #" + ws.channel + " (" + ws.username + ")."));
      return;
    }

    if (cmd === "delete") {
      if (!isMod) { sysTo(ws, "Only mods can use that."); return; }
      if (String(parts[1] || "").toLowerCase() !== "last") { sysTo(ws, "Usage: /delete last <count>"); return; }
      const hist = histories[ws.channel];
      const n = Math.min(Math.max(parseInt(parts[2], 10) || 0, 0), hist.length);
      if (!n) { sysTo(ws, "Usage: /delete last <count>"); return; }
      hist.splice(hist.length - n, n);
      persistHist();
      broadcastChannel(ws.channel, { type: "history", channel: ws.channel, messages: hist });
      sysChannel(ws.channel, ws.username + " deleted the last " + n + " message(s).");
      return;
    }

    if (cmd === "ipban" || cmd === "ipunban") {
      if (!isMod) { sysTo(ws, "Only mods can use that."); return; }
      const target = parts[1];
      if (!target) { sysTo(ws, "Usage: /" + cmd + " <user>"); return; }
      const tl = target.toLowerCase();
      if (cmd === "ipban") {
        if (rankOf(target) >= rankOf(ws.username)) { sysTo(ws, "You can't moderate " + target + "."); return; }
        const ip = userIPs.get(tl);
        if (!ip) { sysTo(ws, "No known IP for " + target + " (they haven't connected since the last restart)."); return; }
        const key = ipKey(ip);
        ipbans.add(key);
        bans.add(tl);
        persistMod();
        let kicked = 0;
        for (const c of wss.clients) if (c.ip && ipKey(c.ip) === key) { try { c.close(4003, "ip-banned"); kicked++; } catch (e) {} }
        sysChannel(ws.channel, target + " was IP-banned by " + ws.username + ".");
        sysTo(ws, "IP-banned " + target + " (" + key + "); kicked " + kicked + " connection(s).");
      } else {
        const ip = userIPs.get(tl) || target;
        ipbans.delete(ipKey(ip));
        persistMod();
        sysTo(ws, "Removed IP ban for " + ipKey(ip) + ".");
      }
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
    if (cmd === "rank") {
      if (!isMod) { sysTo(ws, "Only mods can use that."); return; }
      const sub = String(parts[1] || "").toLowerCase();
      const isUser = String(parts[2] || "").toLowerCase() === "user";
      if (sub === "add" && isUser) {
        const target = parts[3];
        const rname = clean(parts.slice(4).join(" "), 24);
        if (!target || !rname) { sysTo(ws, "Usage: /rank add user <username> <rank>"); return; }
        const rk = rname.toLowerCase();
        if (!ranks.has(rk)) { sysTo(ws, "No such rank: " + rname + " (create it with /rank add <rank>)"); return; }
        userRanks.set(target.toLowerCase(), rk);
        persistMod();
        refreshRole(target);
        sysChannel(ws.channel, target + " was given the rank " + ranks.get(rk) + " by " + ws.username + ".");
        return;
      }
      if ((sub === "delete" || sub === "remove") && isUser) {
        const target = parts[3];
        if (!target) { sysTo(ws, "Usage: /rank delete user <username>"); return; }
        if (!userRanks.delete(target.toLowerCase())) { sysTo(ws, target + " has no rank."); return; }
        persistMod();
        refreshRole(target);
        sysChannel(ws.channel, target + "'s rank was removed by " + ws.username + ".");
        return;
      }
      if (sub === "add") {
        const rname = clean(parts.slice(2).join(" "), 24);
        if (!rname) { sysTo(ws, "Usage: /rank add <rank name>"); return; }
        const rk = rname.toLowerCase();
        if (RANK[rk] != null || rk === "member") { sysTo(ws, "That name is reserved."); return; }
        if (ranks.has(rk)) { sysTo(ws, "Rank already exists: " + ranks.get(rk)); return; }
        ranks.set(rk, rname);
        persistMod();
        sysTo(ws, "Created rank: " + rname);
        return;
      }
      if (sub === "remove" || sub === "delete") {
        const rname = clean(parts.slice(2).join(" "), 24);
        if (!rname) { sysTo(ws, "Usage: /rank remove <rank name>"); return; }
        const rk = rname.toLowerCase();
        if (!ranks.has(rk)) { sysTo(ws, "No such rank: " + rname); return; }
        ranks.delete(rk);
        const affected = [];
        for (const [u, r] of userRanks) if (r === rk) { userRanks.delete(u); affected.push(u); }
        persistMod();
        affected.forEach(refreshRole);
        sysTo(ws, "Removed rank: " + rname + (affected.length ? " (unassigned " + affected.length + " user(s))" : ""));
        return;
      }
      sysTo(ws, "Usage: /rank add <rank> | /rank remove <rank> | /rank add user <username> <rank> | /rank delete user <username>");
      return;
    }
    sysTo(ws, "Unknown command: /" + cmd + " (try /help)");
  }

  wss.on("connection", (ws, username, ip) => {
    ws.ip = ip || "";
    if (ip) userIPs.set(String(username).toLowerCase(), ip);
    const _fs = String(username).toLowerCase();
    if (!firstSeen.has(_fs)) firstSeen.set(_fs, Date.now());
    noteJoin(_fs);
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

    sendTo(ws, { type: "welcome", channels: CHANNELS, channel: ws.channel, role: ws.role, username, dms: dmConvos(username) });
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

      if (data.type === "typing") {
        if (data.to) {
          const toLc = String(data.to).toLowerCase();
          if (toLc !== ws.username.toLowerCase()) sendToUser(data.to, { type: "typing", name: ws.username, dm: ws.username });
          return;
        }
        const tm = JSON.stringify({ type: "typing", name: ws.username, channel: ws.channel });
        for (const c of wss.clients) if (c !== ws && c.readyState === c.OPEN && c.channel === ws.channel) c.send(tm);
        return;
      }

      if (data.type === "profile") {
        const u = clean(data.user, 24);
        if (!u) return;
        const ul = u.toLowerCase();
        let online = false;
        for (const c of wss.clients) if (c.username && c.username.toLowerCase() === ul && c.readyState === c.OPEN) { online = true; break; }
        const pr = profOf(u);
        sendTo(ws, { type: "profile", user: u, role: roleOf(u), messages: counts.get(u) || 0, online, since: firstSeen.get(ul) || 0, bio: pr.bio, pfp: pr.pfp, banner: pr.banner });
        return;
      }

      if (data.type === "setprofile") {
        const bio = maskWords(clean(data.bio, BIO_MAX));
        let pfp = typeof data.pfp === "string" ? data.pfp : "";
        if (pfp && !(pfp.startsWith("data:image/") && pfp.length <= PFP_MAX)) pfp = "";
        let banner = typeof data.banner === "string" ? data.banner : "";
        if (banner && !(/^#[0-9a-fA-F]{6}$/.test(banner) || (banner.startsWith("data:image/") && banner.length <= BANNER_MAX))) banner = "";
        profiles.set(ws.username.toLowerCase(), { bio, pfp, banner });
        persistProfile();
        broadcastAll({ type: "profileupdate", user: ws.username, bio, pfp, banner });
        return;
      }

      if (data.type === "dmopen") {
        const other = clean(data.user, 24);
        if (!other || other.toLowerCase() === ws.username.toLowerCase()) return;
        sendTo(ws, { type: "dmhistory", user: other, messages: dms.get(pairKey(ws.username, other)) || [] });
        return;
      }

      if (data.type === "dm") {
        if (bans.has(ws.username.toLowerCase())) { sysTo(ws, "You are banned."); return; }
        const to = clean(data.to, 24);
        const dtext = clean(data.text, MSG_MAX);
        if (!to || !dtext) return;
        if (to.toLowerCase() === ws.username.toLowerCase()) { sysTo(ws, "You can't DM yourself."); return; }
        const exp = timedOut(ws.username);
        if (exp) { sysTo(ws, "You are timed out for " + Math.ceil((exp - Date.now()) / 1000) + "s."); return; }
        const spamErr = checkSpam(ws.username, dtext);
        if (spamErr) { sysTo(ws, spamErr); return; }
        const dm = { type: "dm", from: ws.username, to, text: maskWords(dtext), ts: Date.now() };
        const key = pairKey(ws.username, to);
        const arr = dms.get(key) || [];
        arr.push(dm);
        if (arr.length > DM_MAX) arr.shift();
        dms.set(key, arr);
        persistDm();
        sendToUser(to, dm);
        sendToUser(ws.username, dm);
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

      if ((ws.channel === "rules" || ws.channel === "announcements") && rankOf(username) < RANK.admin) {
        sysTo(ws, "Only admins and mods can post in #rules.");
        return;
      }

      const exp = timedOut(username);
      if (exp) {
        sysTo(ws, "You are timed out for " + Math.ceil((exp - Date.now()) / 1000) + "s.");
        return;
      }

      if (lockdown && rankOf(username) < RANK.admin) {
        sysTo(ws, "Chat is locked down — only staff can post right now.");
        return;
      }
      if (raidActive() && rankOf(username) < RANK.admin && isNewAccount(username)) {
        sysTo(ws, "Raid protection is on — newer accounts can't post for a few minutes.");
        return;
      }
      {
        const sm = slowmode.get(ws.channel) || 0;
        if (sm && rankOf(username) < RANK.admin) {
          const sk = ws.channel + "|" + username.toLowerCase();
          const wait = sm * 1000 - (Date.now() - (slowLast.get(sk) || 0));
          if (wait > 0) { sysTo(ws, "Slowmode: wait " + Math.ceil(wait / 1000) + "s."); return; }
          slowLast.set(sk, Date.now());
        }
      }
      if (hardSlurHit(text) && rankOf(username) < RANK.admin) {
        timeouts.set(username.toLowerCase(), Date.now() + 300000);
        persistMod();
        sysTo(ws, "Auto-timeout 300s: slurs aren't allowed here.");
        return;
      }
      noteMsg();
      const spamErr = checkSpam(username, text);
      if (spamErr) {
        sysTo(ws, spamErr);
        return;
      }
      const now = Date.now();

      let replyObj = null;
      if (data.reply && typeof data.reply === "object") {
        const rn = clean(data.reply.name, 40);
        const rt = clean(data.reply.text, 120);
        if (rn && rt) replyObj = { name: rn, text: maskWords(rt) };
      }

      const message = {
        type: "msg",
        channel: ws.channel,
        name: ws.username,
        role: ws.role,
        text: maskWords(text),
        ts: now,
      };
      if (replyObj) message.reply = replyObj;
      if (rankOf(username) >= RANK.admin && /@(everyone|here)\b/i.test(text)) {
        message.ping = /@everyone\b/i.test(text) ? "everyone" : "here";
      }

      const hist = histories[ws.channel];
      hist.push(message);
      if (hist.length > HISTORY_MAX) hist.shift();
      persistHist();
      counts.set(ws.username, (counts.get(ws.username) || 0) + 1);
      persistStats();

      broadcastChannel(ws.channel, message);
    });
  });

  setInterval(() => {
    if (raidOn && !raidForced && Date.now() >= raidUntil) {
      raidOn = false;
      for (const ch of CHANNELS) sysChannel(ch, "\u2705 Raid protection lifted.");
    }
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
    const ip = String(req.headers["x-real-client-ip"] || req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (ip && ipbans.has(ipKey(ip))) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return true;
    }
    // Per-IP backstop (generous; shared NATs are normal here). Rejects a single
    // IP opening too many sockets at once or spinning up alts in a short burst.
    const _k = ipKey(ip);
    if (_k) {
      const _now = Date.now();
      const _reject = () => { socket.end("HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n"); return true; };
      if ((ipThrottle.get(_k) || 0) > _now) return _reject();
      let _conc = 0;
      for (const c of wss.clients) if (c.ip && ipKey(c.ip) === _k) _conc++;
      if (_conc >= MAX_CONN_PER_IP) return _reject();
      const _lu = username.toLowerCase();
      const _arr = (ipJoins.get(_k) || []).filter((e) => _now - e.ts < IP_JOIN_WINDOW_MS);
      if (!_arr.some((e) => e.u === _lu)) _arr.push({ u: _lu, ts: _now });
      ipJoins.set(_k, _arr);
      if (new Set(_arr.map((e) => e.u)).size > IP_JOIN_MAX) { ipThrottle.set(_k, _now + IP_THROTTLE_MS); return _reject(); }
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, username, ip));
    return true;
  }

  return { handleUpgrade };
}
