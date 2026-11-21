//! blox-wt — client-side WASM QUIC transport for Roblox game joins.
//!
//! M1: datagram-driven QUIC client (recv / next_transmit / timers).
//! M2: HTTP/3 WebTransport on top (SETTINGS + extended CONNECT + WT datagrams),
//! driven over the same JS-owned socket.

mod h3;

use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;
use std::time::Duration;

use bytes::{Bytes, BytesMut};
use wasm_bindgen::prelude::*;

use quinn_proto::{
    crypto::rustls::QuicClientConfig, ClientConfig, Connection, ConnectionHandle, DatagramEvent,
    Dir, Endpoint, EndpointConfig, Event, StreamId, WriteError,
};

const ALPN: &[u8] = b"RbxTransport";

#[derive(Debug)]
struct NoVerify(Arc<rustls::crypto::CryptoProvider>);

impl rustls::client::danger::ServerCertVerifier for NoVerify {
    fn verify_server_cert(
        &self,
        _e: &rustls::pki_types::CertificateDer<'_>,
        _i: &[rustls::pki_types::CertificateDer<'_>],
        _s: &rustls::pki_types::ServerName<'_>,
        _o: &[u8],
        _n: rustls::pki_types::UnixTime,
    ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
        Ok(rustls::client::danger::ServerCertVerified::assertion())
    }
    fn verify_tls12_signature(
        &self,
        _m: &[u8],
        _c: &rustls::pki_types::CertificateDer<'_>,
        _d: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }
    fn verify_tls13_signature(
        &self,
        _m: &[u8],
        _c: &rustls::pki_types::CertificateDer<'_>,
        _d: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }
    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        self.0.signature_verification_algorithms.supported_schemes()
    }
}

fn client_config(alpn: &[u8]) -> ClientConfig {
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let mut tls = rustls::ClientConfig::builder_with_provider(provider.clone())
        .with_protocol_versions(&[&rustls::version::TLS13])
        .unwrap()
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(NoVerify(provider)))
        .with_no_client_auth();
    tls.alpn_protocols = vec![alpn.to_vec()];
    ClientConfig::new(Arc::new(QuicClientConfig::try_from(tls).unwrap()))
}

/// RUPP: the per-datagram wrapper the Roblox UDMux edge expects around every
/// QUIC packet. Format (verified against upstream quic_bridge.py):
///   [01 00][u16be total][01 11 sub][16B token/tag][02 06][ip4][port be] + QUIC
/// where `total` = length of the header up to and including the TLVs. During
/// the QUIC handshake sub=1 carries the join token; afterwards sub=2 carries
/// the freshest session tag harvested from inbound subtype-2 TLVs (falling
/// back to the join token).
struct Rupp {
    token: [u8; 16],
    ip: [u8; 4],
    port: u16,
    session: Option<[u8; 16]>,
}

impl Rupp {
    fn wrap(&self, handshaking: bool, quic: &[u8]) -> Vec<u8> {
        let mut body = Vec::with_capacity(27);
        if handshaking {
            body.extend_from_slice(&[1, 17, 1]);
            body.extend_from_slice(&self.token);
        } else {
            body.extend_from_slice(&[1, 17, 2]);
            body.extend_from_slice(self.session.as_ref().unwrap_or(&self.token));
        }
        body.extend_from_slice(&[2, 6]);
        body.extend_from_slice(&self.ip);
        body.extend_from_slice(&self.port.to_be_bytes());
        let total = 4 + body.len();
        let mut out = Vec::with_capacity(total + quic.len());
        out.extend_from_slice(&[1, 0]);
        out.extend_from_slice(&(total as u16).to_be_bytes());
        out.extend_from_slice(&body);
        out.extend_from_slice(quic);
        out
    }

    fn strip(&mut self, pkt: &[u8]) -> Option<Vec<u8>> {
        if pkt.len() < 4 || pkt[0] != 1 {
            return None;
        }
        let total = u16::from_be_bytes([pkt[2], pkt[3]]) as usize;
        if total < 4 || total > pkt.len() {
            return None;
        }
        self.harvest(&pkt[..total]);
        Some(pkt[total..].to_vec())
    }

    // Adopt the freshest subtype-2 session tag the edge sends (a rolling
    // per-window tag it wants reflected back on post-handshake datagrams).
    fn harvest(&mut self, header: &[u8]) {
        let mut off = 4usize;
        while off + 2 <= header.len() {
            let (t, l) = (header[off], header[off + 1] as usize);
            if off + 2 + l > header.len() {
                break;
            }
            if t == 1 && l == 17 && header[off + 2] == 2 {
                let mut tag = [0u8; 16];
                tag.copy_from_slice(&header[off + 3..off + 19]);
                self.session = Some(tag);
                break;
            }
            off += 2 + l;
        }
    }
}

/// Per server-initiated uni stream: strips the HTTP/3 uni stream type (and, for
/// WebTransport streams, the session id) then passes the rest through. Control
/// (0x00) and QPACK (0x02/0x03) streams are marked non-WT and ignored.
#[derive(Default)]
struct UniRx {
    header_done: bool,
    is_wt: bool,
    pending: Vec<u8>,
}

impl UniRx {
    const WT_UNI: u64 = 0x54;
    fn feed(&mut self, new_bytes: &[u8]) -> Vec<u8> {
        if self.header_done {
            return if self.is_wt { new_bytes.to_vec() } else { Vec::new() };
        }
        self.pending.extend_from_slice(new_bytes);
        let mut pos = 0usize;
        let stype = match h3::get_varint(&self.pending, &mut pos) {
            Some(v) => v,
            None => return Vec::new(),
        };
        if stype == Self::WT_UNI {
            if h3::get_varint(&self.pending, &mut pos).is_none() {
                return Vec::new(); // session id not fully arrived yet
            }
            self.header_done = true;
            self.is_wt = true;
            let payload = self.pending[pos..].to_vec();
            self.pending.clear();
            payload
        } else {
            self.header_done = true;
            self.is_wt = false;
            self.pending.clear();
            Vec::new()
        }
    }
}

#[wasm_bindgen]
pub struct QuicConn {
    endpoint: Endpoint,
    handle: ConnectionHandle,
    conn: Connection,
    remote: SocketAddr,
    base: web_time::Instant,
    events: Vec<String>,

    // h3 / WebTransport
    wt_stream: Option<StreamId>,
    wt_quarter: u64,
    wt_buf: Vec<u8>,
    wt_status: Option<u16>,
    wt_session: u64,
    uni_rx: HashMap<u64, (StreamId, UniRx)>,
    my_wt: HashMap<u64, StreamId>,
    incoming: Vec<(u64, Vec<u8>, bool)>,

    rupp: Option<Rupp>,
}

#[wasm_bindgen]
impl QuicConn {
    #[wasm_bindgen(constructor)]
    pub fn new(server_name: &str, remote: &str, alpn: Option<String>) -> Result<QuicConn, JsError> {
        let remote: SocketAddr = remote
            .parse()
            .map_err(|e| JsError::new(&format!("remote addr: {e}")))?;
        let mut endpoint = Endpoint::new(Arc::new(EndpointConfig::default()), None, true, None);
        let cfg = client_config(alpn.as_deref().map(str::as_bytes).unwrap_or(ALPN));
        let base = web_time::Instant::now();
        let (handle, conn) = endpoint
            .connect(base, cfg, remote, server_name)
            .map_err(|e| JsError::new(&format!("connect: {e}")))?;
        Ok(QuicConn {
            endpoint,
            handle,
            conn,
            remote,
            base,
            events: Vec::new(),
            wt_stream: None,
            wt_quarter: 0,
            wt_buf: Vec::new(),
            wt_status: None,
            wt_session: 0,
            uni_rx: HashMap::new(),
            my_wt: HashMap::new(),
            incoming: Vec::new(),
            rupp: None,
        })
    }

    /// Enable RUPP wrapping toward the Roblox UDMux edge. `token` is the 16-byte
    /// NetStackTokenValue; `rcc_ip`/`rcc_port` come from the join script. Leave
    /// unset for plain QUIC (e.g. tests).
    pub fn set_rupp(&mut self, token: &[u8], rcc_ip: &str, rcc_port: u16) -> Result<(), JsError> {
        if token.len() != 16 {
            return Err(JsError::new("rupp token must be 16 bytes"));
        }
        let ip: std::net::Ipv4Addr = rcc_ip
            .parse()
            .map_err(|e| JsError::new(&format!("rcc_ip: {e}")))?;
        let mut t = [0u8; 16];
        t.copy_from_slice(token);
        self.rupp = Some(Rupp { token: t, ip: ip.octets(), port: rcc_port, session: None });
        Ok(())
    }

    fn now(&self, ms: f64) -> web_time::Instant {
        self.base + Duration::from_micros((ms * 1000.0) as u64)
    }

    fn pump_endpoint(&mut self) {
        while let Some(ev) = self.conn.poll_endpoint_events() {
            if let Some(cev) = self.endpoint.handle_event(self.handle, ev) {
                self.conn.handle_event(cev);
            }
        }
    }

    fn drain(&mut self) {
        while let Some(ev) = self.conn.poll() {
            match ev {
                Event::Connected => self.events.push("connected".into()),
                Event::HandshakeDataReady => self.events.push("handshake".into()),
                Event::ConnectionLost { reason } => self.events.push(format!("lost:{reason}")),
                _ => {}
            }
        }
    }

    // Read everything currently available from a recv stream; fin=true once
    // the peer has finished it.
    fn read_stream(&mut self, id: StreamId) -> (Vec<u8>, bool) {
        // recv_stream() asserts the stream is readable (bidi, or peer-initiated).
        // A send-only uni stream we opened (e.g. a WebTransport uni the engine
        // created) would trip that assert and panic, so never read those.
        if id.dir() == Dir::Uni && id.initiator() == self.conn.side() {
            return (Vec::new(), false);
        }
        let mut data = Vec::new();
        let mut fin = false;
        if let Ok(mut chunks) = self.conn.recv_stream(id).read(true) {
            loop {
                match chunks.next(usize::MAX) {
                    Ok(Some(chunk)) => data.extend_from_slice(&chunk.bytes),
                    Ok(None) => {
                        fin = true;
                        break;
                    }
                    Err(_) => break, // Blocked (no more now) or reset
                }
            }
            let _ = chunks.finalize();
        }
        (data, fin)
    }

    fn pump_streams(&mut self) {
        // Accept server-initiated uni streams (its h3 control + qpack, and any
        // WebTransport uni streams it opens toward the engine).
        while let Some(id) = self.conn.streams().accept(Dir::Uni) {
            let key: u64 = id.into();
            self.uni_rx.entry(key).or_insert((id, UniRx::default()));
        }
        // Read each server uni stream; WT payload -> incoming queue, others drop.
        let keys: Vec<u64> = self.uni_rx.keys().copied().collect();
        for key in keys {
            let id = self.uni_rx[&key].0;
            let (data, fin) = self.read_stream(id);
            if data.is_empty() && !fin {
                continue;
            }
            let payload = self.uni_rx.get_mut(&key).unwrap().1.feed(&data);
            let is_wt = self.uni_rx[&key].1.is_wt;
            if is_wt && (!payload.is_empty() || fin) {
                self.incoming.push((key, payload, fin));
            }
            if fin {
                self.uni_rx.remove(&key);
            }
        }
        // Read client-opened WebTransport streams (the engine's bidi/uni);
        // bytes the server sends back are WT payload already (no header).
        let mine: Vec<(u64, StreamId)> = self.my_wt.iter().map(|(k, v)| (*k, *v)).collect();
        for (key, id) in mine {
            let (data, fin) = self.read_stream(id);
            if !data.is_empty() || fin {
                self.incoming.push((key, data, fin));
            }
            if fin {
                self.my_wt.remove(&key);
            }
        }
        // The CONNECT (request) bidi stream carries the response HEADERS.
        if let Some(id) = self.wt_stream {
            let (data, _fin) = self.read_stream(id);
            if !data.is_empty() {
                self.wt_buf.extend_from_slice(&data);
                self.parse_wt_response();
            }
        }
    }

    fn parse_wt_response(&mut self) {
        let mut pos = 0usize;
        loop {
            let start = pos;
            let ftype = match h3::get_varint(&self.wt_buf, &mut pos) {
                Some(v) => v,
                None => break,
            };
            let flen = match h3::get_varint(&self.wt_buf, &mut pos) {
                Some(v) => v as usize,
                None => {
                    pos = start;
                    break;
                }
            };
            if pos + flen > self.wt_buf.len() {
                pos = start;
                break;
            }
            let payload = self.wt_buf[pos..pos + flen].to_vec();
            pos += flen;
            if ftype == h3::FRAME_HEADERS {
                for (n, v) in h3::qpack_decode(&payload) {
                    if n == b":status" {
                        if let Ok(code) = std::str::from_utf8(&v).unwrap_or("").parse::<u16>() {
                            self.wt_status = Some(code);
                            self.events.push(format!("wt-status:{code}"));
                        }
                    }
                }
            }
        }
        self.wt_buf.drain(..pos);
    }

    fn write_all(&mut self, id: StreamId, data: &[u8]) -> Result<(), JsError> {
        let mut off = 0;
        while off < data.len() {
            match self.conn.send_stream(id).write(&data[off..]) {
                Ok(n) => off += n,
                Err(WriteError::Blocked) => {
                    return Err(JsError::new("stream write blocked (flow control)"))
                }
                Err(e) => return Err(JsError::new(&format!("write: {e}"))),
            }
        }
        Ok(())
    }

    // ---- M1 datagram pump --------------------------------------------------

    pub fn recv(&mut self, elapsed_ms: f64, data: &[u8]) -> Option<Vec<u8>> {
        let now = self.now(elapsed_ms);
        // Strip the RUPP wrapper (and harvest the session tag) if enabled.
        let quic: Vec<u8> = if let Some(r) = &mut self.rupp {
            match r.strip(data) {
                Some(q) => q,
                None => return None,
            }
        } else {
            data.to_vec()
        };
        let mut resp = Vec::new();
        let out = match self.endpoint.handle(
            now,
            self.remote,
            None::<IpAddr>,
            None,
            BytesMut::from(&quic[..]),
            &mut resp,
        ) {
            Some(DatagramEvent::ConnectionEvent(_h, ev)) => {
                self.conn.handle_event(ev);
                None
            }
            Some(DatagramEvent::Response(t)) => {
                let pkt = &resp[..t.size];
                Some(match &self.rupp {
                    Some(r) => r.wrap(self.conn.is_handshaking(), pkt),
                    None => pkt.to_vec(),
                })
            }
            _ => None,
        };
        self.pump_endpoint();
        self.drain();
        self.pump_streams();
        out
    }

    pub fn next_transmit(&mut self, elapsed_ms: f64) -> Option<Vec<u8>> {
        let now = self.now(elapsed_ms);
        let handshaking = self.conn.is_handshaking();
        let mut buf = Vec::new();
        let out = self.conn.poll_transmit(now, 1, &mut buf).map(|t| {
            let pkt = &buf[..t.size];
            match &self.rupp {
                Some(r) => r.wrap(handshaking, pkt),
                None => pkt.to_vec(),
            }
        });
        self.pump_endpoint();
        self.drain();
        out
    }

    pub fn timeout_ms(&mut self, elapsed_ms: f64) -> Option<f64> {
        self.conn.poll_timeout().map(|t| {
            let now = self.now(elapsed_ms);
            if t <= now {
                0.0
            } else {
                t.duration_since(now).as_secs_f64() * 1000.0
            }
        })
    }

    pub fn on_timeout(&mut self, elapsed_ms: f64) {
        self.conn.handle_timeout(self.now(elapsed_ms));
        self.pump_endpoint();
        self.drain();
        self.pump_streams();
    }

    pub fn take_events(&mut self) -> String {
        let s = self.events.join("\n");
        self.events.clear();
        s
    }

    pub fn established(&self) -> bool {
        !self.conn.is_handshaking()
    }

    // ---- M2 WebTransport ---------------------------------------------------

    /// After `connected`, open the h3 control/qpack streams and send the
    /// extended CONNECT for a WebTransport session at `path`.
    pub fn start_webtransport(&mut self, authority: &str, path: &str) -> Result<(), JsError> {
        let ctrl = self
            .conn
            .streams()
            .open(Dir::Uni)
            .ok_or_else(|| JsError::new("no uni stream for control"))?;
        self.write_all(ctrl, &h3::control_stream_bytes())?;

        let enc = self.conn.streams().open(Dir::Uni).ok_or_else(|| JsError::new("no uni (enc)"))?;
        self.write_all(enc, &[h3::STREAM_QPACK_ENCODER as u8])?;
        let dec = self.conn.streams().open(Dir::Uni).ok_or_else(|| JsError::new("no uni (dec)"))?;
        self.write_all(dec, &[h3::STREAM_QPACK_DECODER as u8])?;

        let req = self
            .conn
            .streams()
            .open(Dir::Bi)
            .ok_or_else(|| JsError::new("no bidi stream for CONNECT"))?;
        self.write_all(req, &h3::webtransport_connect(authority.as_bytes(), path.as_bytes()))?;
        let sid: u64 = req.into();
        self.wt_stream = Some(req);
        self.wt_session = sid;
        self.wt_quarter = sid / 4;
        Ok(())
    }

    pub fn wt_status(&self) -> Option<u16> {
        self.wt_status
    }

    // ---- WebTransport streams (M4) ----------------------------------------
    // Transparent plumbing for the engine's channel streams. The wasm writes
    // the WT stream header; the engine's own framing (06 01 .., 0xf8 challenge,
    // etc.) rides inside and is handled by the engine, not here.

    fn open_wt_stream(&mut self, dir: Dir, signal: u64) -> Result<f64, JsError> {
        let id = self
            .conn
            .streams()
            .open(dir)
            .ok_or_else(|| JsError::new("no stream available"))?;
        let mut hdr = Vec::new();
        h3::put_varint(&mut hdr, signal);
        h3::put_varint(&mut hdr, self.wt_session);
        self.write_all(id, &hdr)?;
        let key: u64 = id.into();
        self.my_wt.insert(key, id);
        Ok(key as f64)
    }

    /// Open a WebTransport bidirectional stream (0x41 signal). Returns its id.
    pub fn wt_open_bidi(&mut self) -> Result<f64, JsError> {
        self.open_wt_stream(Dir::Bi, 0x41)
    }

    /// Open a WebTransport unidirectional (send) stream (0x54 signal).
    pub fn wt_open_uni(&mut self) -> Result<f64, JsError> {
        self.open_wt_stream(Dir::Uni, 0x54)
    }

    pub fn wt_write(&mut self, stream: f64, data: &[u8]) -> Result<(), JsError> {
        let id = *self
            .my_wt
            .get(&(stream as u64))
            .ok_or_else(|| JsError::new("unknown wt stream"))?;
        self.write_all(id, data)
    }

    pub fn wt_finish(&mut self, stream: f64) -> Result<(), JsError> {
        let id = *self
            .my_wt
            .get(&(stream as u64))
            .ok_or_else(|| JsError::new("unknown wt stream"))?;
        self.conn
            .send_stream(id)
            .finish()
            .map_err(|e| JsError::new(&format!("finish: {e}")))
    }

    /// Pop one inbound WebTransport stream chunk, packed as
    /// [stream id: u64 be][fin: 1 byte][data...], or `undefined` if none.
    pub fn wt_poll_stream(&mut self) -> Option<Vec<u8>> {
        if self.incoming.is_empty() {
            return None;
        }
        let (id, data, fin) = self.incoming.remove(0);
        let mut out = Vec::with_capacity(9 + data.len());
        out.extend_from_slice(&id.to_be_bytes());
        out.push(fin as u8);
        out.extend_from_slice(&data);
        Some(out)
    }

    /// Send a WebTransport datagram (H3 datagram = quarter-stream-id + payload).
    pub fn wt_send_datagram(&mut self, data: &[u8]) -> Result<(), JsError> {
        let mut payload = Vec::new();
        h3::put_varint(&mut payload, self.wt_quarter);
        payload.extend_from_slice(data);
        self.conn
            .datagrams()
            .send(Bytes::from(payload), true)
            .map_err(|e| JsError::new(&format!("wt datagram: {e}")))
    }

    /// Receive one WebTransport datagram payload (quarter-stream-id stripped).
    pub fn wt_recv_datagram(&mut self) -> Option<Vec<u8>> {
        let b = self.conn.datagrams().recv()?;
        let mut pos = 0usize;
        let _qid = h3::get_varint(&b, &mut pos)?;
        Some(b[pos..].to_vec())
    }
}

#[wasm_bindgen]
pub fn blox_wt_version() -> String {
    format!("blox-wt {} (M5 integration)", env!("CARGO_PKG_VERSION"))
}

#[wasm_bindgen(start)]
pub fn start() {}

#[cfg(test)]
mod tests {
    use super::Rupp;

    fn rupp() -> Rupp {
        Rupp { token: [0xAA; 16], ip: [1, 2, 3, 4], port: 0x1234, session: None }
    }

    #[test]
    fn wrap_handshake_exact_bytes() {
        let r = rupp();
        let out = r.wrap(true, &[0xDE, 0xAD]);
        let mut want = vec![0x01, 0x00, 0x00, 0x1F, 0x01, 0x11, 0x01];
        want.extend_from_slice(&[0xAA; 16]);
        want.extend_from_slice(&[0x02, 0x06, 1, 2, 3, 4, 0x12, 0x34, 0xDE, 0xAD]);
        assert_eq!(out, want);
        // total (0x001F = 31) must equal header length (everything before QUIC)
        assert_eq!(u16::from_be_bytes([out[2], out[3]]) as usize, out.len() - 2);
    }

    #[test]
    fn round_trip_strips_to_quic() {
        let mut r = rupp();
        let quic = b"\x01\x02\x03some-quic-packet";
        let wrapped = r.wrap(true, quic);
        assert_eq!(r.strip(&wrapped).unwrap(), quic);
    }

    #[test]
    fn harvests_subtype2_session_tag() {
        let mut r = rupp();
        // a server packet whose TLV1 is subtype-2 with a fresh tag
        let tag = [0xBB; 16];
        let mut body = vec![0x01u8, 0x11, 0x02];
        body.extend_from_slice(&tag);
        body.extend_from_slice(&[0x02, 0x06, 1, 2, 3, 4, 0x12, 0x34]);
        let total = 4 + body.len();
        let mut pkt = vec![0x01, 0x00];
        pkt.extend_from_slice(&(total as u16).to_be_bytes());
        pkt.extend_from_slice(&body);
        pkt.extend_from_slice(b"quic");
        assert_eq!(r.strip(&pkt).unwrap(), b"quic");
        assert_eq!(r.session, Some(tag));
        // post-handshake wrap now reflects the harvested tag, not the token
        let w = r.wrap(false, &[]);
        assert_eq!(&w[7..23], &tag);
    }
}
