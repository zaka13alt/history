"use strict";(()=>{var h=self.u2,O=["cross-origin-embedder-policy","cross-origin-opener-policy","cross-origin-resource-policy","content-security-policy","content-security-policy-report-only","expect-ct","feature-policy","origin-isolation","strict-zIWyC-security","upgrade-insecure-requests","x-content-type-options","x-download-options","x-frame-options","x-permitted-cross-domain-policies","x-powered-by","x-xss-protection"],C=["GET","HEAD"],g=class extends h.EventEmitter{constructor(e=__u22$config){super(),e.prefix||(e.prefix="/service/"),this.config=e,this.meir2Client=new h.meir2Client}route({request:e}){return!!e.url.startsWith(location.origin+this.config.prefix)}async fetch({request:e}){let s;try{if(!e.url.startsWith(location.origin+this.config.prefix))return await fetch(e);let t=new h(this.config);typeof this.config.construct=="function"&&this.config.construct(t,"service");let w=await t.cookie.db();t.meta.origin=location.origin,t.meta.base=t.meta.url=new URL(t.sourceUrl(e.url));let o=new v(e,t,C.includes(e.method.toUpperCase())?null:await e.blob());if(t.meta.url.protocol==="blob:"&&(o.blob=!0,o.base=o.url=new URL(o.url.pathname)),e.referrer&&e.referrer.startsWith(location.origin)){let i=new URL(t.sourceUrl(e.referrer));(o.headers.origin||t.meta.url.origin!==i.origin&&e.mode==="cors")&&(o.headers.origin=i.origin),o.headers.referer=i.href}let f=await t.cookie.getCookies(w)||[],x=t.cookie.serialize(f,t.meta,!1);o.headers["user-agent"]=navigator.userAgent,x&&(o.headers.cookie=x);let p=new u(o,null,null);if(this.emit("request",p),p.intercepted)return p.returnValue;s=o.blob?"blob:"+location.origin+o.url.pathname:o.url;let c=await this.meir2Client.fetch(s,{headers:o.headers,method:o.method,body:o.body,credentials:o.credentials,mode:o.mode,cache:o.cache,redirect:o.redirect}),r=new y(o,c),l=new u(r,null,null);if(this.emit("beforemod",l),l.intercepted)return l.returnValue;for(let i of O)r.headers[i]&&delete r.headers[i];if(r.headers.location&&(r.headers.location=t.rewriteUrl(r.headers.location)),["document","iframe"].includes(e.destination)){let i=r.getHeader("content-disposition");if(!/\s*?((inline|attachment);\s*?)filename=/i.test(i)){let n=/^\s*?attachment/i.test(i)?"attachment":"inline",[m]=new URL(c.finalURL).pathname.split("/").slice(-1);r.headers["content-disposition"]=`${n}; filename=${JSON.stringify(m)}`}}if(r.headers["set-cookie"]&&(Promise.resolve(t.cookie.setCookies(r.headers["set-cookie"],w,t.meta)).then(()=>{self.clients.matchAll().then(function(i){i.forEach(function(n){n.postMessage({msg:"updateCookies",url:t.meta.url.href})})})}),delete r.headers["set-cookie"]),r.body)switch(e.destination){case"script":r.body=t.js.rewrite(await c.text());break;case"worker":{let i=[t.bundleScript,t.clientScript,t.configScript,t.handlerScript].map(n=>JSON.stringify(n)).join(",");r.body=`if (!self.__u22) {
                                ${t.createJs_7b2Pq(t.cookie.serialize(f,t.meta,!0),e.referrer)}
                            importScripts(${i});
                            }
`,r.body+=t.js.rewrite(await c.text())}break;case"style":r.body=t.rewriteCSS(await c.text());break;case"iframe":case"document":if(r.getHeader("content-type")&&r.getHeader("content-type").startsWith("text/html")){let i=await c.text();if(Array.isArray(this.config._7b2Pq)){let n=i.indexOf("<head>"),m=i.indexOf("<HEAD>"),b=i.indexOf("<body>"),k=i.indexOf("<BODY>"),S=new URL(s),U=this.config._7b2Pq;for(let d of U)new RegExp(d.host).test(S.host)&&(d._7b2PqTo==="head"?(n!==-1||m!==-1)&&(i=i.slice(0,n)+`${d.html}`+i.slice(n)):d._7b2PqTo==="body"&&(b!==-1||k!==-1)&&(i=i.slice(0,b)+`${d.html}`+i.slice(b)))}r.body=t.rewriteHtml(i,{document:!0,_7b2PqHead:t.createHtml_7b2Pq(t.handlerScript,t.bundleScript,t.clientScript,t.configScript,t.cookie.serialize(f,t.meta,!0),e.referrer)})}break;default:break}return o.headers.accept==="text/event-stream"&&(r.headers["content-type"]="text/event-stream"),crossOriginIsolated&&(r.headers["Cross-Origin-Embedder-Policy"]="require-corp"),this.emit("response",l),l.intercepted?l.returnValue:new Response(r.body,{headers:r.headers,status:r.status,statusText:r.statusText})}catch(t){return["document","iframe"].includes(e.destination)?(console.error(t),T(t,s)):new Response(void 0,{status:500})}}static u2=h};self.fPvwK=g;var y=class{constructor(e,s){this.request=e,this.raw=s,this.u2=e.u2,this.headers={};for(let t in s.rawHeaders)this.headers[t.toLowerCase()]=s.rawHeaders[t];this.status=s.status,this.statusText=s.statusText,this.body=s.body}get url(){return this.request.url}get base(){return this.request.base}set base(e){this.request.base=e}getHeader(e){return Array.isArray(this.headers[e])?this.headers[e][0]:this.headers[e]}},v=class{constructor(e,s,t=null){this.u2=s,this.request=e,this.headers=Object.fromEntries(e.headers.entries()),this.method=e.method,this.body=t||null,this.cache=e.cache,this.redirect=e.redirect,this.credentials="omit",this.mode=e.mode==="cors"?e.mode:"same-origin",this.blob=!1}get url(){return this.u2.meta.url}set url(e){this.u2.meta.url=e}get base(){return this.u2.meta.base}set base(e){this.u2.meta.base=e}},u=class{#e;#t;constructor(e={},s=null,t=null){this.#e=!1,this.#t=null,this.data=e,this.target=s,this.that=t}get intercepted(){return this.#e}get returnValue(){return this.#t}respondWith(e){this.#t=e,this.#e=!0}};function E(a,e){let s=`
        errorTrace.value = ${JSON.stringify(a)};
        ftchuvl.textContent = ${JSON.stringify(e)};
        for (const node of document.querySelectorAll("#u22Hostname")) node.textContent = ${JSON.stringify(location.hostname)};
        reload.addEventListener("click", () => location.reload());
        u22Version.textContent = ${JSON.stringify("3.2.10")};
        u22Build.textContent = ${JSON.stringify("92d9074")};
    `;return`<!DOCTYPE html>
        <html>
        <head>
        <meta charset='utf-8' />
        <title>err0r</title>
        <style>
        * { background-color: white }
        </style>
        </head>
        <body>
        <h1 id='errorTitle'>Error processing your request</h1>
        <hr />
        <p>Failed to load <b id="ftchuvl"></b></p>
        <p id="errorMessage">Internal Server Error</p>
        <textarea id="errorTrace" cols="40" rows="10" readonly></textarea>
        <p>Try:</p>
        <ul>
        <li>Checking your internet connection</li>
        <li>Verifying you entered the correct address</li>
        <li>Clearing the site data</li>
        <li>Contacting <b id="u22Hostname"></b>'s administrator</li>
        <li>Verify the server isn't censored</li>
        </ul>
        <p>If you're the administrator of <b id="u22Hostname"></b>, try:</p>
        <ul>
        <li>Restarting your server</li>
        <li>Updating u2</li>
        <li>Troubleshooting the error on the <a href="https://github.com/" target="_blank">GitHub repo</a></li>
        </ul>
        <button id="reload">Reload</button>
        <hr />
        <p><i>u2 v<span id="u22Version"></span> (build <span id="u22Build"></span>)</i></p>
        <script src="${"data:application/javascript,"+encodeURIComponent(s)}"><\/script>
        </body>
        </html>
        `}function T(a,e){let s={"content-type":"text/html"};return crossOriginIsolated&&(s["Cross-Origin-Embedder-Policy"]="require-corp"),new Response(E(String(a),e),{status:500,headers:s})}})();
