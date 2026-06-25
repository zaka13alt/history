<script>
(function() {
  // 1. Create the small, black "Options" button
  const button = document.createElement('button');
  button.innerText = 'Options';
  
  // Style the button to stay fixed in the bottom right corner
  Object.assign(button.style, {
    position: 'fixed',
    bottom: '10px',  // Moved from top to bottom
    right: '10px',
    backgroundColor: '#000000',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    padding: '5px 10px',
    fontSize: '12px',
    fontFamily: 'sans-serif',
    cursor: 'pointer',
    zIndex: '999999', 
    boxShadow: '0 2px 5px rgba(0,0,0,0.3)'
  });

  // Hover states
  button.onmouseover = () => button.style.backgroundColor = '#333333';
  button.onmouseout = () => button.style.backgroundColor = '#000000';

  // 2. Define the Regex parsing and replacement logic
  button.onclick = function() {
    let userInput = prompt("Enter the new URL/Address:", "https://customdomain.com");
    
    if (userInput) {
      // Regex targets http, https, ws, or wss variants of PLACEHOLDER
      const targetRegex = /(https?|wss?)?(:\/\/)?(www\.)?bestspark.org/gi;
      const inputProtocolMatch = userInput.match(/^(https?|wss?):\/\//i);
      
      // Perform the global replacement across the raw body string
      document.body.innerHTML = document.body.innerHTML.replace(targetRegex, (match, protocol, slashes, www) => {
        if (inputProtocolMatch) {
          return userInput;
        }
        const currentProtocol = protocol ? protocol.toLowerCase() : 'https';
        const cleanInput = userInput.replace(/^(https?|wss?):\/\//i, '');
        return `${currentProtocol}://${cleanInput}`;
      });

      // Re-append the button since rewriting innerHTML destroys active DOM elements
      document.body.appendChild(button);
      
      alert("Successfully replaced all instances of PLACEHOLDER.");
    }
  };

  // 3. Inject the button onto the page safely
  if (document.body) {
    document.body.appendChild(button);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      document.body.appendChild(button);
    });
  }
})();
</script>
