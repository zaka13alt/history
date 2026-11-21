//! Minimal HTTP/3 + WebTransport client bits, hand-rolled on quinn-proto's
//! stream API (the `h3` crate is async; we need sans-IO for wasm).
//!
//! Only what a WebTransport client needs: QUIC varints, a SETTINGS frame that
//! enables WebTransport + H3 datagrams + the CONNECT protocol, an extended
//! CONNECT request (QPACK-encoded), response-status decode, and H3-datagram
//! (de)framing. QPACK runs with a zero-size dynamic table, so encoding uses
//! only literal-with-literal-name and decoding handles indexed-static /
//! literal-with-name-ref / literal-with-literal-name.

// ---- QUIC varint ----------------------------------------------------------

pub fn put_varint(out: &mut Vec<u8>, v: u64) {
    if v < 0x40 {
        out.push(v as u8);
    } else if v < 0x4000 {
        out.extend_from_slice(&((v as u16) | 0x4000).to_be_bytes());
    } else if v < 0x4000_0000 {
        out.extend_from_slice(&((v as u32) | 0x8000_0000).to_be_bytes());
    } else {
        out.extend_from_slice(&(v | 0xc000_0000_0000_0000).to_be_bytes());
    }
}

/// Read a varint from `b` at `*pos`, advancing it. None if truncated.
pub fn get_varint(b: &[u8], pos: &mut usize) -> Option<u64> {
    let first = *b.get(*pos)?;
    let len = 1usize << (first >> 6);
    if *pos + len > b.len() {
        return None;
    }
    let mut v = (first & 0x3f) as u64;
    for i in 1..len {
        v = (v << 8) | b[*pos + i] as u64;
    }
    *pos += len;
    Some(v)
}

// ---- QPACK integer with N-bit prefix --------------------------------------

fn put_prefixed_int(out: &mut Vec<u8>, prefix_bits: u8, flags: u8, mut value: u64) {
    let max = (1u64 << prefix_bits) - 1;
    if value < max {
        out.push(flags | value as u8);
        return;
    }
    out.push(flags | max as u8);
    value -= max;
    while value >= 128 {
        out.push((value as u8 & 0x7f) | 0x80);
        value >>= 7;
    }
    out.push(value as u8);
}

fn get_prefixed_int(b: &[u8], pos: &mut usize, prefix_bits: u8) -> Option<u64> {
    let max = (1u64 << prefix_bits) - 1;
    let first = *b.get(*pos)? as u64;
    *pos += 1;
    let mut value = first & max;
    if value < max {
        return Some(value);
    }
    let mut m = 0u32;
    loop {
        let byte = *b.get(*pos)?;
        *pos += 1;
        value += ((byte & 0x7f) as u64) << m;
        if byte & 0x80 == 0 {
            break;
        }
        m += 7;
    }
    Some(value)
}

// QPACK static table entries we may need to *decode* from a response (the
// encoder only emits literal-literal-name, so it needs none). Index -> (name,
// value). Covers :status plus a few aioquic commonly emits.
fn static_entry(i: u64) -> Option<(&'static [u8], &'static [u8])> {
    Some(match i {
        24 => (b":status", b"103"),
        25 => (b":status", b"200"),
        26 => (b":status", b"304"),
        27 => (b":status", b"404"),
        28 => (b":status", b"503"),
        63 => (b":status", b"100"),
        64 => (b":status", b"204"),
        65 => (b":status", b"206"),
        66 => (b":status", b"302"),
        67 => (b":status", b"400"),
        68 => (b":status", b"403"),
        69 => (b":status", b"421"),
        70 => (b":status", b"425"),
        71 => (b":status", b"500"),
        _ => return None,
    })
}

// ---- QPACK encode (request) -----------------------------------------------

/// Encode a header list as a QPACK field section with no dynamic table, using
/// only literal-field-line-with-literal-name entries.
pub fn qpack_encode(headers: &[(&[u8], &[u8])]) -> Vec<u8> {
    let mut out = Vec::new();
    out.push(0x00); // Required Insert Count = 0
    out.push(0x00); // S=0, Delta Base = 0
    for (name, value) in headers {
        // Literal Field Line With Literal Name: 0b0010_0000, N=0 H=0,
        // name length with a 3-bit prefix.
        put_prefixed_int(&mut out, 3, 0x20, name.len() as u64);
        out.extend_from_slice(name);
        // value: H=0, 7-bit length prefix.
        put_prefixed_int(&mut out, 7, 0x00, value.len() as u64);
        out.extend_from_slice(value);
    }
    out
}

// ---- QPACK decode (response) ----------------------------------------------

pub fn qpack_decode(b: &[u8]) -> Vec<(Vec<u8>, Vec<u8>)> {
    let mut pos = 0usize;
    let mut out = Vec::new();
    // field section prefix: Required Insert Count, then S + Delta Base.
    let _ric = get_varint_qpack(b, &mut pos, 8);
    let _base = get_varint_qpack(b, &mut pos, 7);
    while pos < b.len() {
        let byte = b[pos];
        if byte & 0x80 != 0 {
            // Indexed Field Line: 1 T index(6)
            let is_static = byte & 0x40 != 0;
            let idx = match get_prefixed_int(b, &mut pos, 6) {
                Some(v) => v,
                None => break,
            };
            if is_static {
                if let Some((n, v)) = static_entry(idx) {
                    out.push((n.to_vec(), v.to_vec()));
                } else {
                    out.push((b"?".to_vec(), Vec::new()));
                }
            } else {
                out.push((b"?dyn".to_vec(), Vec::new()));
            }
        } else if byte & 0x40 != 0 {
            // Literal With Name Reference: 0 1 N T index(4)
            let is_static = byte & 0x10 != 0;
            let idx = match get_prefixed_int(b, &mut pos, 4) {
                Some(v) => v,
                None => break,
            };
            let name = if is_static {
                static_entry(idx).map(|(n, _)| n.to_vec()).unwrap_or_default()
            } else {
                b"?dyn".to_vec()
            };
            let value = match read_string(b, &mut pos, 7) {
                Some(v) => v,
                None => break,
            };
            out.push((name, value));
        } else if byte & 0x20 != 0 {
            // Literal With Literal Name: 0 0 1 N H namelen(3)
            let name = match read_string(b, &mut pos, 3) {
                Some(v) => v,
                None => break,
            };
            let value = match read_string(b, &mut pos, 7) {
                Some(v) => v,
                None => break,
            };
            out.push((name, value));
        } else {
            break; // post-base forms unused with a zero dynamic table
        }
    }
    out
}

// QPACK prefixed integer where the whole first byte's low bits are the prefix
// (used for the field-section-prefix fields).
fn get_varint_qpack(b: &[u8], pos: &mut usize, prefix_bits: u8) -> Option<u64> {
    get_prefixed_int(b, pos, prefix_bits)
}

// Read a QPACK string: H flag at bit (prefix_bits), length prefix, bytes. We
// never advertise huffman, and aioquic won't huffman-encode what it sends us
// for these short values, so H is treated as "not supported" -> raw copy.
fn read_string(b: &[u8], pos: &mut usize, prefix_bits: u8) -> Option<Vec<u8>> {
    let huff = (*b.get(*pos)? & (1 << prefix_bits)) != 0;
    let len = get_prefixed_int(b, pos, prefix_bits)? as usize;
    if *pos + len > b.len() {
        return None;
    }
    let raw = b[*pos..*pos + len].to_vec();
    *pos += len;
    if huff {
        huffman_decode(&raw)
    } else {
        Some(raw)
    }
}

// Minimal HPACK/QPACK huffman decode, only needed if a server huffman-codes a
// value. Implemented lazily: return None (caller treats as decode miss) — the
// aioquic test server and Roblox edge send these short pseudo-headers raw.
fn huffman_decode(_raw: &[u8]) -> Option<Vec<u8>> {
    None
}

// ---- H3 frame + SETTINGS --------------------------------------------------

pub const FRAME_DATA: u64 = 0x00;
pub const FRAME_HEADERS: u64 = 0x01;
pub const FRAME_SETTINGS: u64 = 0x04;

pub const STREAM_CONTROL: u64 = 0x00;
pub const STREAM_QPACK_ENCODER: u64 = 0x02;
pub const STREAM_QPACK_DECODER: u64 = 0x03;
pub const STREAM_WEBTRANSPORT_UNI: u64 = 0x54;

// SETTINGS identifiers
const S_QPACK_MAX_TABLE_CAPACITY: u64 = 0x01;
const S_MAX_FIELD_SECTION_SIZE: u64 = 0x06;
const S_QPACK_BLOCKED_STREAMS: u64 = 0x07;
const S_ENABLE_CONNECT_PROTOCOL: u64 = 0x08;
const S_H3_DATAGRAM: u64 = 0x33;
const S_ENABLE_WEBTRANSPORT: u64 = 0x2b60_3742;
const S_WT_MAX_SESSIONS: u64 = 0xc671_706a;

/// Control stream contents: stream type 0x00 followed by a SETTINGS frame that
/// turns on WebTransport, H3 datagrams and the extended CONNECT protocol.
pub fn control_stream_bytes() -> Vec<u8> {
    let mut settings = Vec::new();
    let pairs: [(u64, u64); 6] = [
        (S_QPACK_MAX_TABLE_CAPACITY, 0),
        (S_QPACK_BLOCKED_STREAMS, 0),
        (S_ENABLE_CONNECT_PROTOCOL, 1),
        (S_H3_DATAGRAM, 1),
        (S_ENABLE_WEBTRANSPORT, 1),
        (S_WT_MAX_SESSIONS, 1),
    ];
    let _ = S_MAX_FIELD_SECTION_SIZE;
    for (id, val) in pairs {
        put_varint(&mut settings, id);
        put_varint(&mut settings, val);
    }
    let mut out = Vec::new();
    put_varint(&mut out, STREAM_CONTROL);
    put_varint(&mut out, FRAME_SETTINGS);
    put_varint(&mut out, settings.len() as u64);
    out.extend_from_slice(&settings);
    out
}

/// A HEADERS frame wrapping a QPACK field section.
pub fn headers_frame(field_section: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    put_varint(&mut out, FRAME_HEADERS);
    put_varint(&mut out, field_section.len() as u64);
    out.extend_from_slice(field_section);
    out
}

/// Extended CONNECT request headers for a WebTransport session.
pub fn webtransport_connect(authority: &[u8], path: &[u8]) -> Vec<u8> {
    let headers: [(&[u8], &[u8]); 5] = [
        (b":method", b"CONNECT"),
        (b":protocol", b"webtransport"),
        (b":scheme", b"https"),
        (b":authority", authority),
        (b":path", path),
    ];
    headers_frame(&qpack_encode(&headers))
}
