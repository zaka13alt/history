(function() {
  if (window.__optionsButtonInitialized) return;
  window.__optionsButtonInitialized = true;

  // Global state to store the custom user-defined Wisp URL
  window.__customWispUrl = null;

  // 1. Intercept the LibcurlClient constructor
  function interceptLibcurl() {
    if (window.LibcurlTransport && window.LibcurlTransport.LibcurlClient) {
      const OriginalLibcurlClient = window.LibcurlTransport.LibcurlClient;

      // Overwrite the constructor with a proxy wrapper
      window.LibcurlTransport.LibcurlClient = function(options) {
        if (options && options.websocket) {
          // If the user entered a custom server, use it. Otherwise, use the default live URL.
          if (window.__customWispUrl) {
            options.websocket = window.__customWispUrl;
          } else {
            options.websocket = "wss://aboutme.rjara.com/wisp/";
          }
        }
        
        // Instantiate the original Mercury Workshop client with the updated options
        return new OriginalLibcurlClient(options);
      };
      
      // Inherit static properties and prototype chain layout
      Object.assign(window.LibcurlTransport.LibcurlClient, OriginalLibcurlClient);
      window.LibcurlTransport.LibcurlClient.prototype = OriginalLibcurlClient.prototype;
      
      console.log("");
      return true;
    }
    return false;
  }

  // Monitor the window environment until LibcurlTransport fully loads
  if (!interceptLibcurl()) {
    const classChecker = setInterval(() => {
      if (interceptLibcurl()) clearInterval(classChecker);
    }, 50);
    setTimeout(() => clearInterval(classChecker), 10000); // Stop looking after 10s
  }

  // 2. Create the small, black "Options" button
  const button = document.createElement('button');
  button.id = 'dynamic-options-trigger-btn';
  button.innerText = 'Options';
  
  const applyStyles = () => {
    Object.assign(button.style, {
      position: 'fixed',
      bottom: '10px',
      right: '10px',
      backgroundColor: '#000000',
      color: '#ffffff',
      border: 'none',
      borderRadius: '4px',
      padding: '5px 10px',
      fontSize: '12px',
      fontFamily: 'sans-serif',
      cursor: 'pointer',
      zIndex: '2147483647', // Float over all other elements
      boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
      visibility: 'visible',
      display: 'block',
      opacity: '1'
    });
  };
  applyStyles();

  button.onmouseover = () => button.style.backgroundColor = '#333333';
  button.onmouseout = () => button.style.backgroundColor = '#000000';

  // 3. Define the prompt behavior
  button.onclick = function(e) {
    e.stopPropagation();
    
    // Set current runtime selection or default fallback as the input suggestion placeholder
    const inputPlaceholder = window.__customWispUrl || "wss://aboutme.rjara.com/wisp/";
    let userInput = prompt("Enter new Wisp WebSocket Server URL:", inputPlaceholder);
    
    if (userInput) {
      // Force WebSocket protocol prefix if missing
      if (!/^wss?:\/\//i.test(userInput)) {
        userInput = "wss://" + userInput;
      }
      
      window.__customWispUrl = userInput;
      alert("Wisp endpoint updated to: " + userInput + "\n\n(Changes will apply to new connections)");
    }
  };

  // 4. Dom injector
  function mountButton() {
    const existing = document.getElementById('dynamic-options-trigger-btn');
    if (existing) existing.remove();
    
    if (document.body) {
      document.body.appendChild(button);
      applyStyles();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountButton);
  } else {
    mountButton();
  }

  window.addEventListener('load', mountButton);
  setTimeout(mountButton, 500);
})();
