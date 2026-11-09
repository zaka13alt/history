// Light nuisance layer: deters casual inspection and wastes obvious bots' time.
// Never blocks real users; everything is wrapped so a failure can't stop the mount.
(function () {
  try {
    var block = function (e) { e.preventDefault(); e.stopPropagation(); };
    document.addEventListener('contextmenu', block, true);
    document.addEventListener('keydown', function (e) {
      var k = (e.key || '').toLowerCase();
      if (e.key === 'F12' ||
          (e.ctrlKey && e.shiftKey && (k === 'i' || k === 'j' || k === 'c')) ||
          (e.ctrlKey && k === 'u')) block(e);
    }, true);
    setInterval(function () { (function () { debugger; }()); }, 3000);
    var botty = navigator.webdriver === true ||
      /headless|phantom|puppeteer|playwright|slimerjs|nightmare/i.test(navigator.userAgent || '') ||
      (navigator.languages && navigator.languages.length === 0) ||
      !window.chrome && / Chrome\//.test(navigator.userAgent || '');
    if (botty) { var x = 0; for (var i = 0; i < 4e6; i++) { x += (i * 3) % 7; } void x; }
  } catch (e) {}
}());

setTimeout(() => {
  document.documentElement.replaceChildren();
  const head = document.createElement('head');
  const body = document.createElement('body');
  body.style.cssText = 'margin:0;padding:0;overflow:hidden;';
  document.documentElement.append(head, body);
  setTimeout(() => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;margin:0;padding:0;z-index:2147483647;';
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
