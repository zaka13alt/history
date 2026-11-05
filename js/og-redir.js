setTimeout(() => {
  // Destroy everything currently in the document
  document.documentElement.replaceChildren();

  // Rebuild a minimal document
  const head = document.createElement('head');
  const body = document.createElement('body');
  body.style.cssText = 'margin:0;padding:0;overflow:hidden;';
  document.documentElement.append(head, body);

  // Build the shadow DOM + iframe after another 1012ms
  setTimeout(() => {
    const host = document.createElement('div');
    host.style.cssText =
      'position:fixed;inset:0;width:100vw;height:100vh;margin:0;padding:0;z-index:2147483647;';
    body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <style>
        iframe {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
          display: block;
        }
      </style>
      <iframe src="/study.html"></iframe>
    `;
  }, 200);
}, 200);
