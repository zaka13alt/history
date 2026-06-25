<script>
(function() {
  // Ensure we only initialize once per page context
  if (window.__optionsButtonInitialized) return;
  window.__optionsButtonInitialized = true;

  // 1. Create the small, black "Options" button
  const button = document.createElement('button');
  button.id = 'dynamic-options-trigger-btn';
  button.innerText = 'Options';
  
  // Use inline, high-priority CSS styling to override global page stylesheets
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
      boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
      // Set to maximum possible CSS 32-bit integer z-index to stay on top of everything
      zIndex: '2147483647', 
      visibility: 'visible',
      display: 'block',
      opacity: '1'
    });
  };
  applyStyles();

  // Hover states
  button.onmouseover = () => button.style.backgroundColor = '#333333';
  button.onmouseout = () => button.style.backgroundColor = '#000000';

  // 2. Define the Regex parsing and replacement logic
  button.onclick = function(e) {
    e.stopPropagation(); // Prevents page click listeners from capturing this interaction
    
    let userInput = prompt("Enter the new URL/Address:", "https://customdomain.com");
    
    if (userInput) {
      const targetRegex = /(https?|wss?)?(:\/\/)?(www\.)?bestspark.org/gi;
      const inputProtocolMatch = userInput.match(/^(https?|wss?):\/\//i);
      
      // Fetch the raw document tree markup safely
      let sourceHTML = document.body.innerHTML;
      
      let updatedHTML = sourceHTML.replace(targetRegex, (match, protocol, slashes, www) => {
        if (inputProtocolMatch) return userInput;
        const currentProtocol = protocol ? protocol.toLowerCase() : 'https';
        const cleanInput = userInput.replace(/^(https?|wss?):\/\//i, '');
        return `${currentProtocol}://${cleanInput}`;
      });

      // Commit changes to the page body layout
      document.body.innerHTML = updatedHTML;
      
      // Immediately restore the button configuration
      mountButton();
      alert("Successfully replaced all instances of the Wisp URL.");
    }
  };

  // 3. Ultra-stable Mounting Routine
  function mountButton() {
    // If an old copy exists somewhere, eliminate it first
    const existing = document.getElementById('dynamic-options-trigger-btn');
    if (existing) existing.remove();
    
    if (document.body) {
      document.body.appendChild(button);
      applyStyles(); // Enforce styling rules again
    }
  }

  // Force mount through any stage of HTML page building lifecycle
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountButton);
  } else {
    mountButton();
  }

  // Fallback observer: protects the button from being erased by other aggressive frameworks
  window.addEventListener('load', mountButton);
  setTimeout(mountButton, 1000);
})();
</script>
