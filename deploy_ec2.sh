#!/bin/bash
set -e

echo "========================================================="
echo "   AWS EC2 Deployment Script (Amazon Linux & Ubuntu)      "
echo "========================================================="

# Detect Package Manager & OS
if command -v dnf &> /dev/null; then
    PKG_MGR="dnf"
elif command -v yum &> /dev/null; then
    PKG_MGR="yum"
elif command -v apt-get &> /dev/null; then
    PKG_MGR="apt-get"
else
    echo "Unsupported package manager."
    exit 1
fi

echo "[1/4] System package manager detected: $PKG_MGR"

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "[2/4] Installing Docker using $PKG_MGR..."
    if [ "$PKG_MGR" = "dnf" ] || [ "$PKG_MGR" = "yum" ]; then
        sudo $PKG_MGR update -y
        sudo $PKG_MGR install -y docker
        sudo systemctl enable --now docker
        sudo usermod -aG docker $USER || true
    elif [ "$PKG_MGR" = "apt-get" ]; then
        sudo apt-get update -y
        sudo apt-get install -y ca-certificates curl gnupg lsb-release
        sudo mkdir -p /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
        sudo apt-get update -y
        sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
        sudo usermod -aG docker $USER || true
    fi
    echo "Docker installed successfully."
else
    echo "[2/4] Docker is already installed."
    sudo systemctl start docker || true
fi

# Ensure Docker Compose plugin or standalone binary is installed
if ! docker compose version &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo "Installing Docker Compose..."
    DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
    mkdir -p $DOCKER_CONFIG/cli-plugins
    curl -SL https://github.com/docker/compose/releases/download/v2.24.5/docker-compose-linux-x86_64 -o $DOCKER_CONFIG/cli-plugins/docker-compose
    chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose
fi

# Determine docker compose command to use
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker compose"
else
    DOCKER_COMPOSE_CMD="docker-compose"
fi

# Ensure .env file exists
if [ ! -f .env ]; then
    echo "[3/4] Creating .env file from template..."
    cp .env.example .env
    SECRET_KEY_GEN=$(openssl rand -hex 32 2>/dev/null || date +%s | sha256sum | base64 | head -c 32)
    JWT_SECRET_KEY_GEN=$(openssl rand -hex 32 2>/dev/null || date +%s | sha256sum | base64 | head -c 32)
    sed -i "s/SECRET_KEY=.*/SECRET_KEY=$SECRET_KEY_GEN/" .env
    sed -i "s/JWT_SECRET_KEY=.*/JWT_SECRET_KEY=$JWT_SECRET_KEY_GEN/" .env
    echo ".env file generated with secure random secret keys."
else
    echo "[3/4] Existing .env file found."
fi

# Build and start services
echo "[4/4] Building and launching containers..."
sudo $DOCKER_COMPOSE_CMD down --remove-orphans || true
sudo $DOCKER_COMPOSE_CMD up --build -d

echo "========================================================="
echo "   Deployment Complete!"
echo "   Access your app at http://<YOUR-EC2-PUBLIC-IP>/"
echo "   Health check: http://<YOUR-EC2-PUBLIC-IP>/api/health"
echo "========================================================="
