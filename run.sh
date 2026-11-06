#!/bin/bash

# Exit immediately if any command exits with a non-zero status
set -e

REPO_URL="https://github.com/zaka13alt/history"
REPO_DIR="history" 

echo "Starting script..."

# Detect OS platform early for dependency handling
OS_TYPE=$(uname -s | tr '[:upper:]' '[:lower:]')

# Record script initialization directory to safeguard all future relative paths
SCRIPT_START_DIR=$(pwd)

# 1. Fetch the GitHub repository
if [ -d "$REPO_DIR" ]; then
    echo "Repository directory already exists. Pulling latest updates..."
    cd "$REPO_DIR"
    git pull
    cd "$SCRIPT_START_DIR"
else
    echo "Cloning GitHub repository..."
    git clone "$REPO_URL"
fi

# 2. Check and install Node.js / npm if needed
echo "Checking for Node.js and npm..."
if ! command -v npm &> /dev/null; then
    echo "npm is missing. Installing Node.js and npm..."
    if [[ "$OS_TYPE" == "linux" ]]; then
        if command -v apt-get &> /dev/null; then
            sudo apt-get update
            sudo apt-get install -y nodejs npm
        elif command -v dnf &> /dev/null; then
            sudo dnf install -y nodejs npm
        else
            echo "Unsupported Linux distribution for auto-installing Node.js. Install it manually."
            exit 1
        fi
    elif [[ "$OS_TYPE" == "darwin" ]]; then
        if command -v brew &> /dev/null; then
            brew install node
        else
            echo "Homebrew is required to install Node.js on macOS."
            exit 1
        fi
    else
        echo "Unsupported platform: $OS_TYPE"
        exit 1
    fi
else
    echo "npm is already installed."
fi

# 3. Go to the node/ directory, handle npm install and PM2
echo "Navigating to node directory..."
cd "$SCRIPT_START_DIR/$REPO_DIR/node"

echo "Running npm install..."
npm install

# Check and install PM2 globally if missing
if ! command -v pm2 &> /dev/null; then
    echo "PM2 not found. Installing PM2 globally..."
    sudo npm install -g pm2
else
    echo "PM2 is already installed."
fi

# Run the app with PM2
echo "Starting application with PM2..."
if [ -f ecosystem.config.js ]; then
    pm2 start ecosystem.config.js
elif grep -q '"start"' package.json; then
    pm2 start npm --name node-app -- start
else
    pm2 start index.js --name node-app
fi

# Save PM2 process list to persist on reboot
pm2 save

# Configure PM2 to run on system boot automatically
echo "Configuring PM2 to start on system boot..."
STARTUP_CMD=$(pm2 startup | grep -v "\[PM2\]" | tail -n 1)
if [ -n "$STARTUP_CMD" ]; then
    eval "$STARTUP_CMD"
fi

# 4. Go to root, find Caddyfile, and install Caddy
echo "Returning to project root directory..."
PROJECT_ROOT_ABS="$SCRIPT_START_DIR/$REPO_DIR"
cd "$PROJECT_ROOT_ABS"

# Verify Caddyfile exists in the root
if [ ! -f Caddyfile ]; then
    echo "Warning: Caddyfile not found in root. Searching for it..."
    FOUND_CADDYFILE=$(find . -name Caddyfile -print -quit)
    if [ -n "$FOUND_CADDYFILE" ]; then
        echo "📍 Found Caddyfile at: $FOUND_CADDYFILE"
        if [ "$FOUND_CADDYFILE" != "./Caddyfile" ]; then
            cp "$FOUND_CADDYFILE" ./Caddyfile
        fi
    else
        echo "Error: No Caddyfile found in the repository."
        exit 1
    fi
fi

# Install Caddy based on the platform
echo "Detecting platform and installing Caddy..."
if [[ "$OS_TYPE" == "linux" ]]; then
    if command -v apt-get &> /dev/null; then
        echo "Installing Caddy via official stable APT repository..."
        
        # Install prerequisites
        sudo apt-get update
        sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
        
        # FIX: Complete, unified single-piece URLs with no internal variable fragmentation
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
        
        sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
        sudo chmod o+r /etc/apt/sources.list.d/caddy-stable.list
        
        sudo apt-get update
        sudo apt-get install caddy -y
        
    elif command -v dnf &> /dev/null; then
        # RHEL/CentOS/Fedora
        echo "Installing Caddy via DNF..."
        sudo dnf install -y 'dnf-command(copr)'
        sudo dnf copr enable -y @caddy/caddy
        sudo dnf install -y caddy
    else
        echo "Unsupported Linux distribution. Please install Caddy manually."
        exit 1
    fi
elif [[ "$OS_TYPE" == "darwin" ]]; then
    # macOS
    if command -v brew &> /dev/null; then
        echo "Installing Caddy via Homebrew..."
        brew install caddy
    else
        echo "Homebrew is required to install Caddy on macOS."
        exit 1
    fi
else
    echo "Unsupported OS platform: $OS_TYPE"
    exit 1
fi

# 5. Start and run Caddy / Handle systemd integration
echo "Configuring and starting Caddy..."
sudo caddy validate --config Caddyfile

if command -v systemctl &> /dev/null; then
    echo "Integrating Caddy with systemd..."
    if [ ! -f /etc/systemd/system/caddy.service ] && [ ! -f /lib/systemd/system/caddy.service ]; then
        echo "Creating custom systemd service file for Caddy..."
        sudo bash -c "cat <<EOF > /etc/systemd/system/caddy.service
[Unit]
Description=Caddy
Documentation=https://caddyserver.com
After=network.target network-online.target
Requires=network-online.target

[Service]
Type=notify
User=root
Group=root
WorkingDirectory=${PROJECT_ROOT_ABS}
ExecStart=/usr/bin/caddy run --environ --config ${PROJECT_ROOT_ABS}/Caddyfile
ExecReload=/usr/bin/caddy reload --config ${PROJECT_ROOT_ABS}/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
LimitNPROC=512
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
EOF"
        sudo systemctl daemon-reload
    else
        echo "Native caddy.service found. Overriding/Ensuring it references the correct Caddyfile..."
        if [ -d /etc/caddy ]; then
            sudo cp Caddyfile /etc/caddy/Caddyfile
        fi
    fi
    sudo systemctl enable caddy
    sudo systemctl restart caddy
else
    echo "systemd not found. Running Caddy in the background..."
    sudo caddy start --config Caddyfile
fi

# 6. Allow ports 80 and 443 out/in
echo "Configuring firewall to open ports 80 and 443..."
if command -v ufw &> /dev/null; then
    echo "Using UFW firewall..."
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    sudo ufw reload
elif command -v firewall-cmd &> /dev/null; then
    echo "Using Firewalld..."
    sudo firewall-cmd --permanent --add-service=http
    sudo firewall-cmd --permanent --add-service=https
    sudo firewall-cmd --reload
else
    echo "No recognized firewall utility found (UFW/Firewalld). Ensure ports 80 and 443 are open manually."
fi

echo "Deployment script executed successfully!"
