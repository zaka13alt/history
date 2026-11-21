# blox-wt — client-side WASM QUIC for Roblox game joins

## Why this exists

Roblox's game edge only accepts the session as **QUIC** (ALPN `RbxTransport`,
RUPP-wrapped datagrams). Browsers can't emit raw QUIC, and `wisp`/epoxy is
TCP-only, so the game connection can't ride the proxy the normal way. The
upstream (RubiksHead/robloxWebport) solves this with a **server-side** Python
QUIC bridge (`quic_bridge.py`, aioquic) — but per-session QUIC on the server
is the lag we're avoiding.

**This project inverts that:** the QUIC stack is compiled to **WASM and runs
in each user's browser**. The server becomes a dumb UDP relay (`epoxy`
`udp:"direct"`), so it does *no* per-session QUIC crypto — the CPU lives on
the clients. Outgoing QUIC datagrams are tunnelled over a **Wisp UDP stream**
to epoxy, which sends them as real UDP to Roblox's UDMux edge and pipes the
replies back.

```
Roblox engine  --new WebTransport()-->  wt-shim.js (JS)
      |                                      |
      |  app streams/datagrams               |  QUIC datagrams (bytes)
      v                                      v
  blox_wt.wasm (quinn-proto + rustls, ALPN RbxTransport, RUPP)
      |  UDP datagrams in/out (bytes)
      v
  wisp-udp.js  --Wisp UDP stream-->  epoxy (udp:"direct")  --real UDP-->  Roblox UDMux
```

## Egress / IP note

`udp:"direct"` egresses from the host's real IP, **bypassing Mullvad**. To
keep game UDP inside the VPN, run the epoxy process inside the WireGuard netns
`mv` so its direct egress rides WG. Decide before M5. (TCP/API traffic keeps
going through the existing SOCKS→WG path regardless.)

## Milestones (each one compiles + is verified before the next)

- **M0 — pipeline.** Toolchain + a trivial `wasm-bindgen` export that loads in
  a browser. Proves rust→wasm→JS works. *(in progress)*
- **M1 — QUIC handshake in wasm.** `quinn-proto` + `rustls` (no-verify
  verifier, ALPN `RbxTransport`), driven purely by JS-fed datagrams over a
  Wisp UDP stream. De-risks the two unknowns: QUIC crypto building for
  `wasm32-unknown-unknown`, and the datagram transport. Success = a completed
  QUIC handshake to a reachable QUIC endpoint.
- **M2 — WebTransport session.** h3 extended-CONNECT (`:protocol
  webtransport`) + SETTINGS + `X-Rbx-Capabilities`; `WT_READY` equivalent.
- **M3 — RUPP + channels.** Port the RUPP TLV wrap/strip and the channel
  preambles / stream framing from `quic_bridge.py` (~1200 lines).
- **M4 — challenge gate.** The `0xf8`→`0x9b` GenericChallenge handling.
- **M5 — engine integration + live test.** Replace the engine's
  `new WebTransport` with `wt-shim.js`; full join; test in a browser on a real
  account (user drives the login).

## Crypto-in-wasm risk (M1)

`wasm32-unknown-unknown` has no system crypto. First try `rustls` with the
`ring` provider + `getrandom`'s `js` feature. If `ring`'s AEAD/asm doesn't
build for wasm, fall back to a pure-Rust provider (`rustls-rustcrypto`:
RustCrypto AES-GCM/ChaCha20). This is the first thing M1 proves.

## Layout

```
Cargo.toml          # rust crate (cdylib -> wasm)
src/lib.rs          # wasm entry; grows M0 -> M4
js/wisp-udp.js      # opens a Wisp UDP stream, pipes datagrams <-> wasm
js/wt-shim.js       # WebTransport-shaped object backed by the wasm QUIC conn
build.sh            # cargo build --target wasm32 + wasm-bindgen
```
