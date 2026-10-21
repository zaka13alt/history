// Test frontend for @mercuryworkshop/K4q9p2Xv 2.0.67-alpha.2 + K4q9p2Xv-controller 0.0.14 (AGPL-3.0, vendored unmodified in ./lib).
// The transport is chosen at runtime (?transport=epoxy|libcurl).

const WISP_URL = 'wss://api.zaka13.com/api/';
const TRANSPORT = new URLSearchParams(location.search).get('transport') || 'epoxy';

// optional per-run overrides of K4q9p2Xv's feature flags, e.g. ?flags=sourcemaps:0,encapsulateWorkers:0
function flagOverrides() {
    const raw = new URLSearchParams(location.search).get('flags');
    const flags = {};
    for (const part of (raw || '').split(',').filter(Boolean)) {
        const [key, value] = part.split(':');
        flags[key] = value === '1';
    }
    return flags;
}

const BASE = new URL('./', location.href).pathname;
const PREFIX = BASE + 'nZ970vr4/';

const MAX_LAYOUT_WIDTH = Number(new URLSearchParams(location.search).get('maxwidth') ?? 980);
const FRAME_TOP = 48;
let currentUrl = '';


function readFrameUrl() {
    try {
        const href = frameElement.contentWindow.location.href;
        const start = location.origin + PREFIX;
        if (!href.startsWith(start)) return null;
        const real = decodeURIComponent(href.slice(start.length)).match(/https?:\/\/.*$/);
        if (real) {
            const url = new URL(real[0]);
            return url.origin + url.pathname;
        }
    } catch (e) {
        // 
    }
    return null;
}


let lastFrameUrl = null;
function syncFrameUrl() {
    const url = readFrameUrl();
    if (url !== null && url !== lastFrameUrl) {
        lastFrameUrl = url;
        currentUrl = url;
        layoutFrame();
    }
}


function watchNavigations(frame) {
    try {
        const hook = frame.hooks.fetch.request;
        (hook.tap.callbacks[hook.key] ??= []).push({
            callback: ({ parsed }) => {
                if (parsed.destination !== 'iframe' && parsed.destination !== 'document') return;
                const url = parsed.url.href;
                if (!isYouTubeUrl(url) || url === currentUrl) return;
                currentUrl = url;
                layoutFrame();
            },
            plugin: { name: 'youtube-layout' },
            order: {},
        });
    } catch (e) {
        console.warn('navigation hook unavailable, falling back to polling', e);
    }
}

function isYouTubeUrl(url) {
    try {
        return /(^|\.)youtube\.com$/.test(new URL(url).hostname);
    } catch (e) {
        return false;
    }
}

function layoutFrame() {
    const availableWidth = window.innerWidth;
    const availableHeight = window.innerHeight - FRAME_TOP;
    const isYouTube = isYouTubeUrl(currentUrl);
    const scale = isYouTube && MAX_LAYOUT_WIDTH > 0 && availableWidth > MAX_LAYOUT_WIDTH ? availableWidth / MAX_LAYOUT_WIDTH : 1;
    frameElement.style.width = availableWidth / scale + 'px';
    frameElement.style.height = availableHeight / scale + 'px';
    frameElement.style.transformOrigin = '0 0';
    frameElement.style.transform = scale === 1 ? '' : 'scale(' + scale + ')';
}

const form = document.getElementById('form');
const address = document.getElementById('address');
const frameElement = document.getElementById('frame');
const status = document.getElementById('status');

let framePromise = null;

async function registerServiceWorker() {
    await navigator.serviceWorker.register(BASE + 'bx1wY8X9.js', { scope: BASE, updateViaCache: 'none' });
    const registration = await navigator.serviceWorker.ready;
    return registration.active;
}

async function init() {
    status.textContent = 'starting…';
    const serviceworker = await registerServiceWorker();
    const { Controller } = $K4q9p2XvController;
    const Transport = (await import(TRANSPORT === 'epoxy' ? './LyzaHBeO/SwzzeJZG.mjs' : './LyzaHBeO/bPmJsQ5I.mjs')).default;
    const transport = new Transport({ wisp: WISP_URL });
    const controller = new Controller({
        serviceworker,
        transport,
        K4q9p2XvConfig: { flags: flagOverrides() },
        config: {
            prefix: PREFIX,
            K4q9p2XvPath: BASE + 'LyzaHBeO/hdr6ZzzC.js',
            injectPath: BASE + 'LyzaHBeO/jtqxcoHL.js',
            wasmPath: BASE + 'LyzaHBeO/jCC9IUDB.wasm',
        },
    });
    await controller.wait();
    status.textContent = 'ready';
    const frame = controller.createFrame(frameElement);
    watchNavigations(frame);
    return frame;
}

function toUrl(input) {
    const value = input.trim();
    try {
        return new URL(value).toString();
    } catch (e) {
        // not an absolute URL
    }
    try {
        const url = new URL('https://' + value);
        if (url.hostname.includes('.')) return url.toString();
    } catch (e) {
        // not a hostname
    }
    return 'https://www.google.com/search?q=' + encodeURIComponent(value);
}

async function go(input) {
    framePromise = framePromise || init();
    const frame = await framePromise;
    currentUrl = toUrl(input);
    layoutFrame();
    frame.go(currentUrl);
}

layoutFrame();
window.addEventListener('resize', layoutFrame);
setInterval(syncFrameUrl, 500);
frameElement.addEventListener('load', syncFrameUrl);

form.addEventListener('submit', (event) => {
    event.preventDefault();
    go(address.value).catch((err) => {
        status.textContent = 'error: ' + err.message;
        console.error(err);
    });
});

const goto = new URLSearchParams(location.search).get('goto');
if (goto) {
    address.value = goto;
    go(goto).catch((err) => {
        status.textContent = 'error: ' + err.message;
        console.error(err);
    });
}
