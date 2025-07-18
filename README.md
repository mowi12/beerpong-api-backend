# Beer Pong API Backend

A complete, lightweight, and secure backend API for managing beer pong tournament results. This project uses a Node.js/Fastify server to provide CRUD operations, a simple SQLite database for data storage, and Caddy as a high-performance reverse proxy with automatic HTTPS.

It also includes a Python-based Terminal User Interface (TUI) for easy, command-line management of tournaments.

## Features

- **RESTful API:** Full CRUD (Create, Read, Update, Delete) operations for tournaments and players.
- **Lightweight & Fast:** Built with Fastify and `better-sqlite3` for high performance and low overhead.
- **Secure:** Uses Caddy for automatic HTTPS and HTTP Basic Authentication to protect write operations.
- **Persistent:** The API server is managed by PM2 to ensure it's always running.
- **Easy Management:** A user-friendly TUI (`manager.py`) allows for adding, updating, and deleting tournaments.

## Tech Stack

- **Backend:** Node.js, Fastify
- **Database:** SQLite
- **Process Manager:** PM2
- **Reverse Proxy:** Caddy
- **Management TUI:** Python, `questionary`, `rich`

## Prerequisites

- A VPS running Ubuntu 22.04 or later.
- A domain or subdomain pointing to your VPS's IP address (e.g., via [DuckDNS](https://www.duckdns.org/)).
- Node.js v20.x or later installed on the VPS.

---

## Step-by-Step Setup Guide

### Step 1: Server Preparation

1.  SSH into your VPS.
2.  Clone this repository:
    ```bash
    git clone https://github.com/your-username/beerpong-api-backend.git
    cd beerpong-api-backend
    ```

### Step 2: Backend & Database Setup

1.  **Install Node.js Dependencies:**

    ```bash
    npm install
    ```

2.  **Create the SQLite Database:**
    Use the included `schema.sql` file to create the database and all necessary tables with one command:
    ```bash
    sqlite3 beerpong.db < schema.sql
    ```

### Step 3: Run the API with PM2

1.  **Install PM2 Globally:**

    ```bash
    sudo npm install pm2 -g
    ```

2.  **Start and Manage the API Server:**
    ```bash
    pm2 start server.js --name beerpong-api
    pm2 save
    ```

### Step 4: Setting up the Caddy Reverse Proxy

1.  **Install Caddy:**
    Follow the official instructions to install Caddy for Ubuntu:

    ```bash
    sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
    sudo apt update
    sudo apt install caddy
    ```

2.  **Create a Hashed Password:**
    Choose a strong password and run the following, then copy the output hash string:

    ```bash
    caddy hash-password --plaintext 'YourSuperSecretPassword'
    ```

3.  **Configure Caddy:**
    Open `/etc/caddy/Caddyfile` with `sudo nano` and replace its content with the following, updating the placeholders:

    ```caddy
    # /etc/caddy/Caddyfile
    api.yourdomain.com {
        log {
            output file /var/log/caddy/api.log
        }
        @protected {
            method POST PUT DELETE
        }
        route {
            basic_auth @protected {
                admin JDJhJDE0JDN...your...copied...hash...here
            }
            reverse_proxy localhost:3000
        }
    }
    ```

4.  **Start and Enable Caddy:**
    ```bash
    sudo systemctl restart caddy
    sudo systemctl enable caddy
    ```

### Step 5: Firewall Configuration

Ensure your server's firewall allows web traffic.

```bash
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw enable
```

**Your backend is now fully deployed and secure.**

---

## Management & Testing

### Using the TUI Manager

This repository includes `manager.py`, a user-friendly TUI for easy tournament management. This is the recommended way to interact with the API.

1.  **Setup on Your Local Machine:**
    Install the required Python libraries:

    ```bash
    pip install questionary rich requests
    ```

2.  **Run the TUI:**
    Set your credentials as environment variables for your current terminal session.

    ```bash
    export API_URL="https://api.yourdomain.com"
    export API_USER="admin"
    export API_PASS='YourSuperSecretPassword'

    python manager.py
    ```

### Testing with `curl`

You can also test the API directly from your local machine using `curl`.

- **Get all tournaments (public):**

  ```bash
  curl https://api.yourdomain.com/api/tournaments
  ```

- **Create a new tournament (protected):**
  ```bash
  curl -X POST -u 'admin:YourSuperSecretPassword' \
  -H "Content-Type: application/json" \
  -d '{"date":"2025-01-01","type":"single","flavor":"Initial Test","participants":["Admin"],"placements":{"firstPlace":["Admin"]}}' \
  https://api.yourdomain.com/api/tournaments
  ```
