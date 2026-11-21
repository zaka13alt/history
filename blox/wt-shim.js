// BloxWebTransport — a WebTransport-shaped object backed by blox_wt.wasm.
// The engine does `new WebTransport(url)`; this runs the QUIC+WebTransport
// client in wasm and tunnels RUPP-wrapped datagrams over a Wisp UDP stream
// (wisp-udp.js) to the Roblox UDMux edge via epoxy (udp:"direct").
//
// Install (in the engine's realm, before it creates its transport):
//   import { installBloxWebTransport } from "/blox/wt-shim.js";
//   await installBloxWebTransport({ wasmUrl: "/blox/blox_wt.js",
//                                   wispUrl: "wss://host/wisp/" });
// which sets globalThis.WebTransport = BloxWebTransport.
//
// The CONNECT SNI (host.js sets joinScript.gameFqdn to it) encodes everything:
//   {tok 32hex}-{rccIp 8hex}-{rccPort 4hex}.{udmuxIp 8hex}.qdmux.roblox.com
// so we recover token / rcc_ip / rcc_port / udmux_ip (dial target) from the url
// alone — no cross-thread plumbing.

import init, { QuicConn } from "/blox/blox_wt.js";
import { openWispUdp } from "/blox/wisp-udp.js";

let wasmReady = null;
let WISP_URL = null;
let NativeWebTransport = null; // the realm's real WebTransport, for non-game URLs

export async function installBloxWebTransport(opts) {
  WISP_URL = opts.wispUrl;
  // web-target init() auto-fetches blox_wt_bg.wasm next to blox_wt.js; pass an
  // explicit wasm URL only if given.
  wasmReady = opts.wasmUrl ? init(opts.wasmUrl) : init();
  await wasmReady;
  if (globalThis.WebTransport !== BloxWebTransport) NativeWebTransport = globalThis.WebTransport;
  globalThis.WebTransport = BloxWebTransport;
}

function hexToBytes(h) {
  const b = new Uint8Array(h.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16);
  return b;
}
function hexToIp(h) {
  return [0, 2, 4, 6].map((i) => parseInt(h.substr(i, 2), 16)).join(".");
}

// Parse "{tok}-{rip}-{rccport}.{vip}.qdmux.roblox.com" -> join params.
function parseSni(host) {
  const dot = host.indexOf(".");
  const label0 = host.slice(0, dot);
  const vip = host.slice(dot + 1).split(".")[0];
  const [tok, rip, rccHex] = label0.split("-");
  if (!tok || !rip || !rccHex || tok.length !== 32 || rip.length !== 8 || vip.length !== 8)
    throw new Error("blox-wt: unrecognised qdmux SNI: " + host);
  return {
    token: hexToBytes(tok),
    rccIp: hexToIp(rip),
    rccPort: parseInt(rccHex, 16),
    udmuxIp: hexToIp(vip),
    sni: host,
  };
}

class BloxWebTransport {
  constructor(url, opts) {
    const u = new URL(url);
    let j;
    try { j = parseSni(u.hostname); }
    catch (e) {
      // Not a game qdmux URL (engine probe / other endpoint). Delegate to the
      // real WebTransport so the engine never sees "no available transport".
      console.log("[blox] non-qdmux WebTransport -> native:", url);
      return new NativeWebTransport(url, opts);
    }
    // If this logs during a join, the engine built its transport on THIS realm
    // and it is genuinely proxied through blox-wt (not a native/direct dial).
    console.log("[blox] BloxWebTransport constructed — PROXIED through blox-wt:", url);
    const path = u.pathname + u.search; // /wt?X-Rbx-Capabilities=...

    this.closed = new Promise((res, rej) => { this._closeRes = res; this._closeRej = rej; });
    let readyRes, readyRej;
    this.ready = new Promise((res, rej) => { readyRes = res; readyRej = rej; });

    // datagrams
    this._dgIn = null;
    this.datagrams = {
      readable: new ReadableStream({ start: (c) => (this._dgIn = c) }),
      writable: new WritableStream({ write: (chunk) => { this._conn && this._conn.wt_send_datagram(u8(chunk)); } }),
    };
    // incoming server streams
    this._uniIn = null;
    this.incomingUnidirectionalStreams = new ReadableStream({ start: (c) => (this._uniIn = c) });
    this.incomingBidirectionalStreams = new ReadableStream({ start: () => {} });
    this._streams = new Map(); // wasm stream id -> {controller}

    this._t0 = performance.now();
    this._conn = null;
    this._udp = null;
    this._start(j, path, readyRes, readyRej).catch((e) => { readyRej(e); this._closeRej(e); });
  }

  _now() { return performance.now() - this._t0; }

  async _start(j, path, readyRes, readyRej) {
    await wasmReady;
    const conn = new QuicConn(j.sni, `${j.udmuxIp}:${j.rccPort}`, "RbxTransport");
    conn.set_rupp(j.token, j.rccIp, j.rccPort);
    this._conn = conn;
    const udp = await openWispUdp(WISP_URL, j.udmuxIp, j.rccPort);
    this._udp = udp;
    udp.onDatagram = (bytes) => { const r = conn.recv(this._now(), bytes); if (r) udp.send(r); this._pump(); };
    udp.onClose = () => this._closeRes();

    let phase = "quic";
    const self = this;
    this._drainEvents = () => {
      const e = conn.take_events(); if (!e) return;
      for (const line of e.split("\n")) {
        if (line === "connected" && phase === "quic") {
          phase = "wt";
          conn.start_webtransport(j.sni, path);
        } else if (line === "wt-status:200") {
          readyRes();
        } else if (line.startsWith("wt-status:")) {
          readyRej(new Error("WebTransport CONNECT: " + line));
        } else if (line.startsWith("lost:")) {
          self._closeRej(new Error(line));
        }
      }
    };
    this._pump(); // send the QUIC Initial
  }

  _pump() {
    const conn = this._conn; if (!conn) return;
    let dg;
    while ((dg = conn.next_transmit(this._now())) !== undefined) this._udp.send(dg);
    this._drainEvents && this._drainEvents();
    // deliver WT datagrams
    let d;
    while ((d = conn.wt_recv_datagram()) !== undefined) this._dgIn && this._dgIn.enqueue(d);
    // deliver WT stream chunks
    let s;
    while ((s = conn.wt_poll_stream()) !== undefined) this._deliverStream(s);
    // schedule the next timer tick
    const ms = conn.timeout_ms(this._now());
    clearTimeout(this._timer);
    if (ms !== undefined) this._timer = setTimeout(() => { conn.on_timeout(this._now()); this._pump(); }, Math.max(0, ms));
  }

  _deliverStream(packed) {
    const dv = new DataView(packed.buffer, packed.byteOffset);
    const id = Number(dv.getBigUint64(0));
    const fin = packed[8];
    const data = packed.subarray(9);
    let entry = this._streams.get(id);
    if (!entry) {
      let ctrl;
      const rs = new ReadableStream({ start: (c) => (ctrl = c) });
      entry = { controller: ctrl };
      this._streams.set(id, entry);
      this._uniIn && this._uniIn.enqueue(rs);
    }
    if (data.length) entry.controller.enqueue(new Uint8Array(data));
    if (fin) { try { entry.controller.close(); } catch (_) {} this._streams.delete(id); }
  }

  createUnidirectionalStream() {
    const id = this._conn.wt_open_uni();
    return Promise.resolve(new WritableStream({
      write: (chunk) => this._conn.wt_write(id, u8(chunk)),
      close: () => this._conn.wt_finish(id),
    }));
  }

  createBidirectionalStream() {
    const id = this._conn.wt_open_bidi();
    let ctrl;
    const readable = new ReadableStream({ start: (c) => (ctrl = c) });
    this._streams.set(id, { controller: ctrl });
    const writable = new WritableStream({
      write: (chunk) => this._conn.wt_write(id, u8(chunk)),
      close: () => this._conn.wt_finish(id),
    });
    return Promise.resolve({ readable, writable });
  }

  close() { this._udp && this._udp.close(); this._closeRes(); }
}

function u8(chunk) {
  return chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
}

export { BloxWebTransport };
