```bash
#!/bin/bash
set -e

echo "========================================================="
echo "       CRDT Text Editor - AWS EC2 Deployment"
echo "========================================================="

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo ""
echo "[1/6] Checking operating system..."

if [ -f /etc/os-release ]; then
    . /etc/os-release
    echo "Detected: $PRETTY_NAME"
else
    echo "Could not detect operating system."
    exit 1
fi

echo ""
echo "[2/6] Installing Docker..."

if ! command -v docker >/dev/null 2>&1; then
    echo "Docker not found. Installing..."

    if command -v dnf >/dev/null 2>&1; then
        sudo dnf update -y
        sudo dnf install -y docker
    elif command -v yum >/dev/null 2>&1; then
        sudo yum update -y
        sudo amazon-linux-extras install docker -y 2>/dev/null || sudo yum install -y docker
    else
        echo "Unsupported package manager."
        exit 1
    fi
else
    echo "Docker already installed."
fi

sudo systemctl enable docker
sudo systemctl start docker

echo ""
echo "Docker version:"
sudo docker --version

echo ""
echo "[3/6] Checking Docker Compose..."

if sudo docker compose version >/dev/null 2>&1; then
    COMPOSE="sudo docker compose"
    echo "Using Docker Compose plugin."
else
    echo "Docker Compose plugin not found."

    DOCKER_CONFIG="${DOCKER_CONFIG:-$HOME/.docker}"
    mkdir -p "$DOCKER_CONFIG/cli-plugins"

    echo "Installing Docker Compose..."

    curl -SL \
        "https://github.com/docker/compose/releases/download/v2.39.1/docker-compose-linux-x86_64" \
        -o "$DOCKER_CONFIG/cli-plugins/docker-compose"

    chmod +x "$DOCKER_CONFIG/cli-plugins/docker-compose"

    if sudo docker compose version >/dev/null 2>&1; then
        COMPOSE="sudo docker compose"
    else
        echo "Docker Compose installation failed."
        exit 1
    fi
fi

echo "Compose version:"
$COMPOSE version

echo ""
echo "[4/6] Checking environment..."

if [ ! -f ".env" ]; then

    if [ ! -f ".env.example" ]; then
        echo ".env.example not found."
        echo "Cannot create .env."
        exit 1
    fi

    echo "Creating .env from .env.example..."

    cp .env.example .env

    if command -v openssl >/dev/null 2>&1; then
        SECRET_KEY=$(openssl rand -hex 32)
        JWT_SECRET_KEY=$(openssl rand -hex 32)
    else
        echo "openssl not found. Installing..."
        sudo dnf install -y openssl 2>/dev/null || sudo yum install -y openssl

        SECRET_KEY=$(openssl rand -hex 32)
        JWT_SECRET_KEY=$(openssl rand -hex 32)
    fi

    if grep -q "^SECRET_KEY=" .env; then
        sed -i "s/^SECRET_KEY=.*/SECRET_KEY=$SECRET_KEY/" .env
    else
        echo "SECRET_KEY=$SECRET_KEY" >> .env
    fi

    if grep -q "^JWT_SECRET_KEY=" .env; then
        sed -i "s/^JWT_SECRET_KEY=.*/JWT_SECRET_KEY=$JWT_SECRET_KEY/" .env
    else
        echo "JWT_SECRET_KEY=$JWT_SECRET_KEY" >> .env
    fi

    echo ".env created."
else
    echo ".env already exists. Keeping existing configuration."
fi

echo ""
echo "[5/6] Validating Docker Compose configuration..."

$COMPOSE config

echo ""
echo "[6/6] Building and starting application..."

$COMPOSE build

$COMPOSE up -d

echo ""
echo "========================================================="
echo "             Deployment Complete!"
echo "========================================================="

echo ""
echo "Running containers:"
$COMPOSE ps

echo ""
echo "Application logs:"
echo "    $COMPOSE logs --tail=100"

echo ""
echo "Follow logs:"
echo "    $COMPOSE logs -f"

echo ""
echo "Health check:"
echo "    curl http://localhost/api/health"

echo ""
echo "========================================================="
```
