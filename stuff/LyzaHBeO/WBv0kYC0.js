var $K4q9p2XvController;(()=>{var e={805(e,t,r){r.d(t,{C:()=>o});class o{methods;id;sendRaw;counter=0;promiseCallbacks=new Map;constructor(e,t,r){this.methods=e,this.id=t,this.sendRaw=r}recieve(e){if(null==e||"object"!=typeof e)return;let t=e[this.id];if(null==t||"object"!=typeof t)return;let r=t.$type;if("response"===r){let e=t.$token,r=t.$data,o=t.$error,s=this.promiseCallbacks.get(e);if(!s)return;this.promiseCallbacks.delete(e),void 0!==o?s.reject(Error(o)):s.resolve(r)}else if("request"===r){let e=t.$method,r=t.$args;this.methods[e](r).then(e=>{this.sendRaw({[this.id]:{$type:"response",$token:t.$token,$data:e?.[0]}},e?.[1])}).catch(e=>{console.error(e),this.sendRaw({[this.id]:{$type:"response",$token:t.$token,$error:e?.toString()||"Unknown error"}},[])})}}call(e,t,r=[]){let o=this.counter++;return new Promise((s,i)=>{this.promiseCallbacks.set(o,{resolve:s,reject:i}),this.sendRaw({[this.id]:{$type:"request",$method:e,$args:t,$token:o}},r)})}}}},t={};function r(o){var s=t[o];if(void 0!==s)return s.exports;var i=t[o]={exports:{}};return e[o](i,i.exports,r),i.exports}r.d=(e,t)=>{for(var o in t)r.o(t,o)&&!r.o(e,o)&&Object.defineProperty(e,o,{enumerable:!0,get:t[o]})},r.o=(e,t)=>Object.prototype.hasOwnProperty.call(e,t),r.r=e=>{"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})};var o={};(()=>{r.r(o),r.d(o,{route:()=>a,shouldRoute:()=>n});var e=r(805);let t={};addEventListener("message",e=>{if(e.data&&"object"==typeof e.data){if(e.data.$sw$setCookieDone&&"object"==typeof e.data.$sw$setCookieDone){let r=e.data.$sw$setCookieDone,o=t[r.id];o&&(o(),delete t[r.id])}if(e.data.$sw$initRemoteTransport&&"object"==typeof e.data.$sw$initRemoteTransport){let{port:t,prefix:r}=e.data.$sw$initRemoteTransport,o=i.find(e=>new URL(r).pathname.startsWith(e.prefix));if(!o)return void console.error("No relevant controller found for transport init");o.rpc.call("initRemoteTransport",t,[t])}}});class s{prefix;id;rpc;constructor(r,o,s){this.prefix=r,this.id=o,this.rpc=new e.C({sendSetCookie:async({cookies:e,options:r})=>{let o=await self.clients.matchAll(),s=[],i=[],n=r?.destination==="document"||r?.destination==="iframe";for(let a of o){let o=Math.random().toString(36).substring(2,10);s.push(o),a.postMessage({$controller$setCookie:{cookies:e,options:r,id:o}}),n||i.push(new Promise(e=>{t[o]=()=>e(o)}))}if(i.length>0){let r,n=!1,a=new Promise(i=>{r=setTimeout(()=>{if(!n){let r=s.filter(e=>void 0!==t[e]);console.error(`timed out waiting for set cookie response (deadlock?): cookies=${e.length} clients=${o.length} pending=${r.length}/${s.length} clientUrls=${o.map(e=>e.url).join(",")}`)}i()},1e3)});try{await Promise.race([a,Promise.any(i).then(()=>{n=!0}).catch(()=>{})])}finally{for(let e of(void 0!==r&&clearTimeout(r),s))delete t[e]}}}},"tabchannel-"+o,(e,t)=>{s.postMessage(e,t)}),s.onmessage=e=>{this.rpc.recieve(e.data)},s.onmessageerror=console.error,this.rpc.call("ready",void 0)}}let i=[];function n(e){let t=new URL(e.request.url);return void 0!==i.find(e=>t.pathname.startsWith(e.prefix))}function K4qReal(proxied){try{var m=new URL(proxied).pathname.match(/^\/[^/]+\/[a-z0-9]+\/[a-z0-9]+\/(.+)$/i);if(m){var dec=decodeURIComponent(m[1]);var r=dec.match(/https?:\/\/.*/);return r?r[0]:dec;}}catch(e){}return proxied;}var K4qErrTpl=`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Failed to load</title>
<style>
  :root { --bg:#000000; --fg:#f5f5f5; --muted:#9aa0a6; --line:#292929; --accent:#4dadff; --panel:#101010; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif; display:flex; justify-content:center; padding:0 20px; min-height:100vh; }
  main { width:100%; max-width:600px; padding-top:clamp(40px,12vh,110px); padding-bottom:40px; }
  .icon { width:64px; height:64px; margin-bottom:22px; color:var(--muted); }
  h1 { font-size:1.6rem; font-weight:600; margin:0 0 16px; word-break:break-word; }
  p { color:var(--muted); line-height:1.55; margin:0 0 12px; font-size:.95rem; }
  ul { color:var(--muted); line-height:1.7; font-size:.95rem; margin:0 0 16px; padding-left:22px; }
  .err { font-size:.8rem; color:var(--muted); margin:18px 0 6px; }
  textarea { width:100%; height:64px; resize:none; background:var(--panel); color:var(--fg); border:1px solid var(--line); border-radius:8px; padding:10px 12px; font:13px/1.5 ui-monospace,Menlo,Consolas,monospace; }
  button { background:var(--accent); color:#06121f; border:0; border-radius:8px; padding:10px 22px; font-size:.9rem; font-weight:600; cursor:pointer; margin-top:6px; transition:filter .15s; }
  button:hover { filter:brightness(1.1); }
</style>
</head>
<body>
<main>
  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M2 9a15 15 0 0 1 20 0"/><path d="M5.5 12.5a10 10 0 0 1 9.5-2.6"/><path d="M9 16a5 5 0 0 1 3-1.4"/><circle cx="12" cy="19.2" r="1" fill="currentColor"/><path d="M3 3l18 18"/>
  </svg>
  <h1>Failed to load (URL)</h1>
  <p>Try:</p>
  <ul>
    <li>checking if you are connected to internet</li>
    <li>doing CTRL + SHIFT + R</li>
    <li>DMing @zaka13mc on discord if this persists and wont stop/go away</li>
  </ul>
  <button id="reload" type="button" onclick="location.reload()">Reload</button>

  <div class="err">Error details:</div>
  <textarea readonly aria-label="Error details"></textarea>
</main>
</body>
</html>
`;async function a(e){try{let t=new URL(e.request.url),r=i.find(e=>t.pathname.startsWith(e.prefix)),o=await clients.get(e.clientId),s=[...e.request.headers],n=await r.rpc.call("request",{rawUrl:e.request.url,rawReferrer:e.request.referrer,destination:e.request.destination,mode:e.request.mode,referrer:e.request.referrer,method:e.request.method,body:e.request.body,cache:e.request.cache,forceCrossOriginIsolated:!1,initialHeaders:s,rawClientUrl:o?o.url:void 0,clientId:e.clientId||e.resultingClientId},e.request.body instanceof ReadableStream||e.request.body instanceof ArrayBuffer?[e.request.body]:void 0);return new Response(n.body,{status:n.status,statusText:n.statusText,headers:n.headers})}catch(K4qErr){console.error("Service Worker error:",K4qErr);var K4qEsc=function(s){return String(s==null?"":s).split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;");},K4qUrl=K4qEsc(K4qReal(e&&e.request&&e.request.url||"")),K4qMsg=K4qEsc(K4qErr&&(K4qErr.message||K4qErr.toString())||"Unknown error"),K4qHtml=K4qErrTpl.replace("(URL)",function(){return K4qUrl;}).replace("></textarea>",function(){return ">"+K4qMsg+"</textarea>";});return new Response(K4qHtml,{status:500,headers:{"content-type":"text/html; charset=utf-8"}});}}addEventListener("message",e=>{if(!e.data||"object"!=typeof e.data||!e.data.$controller$init||"object"!=typeof e.data.$controller$init)return;let t=e.data.$controller$init,r=i.findIndex(e=>e.id===t.id);-1!==r&&i.splice(r,1),i.push(new s(t.prefix,t.id,e.ports[0]))}),addEventListener("install",()=>{self.skipWaiting()}),addEventListener("activate",e=>{e.waitUntil(clients.claim())}),setTimeout(async()=>{for(let e of(console.log("service worker activated, notifying clients to revive"),await clients.matchAll()))e.postMessage({$controller$swrevive:{}})},100)})(),$K4q9p2XvController=o})();
