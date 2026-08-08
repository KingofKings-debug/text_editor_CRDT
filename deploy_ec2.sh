#!/bin/bash
set -e

echo "========================================================="
echo "   AWS EC2 Automated Deployment Script for CRDT Platform  "
echo "========================================================="

# Update package lists
echo "[1/4] Updating system packages..."
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg lsb-release

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "[2/4] Installing Docker..."
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    sudo usermod -aG docker $USER
    echo "Docker installed successfully."
else
    echo "[2/4] Docker is already installed."
fi

# Ensure .env file exists
if [ ! -f .env ]; then
    echo "[3/4] Creating .env file from template..."
    cp .env.example .env
    # Generate random secret keys
    SECRET_KEY_GEN=$(openssl rand -hex 32 2>/dev/null || date +%s | sha256sum | base64 | head -c 32)
    JWT_SECRET_KEY_GEN=$(openssl rand -hex 32 2>/dev/null || date +%s | sha256sum | base64 | head -c 32)
    sed -i "s/SECRET_KEY=.*/SECRET_KEY=$SECRET_KEY_GEN/" .env
    sed -i "s/JWT_SECRET_KEY=.*/JWT_SECRET_KEY=$JWT_SECRET_KEY_GEN/" .env
    echo ".env file generated with secure random secret keys."
else
    echo "[3/4] Existing .env file found."
fi

# Build and start services using Docker Compose
echo "[4/4] Building and launching containers..."
sudo docker compose down --remove-orphans || true
sudo docker compose up --build -d

echo "========================================================="
echo "   Deployment Complete!"
echo "   Access your app at http://<YOUR-EC2-PUBLIC-IP>/"
echo "   Health check: http://<YOUR-EC2-PUBLIC-IP>/api/health"
echo "========================================================="
