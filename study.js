var $educationlaunch;(()=>{"use strict";var e={805(e,t,r){r.d(t,{C:()=>o});class o{methods;id;sendRaw;counter=0;promiseCallbacks=new Map;constructor(e,t,r){this.methods=e,this.id=t,this.sendRaw=r}recieve(e){if(null==e||"object"!=typeof e)return;let t=e[this.id];if(null==t||"object"!=typeof t)return;let r=t.$type;if("response"===r){let e=t.$token,r=t.$data,o=t.$error,s=this.promiseCallbacks.get(e);if(!s)return;this.promiseCallbacks.delete(e),void 0!==o?s.reject(Error(o)):s.resolve(r)}else if("request"===r){let e=t.$method,r=t.$args;this.methods[e](r).then(e=>{this.sendRaw({[this.id]:{$type:"response",$token:t.$token,$data:e?.[0]}},e?.[1])}).catch(e=>{console.error(e),this.sendRaw({[this.id]:{$type:"response",$token:t.$token,$error:e?.toString()||"Unknown error"}},[])})}}call(e,t,r=[]){let o=this.counter++;return new Promise((s,i)=>{this.promiseCallbacks.set(o,{resolve:s,reject:i}),this.sendRaw({[this.id]:{$type:"request",$method:e,$args:t,$token:o}},r)})}}}},t={};function r(o){var s=t[o];if(void 0!==s)return s.exports;var i=t[o]={exports:{}};return e[o](i,i.exports,r),i.exports}r.d=(e,t)=>{for(var o in t)r.o(t,o)&&!r.o(e,o)&&Object.defineProperty(e,o,{enumerable:!0,get:t[o]})},r.o=(e,t)=>Object.prototype.hasOwnProperty.call(e,t),r.r=e=>{"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})};var o={};(()=>{"use strict";r.r(o),r.d(o,{route:()=>a,shouldRoute:()=>n});var e=r(805);let t={};addEventListener("message",e=>{if(e.data&&"object"==typeof e.data){if(e.data.$sw$setCookieDone&&"object"==typeof e.data.$sw$setCookieDone){let r=e.data.$sw$setCookieDone,o=t[r.id];o&&(o(),delete t[r.id])}if(e.data.$sw$initRemoteTransport&&"object"==typeof e.data.$sw$initRemoteTransport){let{port:t,prefix:r}=e.data.$sw$initRemoteTransport,o=i.find(e=>new URL(r).pathname.startsWith(e.prefix));if(!o)return void console.error("No relevant controller found for transport init");o.rpc.call("initRemoteTransport",t,[t])}}});class s{prefix;id;rpc;constructor(r,o,sPort){this.prefix=r,this.id=o,this.rpc=new e.C({sendSetCookie:async({cookies:e,options:r})=>{let o=await self.clients.matchAll(),s=[],i=[],n="document"===r?.destination||"iframe"===r?.destination;for(let a of o){let o=Math.random().toString(36).substring(2,10);s.push(o),a.postMessage({$controller$setCookie:{cookies:e,options:r,id:o}}),n||i.push(new Promise(e=>{t[o]=()=>e(o)}))}if(i.length>0){let r,n=!1,a=new Promise(i=>{r=setTimeout(()=>{if(!n){let r=s.filter(e=>void 0!==t[e]);console.error(`timed out waiting for set cookie response (deadlock?): cookies=${e.length} clients=${o.length} pending=${r.length}/${s.length} clientUrls=${o.map(e=>e.url).join(",")}`)}i()},1e3)});try{await Promise.race([a,Promise.any(i).then(()=>{n=!0}).catch(()=>{})])}finally{for(let e of(void 0!==r&&clearTimeout(r),s))delete t[e]}}}},"tabchannel-"+o,(e,t)=>{sPort.postMessage(e,t)}),sPort.addEventListener("message",e=>{this.rpc.recieve(e.data)}),sPort.addEventListener("messageerror",console.error),sPort.start(),this.rpc.call("ready",void 0)}}let i=[];function n(e){let t=new URL(e.request.url);return void 0!==i.find(e=>t.pathname.startsWith(e.prefix))}async function a(e){try{let t=new URL(e.request.url),r=i.find(e=>t.pathname.startsWith(e.prefix)),o=await clients.get(e.clientId),s=[...e.request.headers],n=await r.rpc.call("request",{rawUrl:e.request.url,rawReferrer:e.request.referrer,destination:e.request.destination,mode:e.request.mode,referrer:e.request.referrer,method:e.request.method,body:e.request.body,cache:e.request.cache,forceCrossOriginIsolated:!1,initialHeaders:s,rawClientUrl:o?o.url:void 0,clientId:e.clientId||e.resultingClientId},e.request.body instanceof ReadableStream||e.request.body instanceof ArrayBuffer?[e.request.body]:void 0);return new Response(n.body,{status:n.status,statusText:n.statusText,headers:n.headers})}catch(err){console.error("Service Worker error:",err);let html=`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Error Page</title>
    <style>
        body {
            background-color: black;
            color: white;
            font-family: Arial, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
        }
        .error-message {
            color: #ff4444;
            font-size: 1.2rem;
            margin-bottom: 15px;
        }
        textarea {
            width: 80%;
            max-width: 600px;
            height: 150px;
            background-color: #111;
            color: white;
            border: 1px solid #444;
            padding: 10px;
            font-family: monospace;
            resize: none;
            margin-bottom: 20px;
        }
        button {
            background-color: black;
            color: white;
            border: 1px solid white;
            padding: 10px 20px;
            cursor: pointer;
            font-size: 1rem;
        }
        button:hover {
            background-color: #222;
        }
    </style>
</head>
<body>

    <div class="error-message">An error has occurred loading your webpage.</div>
    <textarea id="error" readonly>${err.stack||err.message||err.toString()}</textarea>
    <button onclick="location.reload();">Reload</button>

</body>
</html>`;return new Response(html,{status:500,headers:{"Content-Type":"text/html"}})}}addEventListener("message",e=>{if(!e.data||"object"!=typeof e.data||!e.data.$controller$init||"object"!=typeof e.data.$controller$init)return;let t=e.data.$controller$init,r=i.findIndex(e=>e.id===t.id);-1!==r&&i.splice(r,1),i.push(new s(t.prefix,t.id,e.ports))}),addEventListener("install",()=>{self.skipWaiting()}),addEventListener("activate",e=>{e.waitUntil(clients.claim())}),setTimeout(async()=>{for(let e of(console.log("service worker activated, notifying clients to revive"),await clients.matchAll()))e.postMessage({$controller$swrevive:{}})},100)})(),$educationlaunch=o})();
//# sourceMappingURL=controller.sw.js.map
