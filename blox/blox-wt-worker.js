let wasm_bindgen = (function(exports) {
    let script_src;
    if (typeof document !== 'undefined' && document.currentScript !== null) {
        script_src = new URL(document.currentScript.src, location.href).toString();
    }

    class QuicConn {
        __destroy_into_raw() {
            const ptr = this.__wbg_ptr;
            this.__wbg_ptr = 0;
            QuicConnFinalization.unregister(this);
            return ptr;
        }
        free() {
            const ptr = this.__destroy_into_raw();
            wasm.__wbg_quicconn_free(ptr, 0);
        }
        /**
         * @returns {boolean}
         */
        established() {
            const ret = wasm.quicconn_established(this.__wbg_ptr);
            return ret !== 0;
        }
        /**
         * @param {string} server_name
         * @param {string} remote
         * @param {string | null} [alpn]
         */
        constructor(server_name, remote, alpn) {
            let ptr0, len0, ptr1, len1, ptr2, len2;
            try {
                ptr0 = passStringToWasm0(server_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
                len0 = WASM_VECTOR_LEN;
                ptr1 = passStringToWasm0(remote, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
                len1 = WASM_VECTOR_LEN;
                ptr2 = isLikeNone(alpn) ? 0 : passStringToWasm0(alpn, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
                len2 = WASM_VECTOR_LEN;
            } catch (e) {
                if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 1, 1); }
                if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
                if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
                throw e;
            }
            const ret = wasm.quicconn_new(ptr0, len0, ptr1, len1, ptr2, len2);
            if (ret[2]) {
                throw takeFromExternrefTable0(ret[1]);
            }
            this.__wbg_ptr = ret[0];
            QuicConnFinalization.register(this, this.__wbg_ptr, this);
            return this;
        }
        /**
         * @param {number} elapsed_ms
         * @returns {Uint8Array | undefined}
         */
        next_transmit(elapsed_ms) {
            const ret = wasm.quicconn_next_transmit(this.__wbg_ptr, elapsed_ms);
            let v1;
            if (ret[0] !== 0) {
                v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
                wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
            }
            return v1;
        }
        /**
         * @param {number} elapsed_ms
         */
        on_timeout(elapsed_ms) {
            wasm.quicconn_on_timeout(this.__wbg_ptr, elapsed_ms);
        }
        /**
         * @param {number} elapsed_ms
         * @param {Uint8Array | number[]} data
         * @returns {Uint8Array | undefined}
         */
        recv(elapsed_ms, data) {
            const val2 = +elapsed_ms;
            const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.quicconn_recv(this.__wbg_ptr, val2, ptr0, len0);
            let v3;
            if (ret[0] !== 0) {
                v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
                wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
            }
            return v3;
        }
        /**
         * Enable RUPP wrapping toward the Roblox UDMux edge. `token` is the 16-byte
         * NetStackTokenValue; `rcc_ip`/`rcc_port` come from the join script. Leave
         * unset for plain QUIC (e.g. tests).
         * @param {Uint8Array | number[]} token
         * @param {string} rcc_ip
         * @param {number} rcc_port
         */
        set_rupp(token, rcc_ip, rcc_port) {
            const val3 = +rcc_port;
            let ptr0, len0, ptr1, len1;
            try {
                ptr0 = passArray8ToWasm0(token, wasm.__wbindgen_malloc);
                len0 = WASM_VECTOR_LEN;
                ptr1 = passStringToWasm0(rcc_ip, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
                len1 = WASM_VECTOR_LEN;
            } catch (e) {
                if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
                if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
                throw e;
            }
            const ret = wasm.quicconn_set_rupp(this.__wbg_ptr, ptr0, len0, ptr1, len1, val3);
            if (ret[1]) {
                throw takeFromExternrefTable0(ret[0]);
            }
        }
        /**
         * After `connected`, open the h3 control/qpack streams and send the
         * extended CONNECT for a WebTransport session at `path`.
         * @param {string} authority
         * @param {string} path
         */
        start_webtransport(authority, path) {
            let ptr0, len0, ptr1, len1;
            try {
                ptr0 = passStringToWasm0(authority, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
                len0 = WASM_VECTOR_LEN;
                ptr1 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
                len1 = WASM_VECTOR_LEN;
            } catch (e) {
                if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
                if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
                throw e;
            }
            const ret = wasm.quicconn_start_webtransport(this.__wbg_ptr, ptr0, len0, ptr1, len1);
            if (ret[1]) {
                throw takeFromExternrefTable0(ret[0]);
            }
        }
        /**
         * @returns {string}
         */
        take_events() {
            let deferred1_0;
            let deferred1_1;
            try {
                const ret = wasm.quicconn_take_events(this.__wbg_ptr);
                deferred1_0 = ret[0];
                deferred1_1 = ret[1];
                return getStringFromWasm0(ret[0], ret[1]);
            } finally {
                wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
            }
        }
        /**
         * @param {number} elapsed_ms
         * @returns {number | undefined}
         */
        timeout_ms(elapsed_ms) {
            const ret = wasm.quicconn_timeout_ms(this.__wbg_ptr, elapsed_ms);
            return ret[0] === 0 ? undefined : ret[1];
        }
        /**
         * @param {number} stream
         */
        wt_finish(stream) {
            const ret = wasm.quicconn_wt_finish(this.__wbg_ptr, stream);
            if (ret[1]) {
                throw takeFromExternrefTable0(ret[0]);
            }
        }
        /**
         * Open a WebTransport bidirectional stream (0x41 signal). Returns its id.
         * @returns {number}
         */
        wt_open_bidi() {
            const ret = wasm.quicconn_wt_open_bidi(this.__wbg_ptr);
            if (ret[2]) {
                throw takeFromExternrefTable0(ret[1]);
            }
            return ret[0];
        }
        /**
         * Open a WebTransport unidirectional (send) stream (0x54 signal).
         * @returns {number}
         */
        wt_open_uni() {
            const ret = wasm.quicconn_wt_open_uni(this.__wbg_ptr);
            if (ret[2]) {
                throw takeFromExternrefTable0(ret[1]);
            }
            return ret[0];
        }
        /**
         * Pop one inbound WebTransport stream chunk, packed as
         * [stream id: u64 be][fin: 1 byte][data...], or `undefined` if none.
         * @returns {Uint8Array | undefined}
         */
        wt_poll_stream() {
            const ret = wasm.quicconn_wt_poll_stream(this.__wbg_ptr);
            let v1;
            if (ret[0] !== 0) {
                v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
                wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
            }
            return v1;
        }
        /**
         * Receive one WebTransport datagram payload (quarter-stream-id stripped).
         * @returns {Uint8Array | undefined}
         */
        wt_recv_datagram() {
            const ret = wasm.quicconn_wt_recv_datagram(this.__wbg_ptr);
            let v1;
            if (ret[0] !== 0) {
                v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
                wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
            }
            return v1;
        }
        /**
         * Send a WebTransport datagram (H3 datagram = quarter-stream-id + payload).
         * @param {Uint8Array | number[]} data
         */
        wt_send_datagram(data) {
            const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.quicconn_wt_send_datagram(this.__wbg_ptr, ptr0, len0);
            if (ret[1]) {
                throw takeFromExternrefTable0(ret[0]);
            }
        }
        /**
         * @returns {number | undefined}
         */
        wt_status() {
            const ret = wasm.quicconn_wt_status(this.__wbg_ptr);
            return ret === 0xFFFFFF ? undefined : ret;
        }
        /**
         * @param {number} stream
         * @param {Uint8Array | number[]} data
         */
        wt_write(stream, data) {
            const val2 = +stream;
            const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.quicconn_wt_write(this.__wbg_ptr, val2, ptr0, len0);
            if (ret[1]) {
                throw takeFromExternrefTable0(ret[0]);
            }
        }
    }
    if (Symbol.dispose) QuicConn.prototype[Symbol.dispose] = QuicConn.prototype.free;
    exports.QuicConn = QuicConn;

    /**
     * @returns {string}
     */
    function blox_wt_version() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.blox_wt_version();
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    exports.blox_wt_version = blox_wt_version;

    function start() {
        wasm.start();
    }
    exports.start = start;
    function __wbg_get_imports() {
        const import0 = {
            __proto__: null,
            __wbg_Error_208446807d0d1e30: function(arg0, arg1) {
                const ret = Error(getStringFromWasm0(arg0, arg1));
                return ret;
            },
            __wbg___wbindgen_is_function_741ff2bb612836f5: function(arg0) {
                const ret = typeof(arg0) === 'function';
                return ret;
            },
            __wbg___wbindgen_is_object_8b968c3ab8e96595: function(arg0) {
                const val = arg0;
                const ret = typeof(val) === 'object' && val !== null;
                return ret;
            },
            __wbg___wbindgen_is_string_fc456fee5d3317de: function(arg0) {
                const ret = typeof(arg0) === 'string';
                return ret;
            },
            __wbg___wbindgen_is_undefined_be5b34249ff1fc15: function(arg0) {
                const ret = arg0 === undefined;
                return ret;
            },
            __wbg___wbindgen_throw_4c88d8bf264fd984: function(arg0, arg1) {
                throw new Error(getStringFromWasm0(arg0, arg1));
            },
            __wbg_call_a410eb4b59ed5965: function() { return handleError(function (arg0, arg1, arg2) {
                const ret = arg0.call(arg1, arg2);
                return ret;
            }, arguments); },
            __wbg_crypto_23f565a907d30078: function(arg0) {
                const ret = arg0.crypto;
                return ret;
            },
            __wbg_getRandomValues_8b6f1f663e6f188d: function() { return handleError(function (arg0, arg1) {
                globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
            }, arguments); },
            __wbg_getRandomValues_d2908e0b99612b91: function() { return handleError(function (arg0, arg1) {
                arg0.getRandomValues(arg1);
            }, arguments); },
            __wbg_length_186163212ffe79c3: function(arg0) {
                const ret = arg0.length;
                return ret;
            },
            __wbg_msCrypto_d5f06fad6bf1409b: function(arg0) {
                const ret = arg0.msCrypto;
                return ret;
            },
            __wbg_new_with_length_01b143a7e5dd5a3e: function(arg0) {
                const ret = new Uint8Array(arg0 >>> 0);
                return ret;
            },
            __wbg_node_86166ff8ce1f2002: function(arg0) {
                const ret = arg0.node;
                return ret;
            },
            __wbg_now_463ac581d2fc7ea3: function() {
                const ret = Date.now();
                return ret;
            },
            __wbg_now_e7c6795a7f81e10f: function(arg0) {
                const ret = arg0.now();
                return ret;
            },
            __wbg_performance_7e4e4494fdc9d07a: function(arg0) {
                const ret = arg0.performance;
                return ret;
            },
            __wbg_process_91f425a63f58e399: function(arg0) {
                const ret = arg0.process;
                return ret;
            },
            __wbg_prototypesetcall_13162965d1fe7aa3: function(arg0, arg1, arg2) {
                Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
            },
            __wbg_randomFillSync_34b023059e3363de: function() { return handleError(function (arg0, arg1) {
                arg0.randomFillSync(arg1);
            }, arguments); },
            __wbg_require_9a7d8cc2e1d275c0: function() { return handleError(function () {
                const ret = module.require;
                return ret;
            }, arguments); },
            __wbg_static_accessor_GLOBAL_THIS_003ee833af9699fc: function() {
                const ret = typeof globalThis === 'undefined' ? undefined : globalThis;
                return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
            },
            __wbg_static_accessor_GLOBAL_e4293fb22cbe77da: function() {
                const ret = typeof global === 'undefined' ? undefined : global;
                return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
            },
            __wbg_static_accessor_SELF_53bb20457401453d: function() {
                const ret = typeof self === 'undefined' ? undefined : self;
                return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
            },
            __wbg_static_accessor_WINDOW_b5e0810bfecb7feb: function() {
                const ret = typeof window === 'undefined' ? undefined : window;
                return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
            },
            __wbg_subarray_58f388a9247ac0bb: function(arg0, arg1, arg2) {
                const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
                return ret;
            },
            __wbg_versions_6e128a981b0df859: function(arg0) {
                const ret = arg0.versions;
                return ret;
            },
            __wbindgen_generic_0000000000000001: function(arg0, arg1) {
                // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
                const ret = getArrayU8FromWasm0(arg0, arg1);
                return ret;
            },
            __wbindgen_generic_0000000000000002: function(arg0, arg1) {
                // Cast intrinsic for `Ref(String) -> Externref`.
                const ret = getStringFromWasm0(arg0, arg1);
                return ret;
            },
            __wbindgen_init_externref_table: function() {
                const table = wasm.__wbindgen_externrefs;
                table.set(0, undefined);
                table.set(1024, undefined);
                table.set(1025, null);
                table.set(1026, true);
                table.set(1027, false);
            },
        };
        return {
            __proto__: null,
            "./blox_wt_bg.js": import0,
        };
    }

    const QuicConnFinalization = (typeof FinalizationRegistry === 'undefined')
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry(ptr => wasm.__wbg_quicconn_free(ptr, 1));

    function addToExternrefTable0(obj) {
        const idx = wasm.__externref_table_alloc();
        wasm.__wbindgen_externrefs.set(idx, obj);
        return idx;
    }

    function getArrayU8FromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
    }

    function getStringFromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        return decodeText(getUint8ArrayMemory0().subarray(ptr, ptr + len));
    }

    let cachedUint8ArrayMemory0 = null;
    function getUint8ArrayMemory0() {
        if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
            cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
        }
        return cachedUint8ArrayMemory0;
    }

    function handleError(f, args) {
        try {
            return f.apply(this, args);
        } catch (e) {
            const idx = addToExternrefTable0(e);
            wasm.__wbindgen_exn_store(idx);
        }
    }

    function isLikeNone(x) {
        return x === undefined || x === null;
    }

    function passArray8ToWasm0(arg, malloc) {
        const ptr = malloc(arg.length * 1, 1) >>> 0;
        getUint8ArrayMemory0().set(arg, ptr / 1);
        WASM_VECTOR_LEN = arg.length;
        return ptr;
    }

    function passStringToWasm0(arg, malloc, realloc) {
        if (realloc === undefined) {
            const buf = cachedTextEncoder.encode(arg);
            const ptr = malloc(buf.length, 1) >>> 0;
            getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
            WASM_VECTOR_LEN = buf.length;
            return ptr;
        }

        let len = arg.length;
        let ptr = malloc(len, 1) >>> 0;

        const mem = getUint8ArrayMemory0();

        let offset = 0;

        for (; offset < len; offset++) {
            const code = arg.charCodeAt(offset);
            if (code > 0x7F) break;
            mem[ptr + offset] = code;
        }
        if (offset !== len) {
            if (offset !== 0) {
                arg = arg.slice(offset);
            }
            ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
            const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
            const ret = cachedTextEncoder.encodeInto(arg, view);

            offset += ret.written;
            ptr = realloc(ptr, len, offset, 1) >>> 0;
        }

        WASM_VECTOR_LEN = offset;
        return ptr;
    }

    function takeFromExternrefTable0(idx) {
        const value = wasm.__wbindgen_externrefs.get(idx);
        wasm.__externref_table_dealloc(idx);
        return value;
    }

    let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
    cachedTextDecoder.decode();
    function decodeText(bytes) {
        return cachedTextDecoder.decode(bytes);
    }

    const cachedTextEncoder = new TextEncoder();

    if (!('encodeInto' in cachedTextEncoder)) {
        cachedTextEncoder.encodeInto = function (arg, view) {
            const buf = cachedTextEncoder.encode(arg);
            view.set(buf);
            return {
                read: arg.length,
                written: buf.length
            };
        };
    }

    let WASM_VECTOR_LEN = 0;

    let wasmModule, wasmInstance, wasm;
    function __wbg_finalize_init(instance, module) {
        wasmInstance = instance;
        wasm = instance.exports;
        wasmModule = module;
        cachedUint8ArrayMemory0 = null;
        wasm.__wbindgen_start();
        return wasm;
    }

    async function __wbg_load(module, imports) {
        if (typeof Response === 'function' && module instanceof Response) {
            if (!module.ok) {
                throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
            }

            if (typeof WebAssembly.instantiateStreaming === 'function') {
                try {
                    return await WebAssembly.instantiateStreaming(module, imports);
                } catch (e) {
                    const validResponse = expectedResponseType(module.type);

                    if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                        console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                    } else { throw e; }
                }
            }

            const bytes = await module.arrayBuffer();
            return await WebAssembly.instantiate(bytes, imports);
        } else {
            const instance = await WebAssembly.instantiate(module, imports);

            if (instance instanceof WebAssembly.Instance) {
                return { instance, module };
            } else {
                return instance;
            }
        }

        function expectedResponseType(type) {
            switch (type) {
                case 'basic': case 'cors': case 'default': return true;
            }
            return false;
        }
    }

    function initSync(module) {
        if (wasm !== undefined) return wasm;


        if (module !== undefined) {
            if (Object.getPrototypeOf(module) === Object.prototype) {
                ({module} = module)
            } else {
                console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
            }
        }

        const imports = __wbg_get_imports();
        if (!(module instanceof WebAssembly.Module)) {
            module = new WebAssembly.Module(module);
        }
        const instance = new WebAssembly.Instance(module, imports);
        return __wbg_finalize_init(instance, module);
    }

    let __wbg_init_promise;
    async function __wbg_init(module_or_path) {
        if (wasm !== undefined) return wasm;
        if (__wbg_init_promise === undefined) {
            __wbg_init_promise = __wbg_init_once(module_or_path);
            __wbg_init_promise.catch(() => { __wbg_init_promise = undefined; });
        }
        return __wbg_init_promise;
    }

    async function __wbg_init_once(module_or_path) {

        if (module_or_path !== undefined) {
            if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
                ({module_or_path} = module_or_path)
            } else {
                console.warn('using deprecated parameters for the initialization function; pass a single object instead')
            }
        }

        if (module_or_path === undefined && script_src !== undefined) {
            module_or_path = script_src.replace(/\.js$/, "_bg.wasm");
        }
        const imports = __wbg_get_imports();

        if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
            module_or_path = fetch(module_or_path);
        }

        const { instance, module } = await __wbg_load(await module_or_path, imports);

        return __wbg_finalize_init(instance, module);
    }

    return Object.assign(__wbg_init, { initSync }, exports);
})({ __proto__: null });
// Classic-worker install of BloxWebTransport, for the engine's em-pthread realm.
// This file is CONCATENATED after the no-modules wasm binding (which declares
// `wasm_bindgen` at top level), so the closures below capture `wasm_bindgen`.
// Exposes self.__bloxInstallWT(wispUrl, wasmUrl): sets self.WebTransport
// synchronously and kicks off async wasm init. A classic (no import/export)
// port of wt-shim.js + wisp-udp.js so it runs inside a classic Web Worker.
(function () {
  if (typeof self === "undefined" || self.__bloxInstallWT) return;

  var wasmReady = null;
  var WISP_URL = null;
  var NATIVE_WT = null; // the realm's real WebTransport, for non-game URLs

  // ---- wisp-udp (classic) ----
  var T_CONNECT = 1, T_DATA = 2, T_CONTINUE = 3, T_CLOSE = 4, T_INFO = 5, SID = 1;
  function openWispUdp(wispUrl, host, port) {
    return new Promise(function (resolve, reject) {
      var ws = new WebSocket(wispUrl);
      ws.binaryType = "arraybuffer";
      var api = { onDatagram: null, onClose: null, send: send, close: close, _ready: false };
      var connectSent = false;
      function frame(type, sid, payload) {
        var p = payload || new Uint8Array(0);
        var b = new Uint8Array(5 + p.length);
        var dv = new DataView(b.buffer);
        b[0] = type; dv.setUint32(1, sid, true); b.set(p, 5); return b;
      }
      function sendConnect() {
        if (connectSent) return; connectSent = true;
        var hb = new TextEncoder().encode(host);
        var payload = new Uint8Array(1 + 2 + hb.length);
        var dv = new DataView(payload.buffer);
        payload[0] = 0x02; dv.setUint16(1, port, true); payload.set(hb, 3);
        ws.send(frame(T_CONNECT, SID, payload)); api._ready = true; resolve(api);
      }
      function send(u8a) { if (ws.readyState === 1) ws.send(frame(T_DATA, SID, u8a)); }
      function close() {
        try { ws.send(frame(T_CLOSE, SID, new Uint8Array([2]))); } catch (e) {}
        try { ws.close(); } catch (e) {}
      }
      ws.onerror = function () { reject(new Error("wisp ws error")); };
      ws.onclose = function () { if (api.onClose) api.onClose("websocket closed"); if (!api._ready) reject(new Error("wisp closed before ready")); };
      ws.onmessage = function (ev) {
        var b = new Uint8Array(ev.data); if (b.length < 5) return;
        var type = b[0]; var dv = new DataView(b.buffer, b.byteOffset);
        var sid = dv.getUint32(1, true); var payload = b.subarray(5);
        if (type === T_INFO) { ws.send(frame(T_INFO, 0, new Uint8Array([2, 0]))); sendConnect(); }
        else if (type === T_CONTINUE) { sendConnect(); }
        else if (type === T_DATA) { if (sid === SID && api.onDatagram) api.onDatagram(payload); }
        else if (type === T_CLOSE) { if (api.onClose) api.onClose("wisp CLOSE reason 0x" + (payload[0] || 0).toString(16)); }
      };
    });
  }

  // ---- SNI parse ----
  function hexToBytes(h) { var b = new Uint8Array(h.length / 2); for (var i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16); return b; }
  function hexToIp(h) { return [0, 2, 4, 6].map(function (i) { return parseInt(h.substr(i, 2), 16); }).join("."); }
  function parseSni(host) {
    var dot = host.indexOf("."); var label0 = host.slice(0, dot);
    var vip = host.slice(dot + 1).split(".")[0];
    var parts = label0.split("-"); var tok = parts[0], rip = parts[1], rccHex = parts[2];
    if (!tok || !rip || !rccHex || tok.length !== 32 || rip.length !== 8 || vip.length !== 8)
      throw new Error("blox-wt: unrecognised qdmux SNI: " + host);
    return { token: hexToBytes(tok), rccIp: hexToIp(rip), rccPort: parseInt(rccHex, 16), udmuxIp: hexToIp(vip), sni: host };
  }
  function u8(chunk) { return chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk); }

  // ---- BloxWebTransport (classic) ----
  function BloxWebTransport(url, opts) {
    var u = new URL(url), j;
    try { j = parseSni(u.hostname); }
    catch (e) {
      // Not a game qdmux URL (engine probe / other endpoint). Delegate to the
      // real WebTransport so the engine never sees "no available transport".
      console.log("[blox] (worker) non-qdmux WebTransport -> native:", url);
      return new NATIVE_WT(url, opts);
    }
    console.log("[blox] (worker) BloxWebTransport constructed — PROXIED through blox-wt:", url);
    var self2 = this;
    var path = u.pathname + u.search;
    this._closeRes = null; this._closeRej = null;
    this.closed = new Promise(function (res, rej) { self2._closeRes = res; self2._closeRej = rej; });
    var readyRes, readyRej;
    this.ready = new Promise(function (res, rej) { readyRes = res; readyRej = rej; });
    this._dgIn = null;
    this.datagrams = {
      readable: new ReadableStream({ start: function (c) { self2._dgIn = c; } }),
      writable: new WritableStream({ write: function (chunk) { self2._conn && self2._conn.wt_send_datagram(u8(chunk)); } }),
    };
    this._uniIn = null;
    this.incomingUnidirectionalStreams = new ReadableStream({ start: function (c) { self2._uniIn = c; } });
    this.incomingBidirectionalStreams = new ReadableStream({ start: function () {} });
    this._streams = new Map();
    this._t0 = performance.now(); this._conn = null; this._udp = null; this._timer = null;
    this._start(j, path, readyRes, readyRej).catch(function (e) { readyRej(e); self2._closeRej && self2._closeRej(e); });
  }
  BloxWebTransport.prototype._now = function () { return performance.now() - this._t0; };
  BloxWebTransport.prototype._start = async function (j, path, readyRes, readyRej) {
    var self2 = this;
    await wasmReady;
    var conn = new wasm_bindgen.QuicConn(j.sni, j.udmuxIp + ":" + j.rccPort, "h3");
    conn.set_rupp(j.token, j.rccIp, j.rccPort);
    this._conn = conn;
    var udp = await openWispUdp(WISP_URL, j.udmuxIp, j.rccPort);
    this._udp = udp;
    udp.onDatagram = function (bytes) { var r = conn.recv(self2._now(), bytes); if (r) udp.send(r); self2._pump(); };
    udp.onClose = function () { self2._closeRes && self2._closeRes(); };
    var phase = "quic";
    this._drainEvents = function () {
      var e = conn.take_events(); if (!e) return;
      var lines = e.split("\n");
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line === "connected" && phase === "quic") { phase = "wt"; conn.start_webtransport(j.sni, path); }
        else if (line === "wt-status:200") { readyRes(); }
        else if (line.indexOf("wt-status:") === 0) { readyRej(new Error("WebTransport CONNECT: " + line)); }
        else if (line.indexOf("lost:") === 0) { self2._closeRej && self2._closeRej(new Error(line)); }
      }
    };
    this._pump();
  };
  BloxWebTransport.prototype._pump = function () {
    var conn = this._conn; if (!conn) return; var self2 = this;
    var dg; while ((dg = conn.next_transmit(this._now())) !== undefined) this._udp.send(dg);
    this._drainEvents && this._drainEvents();
    var d; while ((d = conn.wt_recv_datagram()) !== undefined) this._dgIn && this._dgIn.enqueue(d);
    var s; while ((s = conn.wt_poll_stream()) !== undefined) this._deliverStream(s);
    var ms = conn.timeout_ms(this._now());
    clearTimeout(this._timer);
    if (ms !== undefined) this._timer = setTimeout(function () { conn.on_timeout(self2._now()); self2._pump(); }, Math.max(0, ms));
  };
  BloxWebTransport.prototype._deliverStream = function (packed) {
    var dv = new DataView(packed.buffer, packed.byteOffset);
    var id = Number(dv.getBigUint64(0)); var fin = packed[8]; var data = packed.subarray(9);
    var entry = this._streams.get(id);
    if (!entry) { var ctrl; var rs = new ReadableStream({ start: function (c) { ctrl = c; } }); entry = { controller: ctrl }; this._streams.set(id, entry); this._uniIn && this._uniIn.enqueue(rs); }
    if (data.length) entry.controller.enqueue(new Uint8Array(data));
    if (fin) { try { entry.controller.close(); } catch (e) {} this._streams.delete(id); }
  };
  BloxWebTransport.prototype.createUnidirectionalStream = function () {
    var id = this._conn.wt_open_uni(); var self2 = this;
    return Promise.resolve(new WritableStream({ write: function (chunk) { self2._conn.wt_write(id, u8(chunk)); }, close: function () { self2._conn.wt_finish(id); } }));
  };
  BloxWebTransport.prototype.createBidirectionalStream = function () {
    var id = this._conn.wt_open_bidi(); var self2 = this; var ctrl;
    var readable = new ReadableStream({ start: function (c) { ctrl = c; } });
    this._streams.set(id, { controller: ctrl });
    var writable = new WritableStream({ write: function (chunk) { self2._conn.wt_write(id, u8(chunk)); }, close: function () { self2._conn.wt_finish(id); } });
    return Promise.resolve({ readable: readable, writable: writable });
  };
  BloxWebTransport.prototype.close = function () { this._udp && this._udp.close(); this._closeRes && this._closeRes(); };

  // Expose the no-modules init fn as a property of self, so a later
  // importScripts'd script in this same worker can reach it by self.wasm_bindgen
  // (top-level `let` from the binding is not guaranteed visible across scripts).
  try { self.wasm_bindgen = wasm_bindgen; } catch (e) {}

  // Install: set self.WebTransport now (class queues on wasmReady internally),
  // start wasm init. wasm_bindgen is the no-modules init fn declared above.
  self.__bloxInstallWT = function (wispUrl, wasmUrl) {
    WISP_URL = wispUrl || self.BLOX_WISP;
    if (!wasmReady) wasmReady = wasm_bindgen(wasmUrl || "/blox/blox_wt_bg.wasm");
    if (self.WebTransport !== BloxWebTransport) NATIVE_WT = self.WebTransport;
    self.WebTransport = BloxWebTransport;
    return wasmReady;
  };
})();
