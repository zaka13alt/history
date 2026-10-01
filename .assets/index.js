
const o=document.title,a="Google",e=document.querySelector("link[rel~='icon']"),t=e?e.href:"",n="https://google.com/favicon.ico";document.addEventListener("visibilitychange",()=>{document.title=document.hidden?a:o,e&&(e.href=document.hidden?n:t)});
