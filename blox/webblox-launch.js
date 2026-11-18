(() => {
  // sj/launch.ts
  var ROBLOX_HOST = /^(?:(?:play|www)\.)?roblox\.com$|^play\.sitetest[1-3]\.robloxlabs\.com$/i;
  var ID = /^[1-9]\d{0,18}$/;
  var SERVER_ID = /^[A-Za-z0-9-]{1,64}$/;
  var PROTOCOL = /^(roblox-player|roblox-client|roblox)(?:-sitetest([1-3]))?:/i;
  var ROBLOX_SCHEME = /^roblox:\/\/(?:experiences\/start\??|navigation\/game_details\??|)(.*)$/i;
  var LAUNCHER_HOST = /(^|\.)(roblox\.com|robloxlabs\.com)$/i;
  var LAUNCHER_PATH = /\/game\/placelauncher\.ashx$/i;
  var GAME_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var IN_GAME = 2;
  function param(params, name) {
    const wanted = name.toLowerCase();
    for (const [key, value] of params) if (key.toLowerCase() === wanted) return value;
    return void 0;
  }
  function launchFrom(placeId, serverId) {
    if (placeId === void 0 || !ID.test(placeId)) return null;
    return serverId && SERVER_ID.test(serverId) ? { placeId, serverId } : { placeId };
  }
  function parseProtocol(raw) {
    var _a;
    const match = PROTOCOL.exec(raw);
    if (!match) return null;
    const domain = match[2] ? `sitetest${match[2]}.robloxlabs.com` : "roblox.com";
    const fields = /* @__PURE__ */ new Map();
    for (const part of raw.slice(match[0].length).split("+")) {
      const colon = part.indexOf(":");
      if (colon > 0) fields.set(part.slice(0, colon).toLowerCase(), part.slice(colon + 1));
    }
    if (((_a = fields.get("launchmode")) != null ? _a : "play").toLowerCase() !== "play") return null;
    const target = fields.get("placelauncherurl");
    if (!target) return null;
    let launcher;
    try {
      launcher = new URL(decodeURIComponent(target));
    } catch {
      return null;
    }
    if (launcher.protocol !== "https:" && launcher.protocol !== "http:") return null;
    if (!LAUNCHER_HOST.test(launcher.hostname) || !LAUNCHER_PATH.test(launcher.pathname)) return null;
    return { domain, launcher };
  }
  function isProtocolUri(raw) {
    return PROTOCOL.test(raw);
  }
  function parseGamesStart(raw) {
    let url;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!ROBLOX_HOST.test(url.hostname) || url.port !== "" || url.username !== "" || url.password !== "") return null;
    if (url.pathname.replace(/\/+$/, "").toLowerCase() !== "/games/start") return null;
    return launchFrom(param(url.searchParams, "placeId"), param(url.searchParams, "gameInstanceId"));
  }
  function parseLaunchUri(raw) {
    var _a, _b;
    if (/^roblox:\/\//i.test(raw)) {
      const match = ROBLOX_SCHEME.exec(raw);
      if (!match) return null;
      const params = new URLSearchParams(match[1]);
      return launchFrom(param(params, "placeId"), (_a = param(params, "gameInstanceId")) != null ? _a : param(params, "gameId"));
    }
    const protocol = parseProtocol(raw);
    if (!protocol) return null;
    const request = param(protocol.launcher.searchParams, "request");
    const placeId = param(protocol.launcher.searchParams, "placeId");
    if (request === "RequestGame") return launchFrom(placeId, void 0);
    if (request !== "RequestGameJob") return null;
    const serverId = (_b = param(protocol.launcher.searchParams, "gameId")) != null ? _b : param(protocol.launcher.searchParams, "jobId");
    return serverId ? launchFrom(placeId, serverId) : null;
  }
  function parseFollowUri(raw) {
    const protocol = parseProtocol(raw);
    if (!protocol || param(protocol.launcher.searchParams, "request") !== "RequestFollowUser") return null;
    const userId = param(protocol.launcher.searchParams, "userId");
    return userId !== void 0 && ID.test(userId) ? { userId, domain: protocol.domain } : null;
  }
  var FollowError = class extends Error {
    constructor(reason) {
      super(reason);
      this.reason = reason;
    }
  };
  function postPresence(fetcher, url, body, csrf) {
    const headers = { "content-type": "application/json" };
    if (csrf) headers["x-csrf-token"] = csrf;
    return fetcher(url, { method: "POST", credentials: "include", headers, body });
  }
  async function lookupFollow(fetcher, follow) {
    const url = `https://presence.${follow.domain}/v1/presence/users`;
    const body = JSON.stringify({ userIds: [Number(follow.userId)] });
    let response;
    try {
      response = await postPresence(fetcher, url, body);
      const csrf = response.status === 403 ? response.headers.get("x-csrf-token") : null;
      if (csrf) response = await postPresence(fetcher, url, body, csrf);
    } catch {
      throw new FollowError("unreachable");
    }
    if (!response.ok) throw new FollowError("unreachable");
    let presence;
    try {
      const data = await response.json();
      const list = data && typeof data === "object" && "userPresences" in data ? data.userPresences : void 0;
      presence = Array.isArray(list) ? list[0] : void 0;
    } catch {
      throw new FollowError("unreachable");
    }
    if (!presence || typeof presence !== "object" || !("userPresenceType" in presence) || presence.userPresenceType !== IN_GAME) {
      throw new FollowError("not-playing");
    }
    const rawPlace = "placeId" in presence ? presence.placeId : void 0;
    const placeId = typeof rawPlace === "number" || typeof rawPlace === "string" ? String(rawPlace) : "";
    if (!ID.test(placeId)) throw new FollowError("not-playing");
    const gameId = "gameId" in presence ? presence.gameId : void 0;
    return typeof gameId === "string" && GAME_ID.test(gameId) ? { placeId, serverId: gameId } : { placeId };
  }

  // sj/plugin.ts
  var SELF_TARGETS = ["_self", "_parent", "_top", "_unfencedtop"];
  var LAUNCHING_PAGE = '<!doctype html><meta charset="utf-8"><title>Launching</title><body style="margin:0;display:grid;place-items:center;height:100vh;font:15px system-ui;background:Canvas;color:CanvasText">Roblox is opening in a new window\u2026';
  var MESSAGES = {
    "popup-blocked": "Allow pop-ups for this site, then press Play again.",
    "not-playing": "Your friend isn't in a game you can join.",
    unreachable: "Couldn't reach Roblox to find your friend.",
    unsupported: "This kind of Roblox launch isn't supported here."
  };
  function bloxUrl(base, launch, wisp) {
    const url = new URL(base, location.href);
    url.searchParams.set("placeId", launch.placeId);
    if (launch.serverId) url.searchParams.set("gameInstanceId", launch.serverId);
    if (wisp) url.searchParams.set("wisp", wisp);
    return url.href;
  }
  function popupFeatures() {
    const width = Math.round(screen.availWidth * 0.9);
    const height = Math.round(screen.availHeight * 0.9);
    const left = Math.round((screen.availWidth - width) / 2);
    const top = Math.round((screen.availHeight - height) / 2);
    return `popup=yes,width=${width},height=${height},left=${left},top=${top}`;
  }
  function createBloxLaunchPlugin(ManagedPlugin, options) {
    var _a, _b;
    const open = (_a = options.open) != null ? _a : (url) => window.open(url, "_blank", popupFeatures());
    const notify = (_b = options.notify) != null ? _b : (message) => window.alert(message);
    function openBlox(launch) {
      if (!open(options.url(launch))) notify(MESSAGES["popup-blocked"]);
    }
    async function openFollow(fetcher, follow) {
      const popup = open("about:blank");
      if (!popup) {
        notify(MESSAGES["popup-blocked"]);
        return;
      }
      try {
        popup.location.replace(options.url(await lookupFollow(fetcher, follow)));
      } catch (error) {
        popup.close();
        notify(MESSAGES[error instanceof FollowError ? error.reason : "unreachable"]);
      }
    }
    function handleProtocol(win, value) {
      if (typeof value !== "string" || !isProtocolUri(value)) return false;
      const launch = parseLaunchUri(value);
      if (launch) {
        openBlox(launch);
        return true;
      }
      const follow = parseFollowUri(value);
      if (follow) void openFollow(win.fetch.bind(win), follow);
      else notify(MESSAGES.unsupported);
      return true;
    }
    function resolveGamesStart(client, raw) {
      let absolute;
      try {
        absolute = new URL(raw, client.meta.base.href).href;
      } catch {
        return null;
      }
      const direct = parseGamesStart(absolute);
      if (direct) return direct;
      try {
        const original = client.unrewriteUrl(absolute);
        return original === absolute ? null : parseGamesStart(original);
      } catch {
        return null;
      }
    }
    function hookWindow({ client, window: win }) {
      client.Proxy("window.open", {
        apply(context) {
          const target = context.args[1] == null ? "_blank" : String(context.args[1]).toLowerCase();
          if (SELF_TARGETS.includes(target) && context.args[0] == null) return;
          const raw = context.args[0] == null ? "" : String(context.args[0]);
          if (handleProtocol(win, raw)) {
            context.return(null);
            return;
          }
          const launch = raw ? resolveGamesStart(client, raw) : null;
          if (!launch) return;
          context.return(null);
          openBlox(launch);
        }
      });
      const onClick = (event) => {
        var _a2, _b2;
        if (event.defaultPrevented || event.button !== 0 && event.button !== 1) return;
        const anchor = event.composedPath().find((node) => node instanceof win.Element && node.matches("a[href], area[href]"));
        if (!anchor) return;
        const href = (_a2 = anchor.getAttribute("href")) != null ? _a2 : "";
        if (handleProtocol(win, href)) {
          event.preventDefault();
          return;
        }
        const launch = (_b2 = resolveGamesStart(client, href)) != null ? _b2 : resolveGamesStart(client, anchor.href);
        if (!launch) return;
        event.preventDefault();
        openBlox(launch);
      };
      win.addEventListener("click", onClick);
      win.addEventListener("auxclick", onClick);
      client.RawTrap(win.HTMLIFrameElement.prototype, "src", {
        set(context, value) {
          if (!handleProtocol(win, value)) context.set(value);
        }
      });
      client.Proxy("Element.prototype.setAttribute", {
        apply(context) {
          const [name, value] = context.args;
          if (typeof name !== "string" || name.toLowerCase() !== "src") return;
          if (typeof value !== "string" || !isProtocolUri(value)) return;
          if (!(context.this instanceof win.HTMLIFrameElement)) return;
          if (handleProtocol(win, value)) context.return(void 0);
        }
      });
    }
    function interceptNavigation(context, result) {
      const { parsed } = context;
      if (parsed.isIframe) return;
      if (parsed.destination !== "document" && parsed.destination !== "iframe") return;
      const launch = parseGamesStart(parsed.url.href);
      if (!launch) return;
      const Headers = context.request.initialHeaders.constructor;
      result.response = {
        body: LAUNCHING_PAGE,
        headers: Headers.fromRawHeaders([
          ["content-type", "text/html; charset=utf-8"],
          ["cache-control", "no-store"]
        ]),
        status: 200,
        statusText: "OK"
      };
      openBlox(launch);
    }
    class BloxLaunchPlugin extends ManagedPlugin {
      constructor() {
        super("webblox-launch", []);
      }
      install(host) {
        super.install(host);
        this.tap(host.hooks.init.post, hookWindow);
        this.tap(host.hooks.fetch.intercept, interceptNavigation);
      }
    }
    return new BloxLaunchPlugin();
  }

  // sj/entry.ts
  globalThis.webbloxLaunch = {
    create(ManagedPlugin, base = "/blox/", wisp) {
      return createBloxLaunchPlugin(ManagedPlugin, {
        url: (launch) => bloxUrl(base, launch, wisp)
      });
    },
    bloxUrl,
    createBloxLaunchPlugin
  };
})();
