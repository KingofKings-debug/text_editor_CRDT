# AWS EC2 Deployment Guide for CRDT Collaborative Text Editor

This guide walks you through deploying the CRDT Collaborative Text Editor application on an AWS EC2 instance (supporting both **Amazon Linux 2023 / 2** and **Ubuntu**).

---

## Step 1: Launch an AWS EC2 Instance

1. Log in to the [AWS Management Console](https://aws.amazon.com/console/) and navigate to **EC2**.
2. Click **Launch Instance**.
3. **Name**: `CRDT-Editor-Server`.
4. **AMI**: 
   - **Amazon Linux 2023** (default) OR **Ubuntu 22.04 LTS**.
5. **Instance Type**: `t2.micro` or `t3.micro` (Free Tier eligible) or `t3.small`.
6. **Key Pair**: Select or create a Key Pair (`.pem` file).
7. **Security Group Inbound Rules**:
   | Type | Protocol | Port Range | Source | Purpose |
   | --- | --- | --- | --- | --- |
   | SSH | TCP | 22 | My IP / 0.0.0.0/0 | SSH Access |
   | HTTP | TCP | 80 | 0.0.0.0/0 | Web Traffic (Nginx) |
   | HTTPS | TCP | 443 | 0.0.0.0/0 | SSL Access (Optional) |
   | Custom TCP | TCP | 5000 | 0.0.0.0/0 | Direct Flask (Optional) |

---

## Step 2: SSH Into Your Amazon Linux Instance

```bash
chmod 400 your-key.pem

# For Amazon Linux (AL2 / AL2023):
ssh -i "your-key.pem" ec2-user@<YOUR-EC2-PUBLIC-IP>

# (For Ubuntu instances):
# ssh -i "your-key.pem" ubuntu@<YOUR-EC2-PUBLIC-IP>
```

---

## Step 3: Clone Repository & Deploy

1. Ensure Git is installed:
   ```bash
   sudo dnf install -y git    # Amazon Linux 2023
   # OR
   # sudo yum install -y git  # Amazon Linux 2
   ```

2. Clone your GitHub repository:
   ```bash
   git clone https://github.com/KingofKings-debug/text_editor_CRDT.git
   cd text_editor_CRDT
   ```

3. Run the universal automated deployment script:
   ```bash
   chmod +x deploy_ec2.sh
   ./deploy_ec2.sh
   ```

The script automatically detects Amazon Linux (`dnf`/`yum`), installs Docker, enables the Docker service (`sudo systemctl enable --now docker`), configures `.env`, builds the Docker containers, and launches the app on Port 80.

---

## Step 4: Verification & Logs

- Open `http://<YOUR-EC2-PUBLIC-IP>/` in your web browser.
- Health Check: `http://<YOUR-EC2-PUBLIC-IP>/api/health`
- Readiness Check: `http://<YOUR-EC2-PUBLIC-IP>/api/ready`

To view container logs:
```bash
sudo docker compose logs -f
```

---

## Quick Manual Amazon Linux Commands (Reference)

If you prefer installing manually step-by-step on Amazon Linux 2023:
```bash
# 1. Update and install Docker & Git
sudo dnf update -y
sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user

# 2. Install Docker Compose plugin
mkdir -p ~/.docker/cli-plugins
curl -SL https://github.com/docker/compose/releases/download/v2.24.5/docker-compose-linux-x86_64 -o ~/.docker/cli-plugins/docker-compose
chmod +x ~/.docker/cli-plugins/docker-compose

# 3. Clone and launch
git clone https://github.com/KingofKings-debug/text_editor_CRDT.git
cd text_editor_CRDT
cp .env.example .env
sudo docker compose up --build -d
```
