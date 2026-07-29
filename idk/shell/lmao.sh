#!/bin/bash
set -e

# ===== Configuration =====
REPO_URL="https://github.com/zaka13alt/history.git"
INSTALL_DIR="/opt/myapp"
WEB_ROOT="/var/www/html"

# Install Git if missing
if ! command -v git >/dev/null 2>&1; then
    apt update
    apt install -y git
fi

# Install Node.js if missing
if ! command -v node >/dev/null 2>&1; then
    apt update
    apt install -y curl ca-certificates
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt install -y nodejs
fi

# Stop existing Node app (ignore if not running)
pkill -f "node index.js" || true

# Delete the old repository
rm -rf "$INSTALL_DIR"

# Clone a fresh copy
git clone "$REPO_URL" "$INSTALL_DIR"

# Clear the Caddy web root
rm -rf "${WEB_ROOT:?}/"*

# Copy everything except the node directory and Caddyfile
cp -r "$INSTALL_DIR/"* "$WEB_ROOT/"
rm -rf "$WEB_ROOT/node"
rm -f "$WEB_ROOT/Caddyfile"

# Install the Caddyfile
if [ -f "$INSTALL_DIR/Caddyfile" ]; then
    cp "$INSTALL_DIR/Caddyfile" /etc/caddy/Caddyfile
    systemctl reload caddy
fi

# Install Node dependencies
cd "$INSTALL_DIR/node"
npm install

# Start the Node application
nohup node index.js >/var/log/myapp.log 2>&1 &

# Ensure the redeploy script is executable
chmod +x "$0"

# Install/update the daily 1:00 AM cron job
(
    crontab -l 2>/dev/null | grep -v "$0"
    echo "0 1 * * * $0 >/var/log/redeploy-myapp.log 2>&1"
) | crontab

echo "Deployment complete."
echo "Repository: $INSTALL_DIR"
echo "Website: $WEB_ROOT"
echo "Node app started."
echo "Daily redeploy scheduled for 1:00 AM."
