if (window.top !== window.self) {
    // Replaces the parent window URL with your website's URL
    window.top.location.replace(window.self.location.href);
}
