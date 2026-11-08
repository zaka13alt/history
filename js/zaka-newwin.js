// zaka new-window guard (shared by study.html, static-zaka/*.html, frame/frame.html).
//
// Proxy iframes are sandboxed WITHOUT allow-popups, so the browser can never open
// a real tab/window from proxied content (that loads/leaks the real URL). This
// controller plugin turns every "new window" intent inside a frame -- target=_blank
// links, ctrl/cmd/shift/middle clicks, window.open -- into a call to onOpen(realUrl),
// which the page uses to open the URL proxied (e.g. as a new zaka tab).
//
// Usage: var p = zakaNewWindowPlugin(function (url) { ... }); if (p) plugins.push(p);
(function () {
    "use strict";

    function opensNewWindow(doc, name) {
        var n = String(name == null ? "" : name).trim();
        var l = n.toLowerCase();
        if (!n || l === "_self" || l === "_parent" || l === "_top" || l === "_unfencedtop") return false;
        if (l === "_blank" || l === "_new") return true;
        // A named target only stays in-page if a frame with that name exists.
        try {
            var q = n.replace(/"/g, '\\"');
            return !doc.querySelector('iframe[name="' + q + '"],frame[name="' + q + '"]');
        } catch (e) {
            return true;
        }
    }

    function resolve(ctx, raw) {
        try {
            var u = new URL(String(raw), ctx.client.url.href);
            if (u.protocol !== "http:" && u.protocol !== "https:") return null;
            return u.href;
        } catch (e) {
            return null;
        }
    }

    // window.open() used to return null, which breaks the very common
    //   var w = window.open("", "_blank"); w.location = url;
    // pattern (and makes sites think popups are blocked). Return a stand-in window
    // whose location assignment opens the zaka tab. Any "...__location" key is
    // treated as location too, since the proxy's JS rewriter renames it.
    function fakeWindow(ctx, onOpen, initial) {
        var current = initial || "about:blank", opened = false, closed = false;
        function go(u) {
            if (closed) return;
            var real = resolve(ctx, u);
            if (!real) return;
            current = real;
            if (!opened) { opened = true; onOpen(real); }
        }
        if (initial) { opened = true; onOpen(initial); }
        var loc = { assign: go, replace: go, reload: function () {}, toString: function () { return current; } };
        Object.defineProperty(loc, "href", { get: function () { return current; }, set: go, enumerable: true });
        ["origin", "protocol", "host", "hostname", "port", "pathname", "search", "hash"].forEach(function (k) {
            Object.defineProperty(loc, k, { get: function () { try { return new URL(current)[k]; } catch (e) { return ""; } }, enumerable: true });
        });
        var doc = { title: "", body: null, write: function () {}, writeln: function () {}, close: function () {}, open: function () { return doc; } };
        var target = {
            opener: null, document: doc, name: "",
            close: function () { closed = true; }, focus: function () {}, blur: function () {},
            postMessage: function () {}, addEventListener: function () {}, removeEventListener: function () {}
        };
        var isLoc = function (p) { return typeof p === "string" && (p === "location" || /__location$/.test(p)); };
        return new Proxy(target, {
            get: function (t, p) { if (p === "closed") return closed; if (isLoc(p)) return loc; return t[p]; },
            set: function (t, p, v) { if (isLoc(p)) { go(v); return true; } t[p] = v; return true; }
        });
    }

    function hook(ctx, onOpen) {
        var w = ctx.window, doc = w && w.document;
        if (!doc) return;

        function onClick(e) {
            if (e.defaultPrevented || (e.button !== 0 && e.button !== 1)) return;
            var a = e.target && e.target.closest ? e.target.closest("a[href],area[href]") : null;
            if (!a) return;
            var wantsNew = e.button === 1 || e.ctrlKey || e.metaKey || e.shiftKey ||
                opensNewWindow(doc, a.getAttribute("target"));
            if (!wantsNew) return;
            var url = resolve(ctx, a.getAttribute("href"));
            e.preventDefault();
            if (url) onOpen(url);
        }
        doc.addEventListener("click", onClick, false);
        doc.addEventListener("auxclick", onClick, false);

        // Forms that submit into a new window are blocked by the sandbox; at least
        // don't let them fail silently for GET forms.
        doc.addEventListener("submit", function (e) {
            var f = e.target;
            if (e.defaultPrevented || !f || !opensNewWindow(doc, f.getAttribute("target"))) return;
            e.preventDefault();
            if ((f.method || "get").toLowerCase() !== "get") return;
            var url = resolve(ctx, f.getAttribute("action") || ctx.client.url.href);
            if (!url) return;
            try {
                var u = new URL(url);
                u.search = new URLSearchParams(new w.FormData(f)).toString();
                onOpen(u.href);
            } catch (err) {}
        }, false);

        var origOpen = w.open;
        var zakaOpen = function (url, name, features) {
            if (!opensNewWindow(doc, name == null ? "_blank" : name)) return origOpen.apply(this, arguments);
            var blank = url == null || url === "" || /^\s*about:blank\s*$/i.test(String(url));
            var win = fakeWindow(ctx, onOpen, blank ? null : resolve(ctx, url));
            // Like a real browser: noopener/noreferrer opens get no window handle back.
            return /(^|,)\s*no(opener|referrer)\s*(=\s*(yes|1|true)\s*)?(,|$)/i.test(String(features || "")) ? null : win;
        };
        try {
            Object.defineProperty(w, "open", { value: zakaOpen, writable: true, configurable: true });
        } catch (e) {
            try { w.open = zakaOpen; } catch (e2) { console.warn("[zaka] could not hook window.open", e2); }
        }
    }

    window.zakaNewWindowPlugin = function (onOpen) {
        var MP = window.$K4q9p2XvController && window.$K4q9p2XvController.ManagedPlugin;
        if (!MP) return null;
        class NewWindowPlugin extends MP {
            constructor() { super("zaka-new-window", []); }
            install(e) {
                if (super.install) super.install(e);
                this.tap(e.hooks.init.post, function (ctx) {
                    try { hook(ctx, onOpen); } catch (err) { console.error("[zaka] new-window hook failed", err); }
                });
            }
        }
        return new NewWindowPlugin();
    };
})();
