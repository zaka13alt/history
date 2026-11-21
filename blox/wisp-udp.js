// Minimal Wisp (v2) client that opens a single UDP stream to host:port through
// epoxy (which must run with udp:"direct") and pipes raw datagrams both ways.
// The bytes are whole RUPP-wrapped QUIC packets from blox_wt.wasm; one Wisp
// DATA frame == one UDP datagram (boundaries preserved), which QUIC needs.
//
//   const udp = await openWispUdp("wss://host/wisp/", "1.2.3.4", 49152);
//   udp.onDatagram = (u8) => conn.recv(now, u8);   // edge -> wasm
//   udp.send(u8);                                   // wasm -> edge
//   udp.close();
//
// Wisp framing: [type u8][streamId u32 LE][payload]. CONNECT=1 DATA=2
// CONTINUE=3 CLOSE=4 INFO=5. CONNECT payload = [streamType u8][port u16 LE]
// [hostname utf8]; streamType 0x02 = UDP.

const T_CONNECT = 1, T_DATA = 2, T_CONTINUE = 3, T_CLOSE = 4, T_INFO = 5;
const SID = 1;

export function openWispUdp(wispUrl, host, port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wispUrl);
    ws.binaryType = "arraybuffer";
    const api = { onDatagram: null, onClose: null, send, close, _ready: false };
    let connectSent = false;

    function frame(type, sid, payload) {
      const p = payload || new Uint8Array(0);
      const b = new Uint8Array(5 + p.length);
      const dv = new DataView(b.buffer);
      b[0] = type;
      dv.setUint32(1, sid, true);
      b.set(p, 5);
      return b;
    }

    function sendConnect() {
      if (connectSent) return;
      connectSent = true;
      const hb = new TextEncoder().encode(host);
      const payload = new Uint8Array(1 + 2 + hb.length);
      const dv = new DataView(payload.buffer);
      payload[0] = 0x02; // UDP
      dv.setUint16(1, port, true);
      payload.set(hb, 3);
      ws.send(frame(T_CONNECT, SID, payload));
      api._ready = true;
      resolve(api);
    }

    function send(u8) {
      if (ws.readyState === 1) ws.send(frame(T_DATA, SID, u8));
    }
    function close() {
      try { ws.send(frame(T_CLOSE, SID, new Uint8Array([0x02]))); } catch (_) {}
      try { ws.close(); } catch (_) {}
    }

    ws.onopen = () => {
      // If the server speaks v2 it sends INFO first; otherwise it sends a
      // CONTINUE for stream 0. We handle both in onmessage. Nothing to send yet.
    };
    ws.onerror = (e) => reject(new Error("wisp ws error"));
    ws.onclose = () => { if (api.onClose) api.onClose("websocket closed"); if (!api._ready) reject(new Error("wisp closed before ready")); };
    ws.onmessage = (ev) => {
      const b = new Uint8Array(ev.data);
      if (b.length < 5) return;
      const type = b[0];
      const dv = new DataView(b.buffer, b.byteOffset);
      const sid = dv.getUint32(1, true);
      const payload = b.subarray(5);
      switch (type) {
        case T_INFO:
          // v2 handshake: reply with our INFO (v2.0, no extensions), then CONNECT.
          ws.send(frame(T_INFO, 0, new Uint8Array([2, 0])));
          sendConnect();
          break;
        case T_CONTINUE:
          // flow control (stream 0 = initial). v1 servers send this first.
          sendConnect();
          break;
        case T_DATA:
          if (sid === SID && api.onDatagram) api.onDatagram(payload);
          break;
        case T_CLOSE:
          if (api.onClose) api.onClose("wisp CLOSE reason 0x" + (payload[0] || 0).toString(16));
          break;
      }
    };
  });
}
