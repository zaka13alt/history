//
const originalTitle = document.title || ""; 
// 
const awayTitle = "Quizizz is now Wayground | Teacher AI and Resources";
const awayFavicon = "https://wayground.com/favicon.ico";
// 
function createXMLElement(tagName) {
  return document.createElementNS 
    ? document.createElementNS("http://www.w3.org/1999/xhtml", tagName)
    : document.createElement(tagName);
}

// Helper function to update or append the favicon
function changeFavicon(src) {
  let link = document.querySelector("link[rel~='icon']");
  
  if (!link) {
    link = createXMLElement("link");
    link.setAttribute("rel", "icon");
    
    // 
    const head = document.getElementsByTagName("head")[0] || document.documentElement;
    head.appendChild(link);
  }
  
  link.setAttribute("href", src);
}

// 
function changeTitle(newTitle) {
  let titleNode = document.querySelector("title");

  // If no <title> element exists, create and append one
  if (!titleNode) {
    titleNode = createXMLElement("title");
    const head = document.getElementsByTagName("head")[0] || document.documentElement;
    head.appendChild(titleNode);
  }

  titleNode.textContent = newTitle;
}

// 
const originalFaviconNode = document.querySelector("link[rel~='icon']");
const originalFavicon = originalFaviconNode ? originalFaviconNode.getAttribute("href") : null;

// Listen for visibility changes (tab switching)
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    // User left the tab: set away title and favicon
    changeTitle(awayTitle);
    changeFavicon(awayFavicon);
  } else {
    // User returned to the tab
    if (originalTitle) {
      changeTitle(originalTitle);
    } else {
      // Remove dynamically added title if none existed originally
      const titleNode = document.querySelector("title");
      if (titleNode) titleNode.parentNode.removeChild(titleNode);
    }

    if (originalFavicon) {
      changeFavicon(originalFavicon);
    } else {
      // Remove dynamically added favicon if none existed originally
      const link = document.querySelector("link[rel~='icon']");
      if (link) link.parentNode.removeChild(link);
    }
  }
});
