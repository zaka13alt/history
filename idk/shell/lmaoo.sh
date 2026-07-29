=#!/bin/bash
set -e

# ===== Configuration =====

REPO_URL="https://github.com/zaka13alt/history.git"

INSTALL_DIR="/opt/myapp"

# Caddy default web root from your Caddyfile
WEB_ROOT="/usr/share/caddy"

NODE_DIR="$INSTALL_DIR/node"

CADDYFILE="$INSTALL_DIR/Caddyfile"

LOG_FILE="/var/log/myapp.log"

# =========================


echo "Starting deployment..."


# Install Git if missing
if ! command -v git >/dev/null 2>&1; then
    echo "Installing Git..."
    apt update
    apt install -y git
fi


# Install Node.js if missing
if ! command -v node >/dev/null 2>&1; then
    echo "Installing Node.js..."

    apt update
    apt install -y curl ca-certificates

    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -

    apt install -y nodejs
fi


# Stop existing Node app
echo "Stopping old Node process..."

pkill -f "node index.js" || true


# Remove old repository
echo "Removing old install..."

rm -rf "$INSTALL_DIR"


# Clone fresh repo
echo "Cloning repository..."

git clone "$REPO_URL" "$INSTALL_DIR"


# Make sure Caddy directory exists
echo "Preparing Caddy web root..."

mkdir -p "$WEB_ROOT"


# Clear old website
rm -rf "${WEB_ROOT:?}/"*


# Copy website files from repo root
echo "Copying website files..."

cp -a "$INSTALL_DIR"/. "$WEB_ROOT/"


# Remove private files from public directory
rm -rf "$WEB_ROOT/node"
rm -f "$WEB_ROOT/Caddyfile"
rm -rf "$WEB_ROOT/.git"


# Install Caddyfile
if [ -f "$CADDYFILE" ]; then
    echo "Installing Caddyfile..."

    cp "$CADDYFILE" /etc/caddy/Caddyfile

    caddy validate --config /etc/caddy/Caddyfile

    systemctl reload caddy
fi


# Install Node dependencies
echo "Installing Node packages..."

cd "$NODE_DIR"

npm install


# Start Node app
echo "Starting Node app..."

nohup node index.js > "$LOG_FILE" 2>&1 &


# Install cron job for daily rebuild
echo "Installing 1 AM cron job..."

SCRIPT_PATH="/usr/local/bin/redeploy-myapp.sh"

(
    crontab -l 2>/dev/null | grep -v "$SCRIPT_PATH" || true
    echo "0 1 * * * $SCRIPT_PATH >> /var/log/redeploy-myapp.log 2>&1"
) | crontab -


echo "================================="
echo "Deployment finished successfully"
echo "Website: $WEB_ROOT"
echo "Node app: $NODE_DIR/index.js"
echo "Cron: Every day at 1:00 AM"
echo "================================="
