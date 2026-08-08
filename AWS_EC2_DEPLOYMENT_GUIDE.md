# AWS EC2 Deployment Guide for CRDT Collaborative Text Editor

This guide walks you through deploying the CRDT Collaborative Text Editor application on an AWS EC2 instance.

---

## Step 1: Launch an AWS EC2 Instance

1. Log in to the [AWS Management Console](https://aws.amazon.com/console/) and navigate to **EC2**.
2. Click **Launch Instance**.
3. **Name**: `CRDT-Editor-Server` (or your choice).
4. **AMI**: Choose **Ubuntu Server 22.04 LTS** or **Ubuntu Server 24.04 LTS** (64-bit x86).
5. **Instance Type**: `t2.micro` or `t3.micro` (Free Tier eligible) or `t3.small` for production loads.
6. **Key Pair**: Select an existing Key Pair or create a new one to SSH into your instance.
7. **Network Settings (Security Group)**:
   Create a Security Group with the following inbound rules:
   | Type | Protocol | Port Range | Source | Purpose |
   | --- | --- | --- | --- | --- |
   | SSH | TCP | 22 | My IP / 0.0.0.0/0 | Remote SSH Access |
   | HTTP | TCP | 80 | 0.0.0.0/0 | Public Web Access |
   | HTTPS | TCP | 443 | 0.0.0.0/0 | SSL Web Access (Optional) |
   | Custom TCP | TCP | 5000 | 0.0.0.0/0 | Direct Flask Access (Optional) |

8. Click **Launch Instance**.

---

## Step 2: Connect to Your EC2 Instance

Open your terminal or SSH client:
```bash
chmod 400 your-key.pem
ssh -i "your-key.pem" ubuntu@<YOUR-EC2-PUBLIC-IP-OR-DNS>
```

---

## Step 3: Clone Code & Run Automated Deployment

1. Clone your project repository onto the EC2 instance:
```bash
git clone <YOUR-REPOSITORY-URL> hackathon_platform
cd hackathon_platform
```

2. Make `deploy_ec2.sh` executable and run it:
```bash
chmod +x deploy_ec2.sh
./deploy_ec2.sh
```

The automated deployment script will:
- Install Docker and Docker Compose plugin.
- Create a `.env` file with randomly generated secure `SECRET_KEY` and `JWT_SECRET_KEY` strings.
- Build and start the `redis`, `backend` (Flask + Gunicorn + SocketIO), and `frontend` (Nginx + React) containers on Port 80.

---

## Step 4: Verify Your Deployment

- **Web Application**: Open `http://<YOUR-EC2-PUBLIC-IP>/` in your browser.
- **Health Check**: Test `http://<YOUR-EC2-PUBLIC-IP>/api/health` and `http://<YOUR-EC2-PUBLIC-IP>/api/ready`.
- **View Container Logs**:
  ```bash
  sudo docker compose logs -f
  ```

---

## Step 5: Managing Secrets & Environment Variables

All secrets are stored securely in `.env` on your EC2 instance and ignored by Git (`.gitignore`).

To view or edit environment secrets:
```bash
nano .env
```
After modifying `.env`, restart the services:
```bash
sudo docker compose restart
```

---

## Optional: HTTPS with Let's Encrypt Certbot

If you attach a custom domain name (e.g. `crdt.example.com`) pointing to your EC2 Public IP, you can issue a free SSL certificate:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d crdt.example.com
```
