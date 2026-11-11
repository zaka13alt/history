(()=>{
const SESSIONS_KEY="cf_solved";
const BASE_KEY="flaresolverr_base";
const DEFAULT_BASE="/flaresolverr";
const CHALLENGE_RE=/<title>\s*Just a moment\.\.\.\s*<\/title>/i;
const inflight=new Map();

function loadSessions(){
  try{
    const all=JSON.parse(localStorage.getItem(SESSIONS_KEY)||"{}");
    const now=Date.now()/1000;
    for(const k of Object.keys(all)){
      all[k].cookies=(all[k].cookies||[]).filter(c=>!c.expiry||c.expiry>now);
      if(!all[k].cookies.length)delete all[k];
    }
    return all;
  }catch(e){return {}}
}

function saveSessions(all){
  try{localStorage.setItem(SESSIONS_KEY,JSON.stringify(all))}catch(e){}
}

function domainMatches(host,domain){
  domain=String(domain||"").replace(/^\./,"").toLowerCase();
  return !!domain&&(host===domain||host.endsWith("."+domain));
}

function lookup(url){
  const u=new URL(url);
  const host=u.hostname.toLowerCase();
  let found=null;
  for(const s of Object.values(loadSessions())){
    const cookies=s.cookies.filter(c=>
      domainMatches(host,c.domain)&&
      u.pathname.startsWith(c.path||"/")&&
      (!c.secure||u.protocol==="https:"));
    if(!cookies.length)continue;
    const hasClearance=cookies.some(c=>c.name==="cf_clearance");
    if(!found||(hasClearance&&!found.hasClearance))found={ua:s.ua,cookies,hasClearance};
  }
  return found;
}

function toPairs(h){
  if(!h)return [];
  if(typeof h[Symbol.iterator]==="function")return Array.from(h,([k,v])=>[k,v]);
  return Object.entries(h);
}

function headerValue(pairs,name){
  for(const [k,v] of pairs)if(String(k).toLowerCase()===name)return String(v);
  return null;
}

function withSession(headers,session){
  const out=[];
  const jar=new Map();
  for(const [k,v] of toPairs(headers)){
    const lk=String(k).toLowerCase();
    if(lk==="user-agent")continue;
    if(lk==="cookie"){
      for(const part of String(v).split(/;\s*/)){
        const i=part.indexOf("=");
        if(i>0)jar.set(part.slice(0,i),part.slice(i+1));
      }
      continue;
    }
    out.push([k,v]);
  }
  for(const c of session.cookies)jar.set(c.name,c.value);
  out.push(["User-Agent",session.ua]);
  if(jar.size)out.push(["Cookie",Array.from(jar,([n,v])=>n+"="+v).join("; ")]);
  return out;
}

async function inspect(res){
  const mitigated=headerValue(res.headers||[],"cf-mitigated");
  if(res.status!==403&&res.status!==503&&!mitigated)return {res,challenged:false};
  if(res.body==null)return {res,challenged:mitigated==="challenge"};
  const buf=await new Response(res.body).arrayBuffer();
  const head=new TextDecoder().decode(buf.slice(0,32768));
  return {
    res:{...res,body:new Response(buf).body},
    challenged:mitigated==="challenge"||CHALLENGE_RE.test(head)
  };
}

async function solve(url){
  const base=(localStorage.getItem(BASE_KEY)||DEFAULT_BASE).replace(/\/+$/,"");
  const r=await fetch(base+"/v1",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({cmd:"request.get",url,maxTimeout:60000})
  });
  const j=await r.json();
  if(j.status!=="ok"||!j.solution)throw new Error(j.message||"FlareSolverr failed");
  return j.solution;
}

function solveOnce(url){
  const key=new URL(url).origin;
  let p=inflight.get(key);
  if(!p){
    p=solve(url).finally(()=>inflight.delete(key));
    inflight.set(key,p);
  }
  return p;
}

function storeSolution(url,solution){
  const all=loadSessions();
  all[new URL(url).origin]={
    ua:solution.userAgent,
    at:Date.now(),
    cookies:(solution.cookies||[]).map(c=>({
      name:c.name,value:c.value,domain:c.domain,path:c.path,expiry:c.expiry,secure:c.secure
    }))
  };
  saveSessions(all);
}

//
function responseFromSolution(solution){
  
  const skip=new Set(["content-encoding","content-length","transfer-encoding","connection","content-type"]);
  const headers=Object.entries(solution.headers||{}).filter(([k])=>!skip.has(k.toLowerCase()));
  
  headers.push(["content-type","text/html; charset=utf-8"]);
  return {
    body:new Response(solution.response||"").body,
    headers,
    status:solution.status||200,
    statusText:""
  };
}

function wrap(transport){
  const original=transport.request.bind(transport);
  transport.request=async function(remote,method,body,headers,signal){
    const isGet=method==="GET"||method==="HEAD";
    if(!isGet&&body instanceof ReadableStream)body=new Uint8Array(await new Response(body).arrayBuffer());

    const known=lookup(remote.href);
    const first=await inspect(await original(remote,method,body,known?withSession(headers,known):headers,signal));
    if(!first.challenged)return first.res;

    let solution;
    try{
      solution=await solveOnce(isGet?remote.href:remote.origin+"/");
    }catch(e){
      console.error("FlareSolverr could not solve the challenge:",e);
      return first.res;
    }
    storeSolution(remote.href,solution);

    const session=lookup(remote.href)||{ua:solution.userAgent,cookies:solution.cookies||[]};
    const retry=await inspect(await original(remote,method,body,withSession(headers,session),signal));
    if(!retry.challenged)return retry.res;
    return isGet?responseFromSolution(solution):retry.res;
  };
  return transport;
}

window.cfSolver={wrap,lookup};
})();
