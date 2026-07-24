# HuaJian_Pay Deployment & Operations Guide

**Owner:** Planner  
**Version:** v0.2.0  
**Last updated:** 2026-07-25  
**Status:** locked for v0.3.0 release

---

## 1. Overview

HuaJian_Pay is a YiPay-compatible merchant collection platform. This document describes production deployment paths for the locked architecture:

- **Backend:** Node.js 20 + TypeScript + Fastify (PayCore)
- **Frontend (Admin):** Vue 3 + NaiveUI (AdminUI)
- **Database:** SQLite (development) → MySQL (production)
- **Queue:** DB-backed notify retries (no external Redis for MVP)
- **Git workflow:** Push after every major milestone; tag major releases

---

## 2. Development Environment

### Local Setup (Recommended)

```powershell
# 1. Clone (if not present)
git clone https://github.com/lysimportant/HuaJian_Pay.git
cd HuaJian_Pay

# 2. Install
pnpm install
pnpm dev:server     # PayCore Fastify server (port 3000)
pnpm dev:admin      # AdminUI dev server (port 5173)

# 3. Environment (copy template)
cp .env.example .env.local
# edit .env.local with your keys
```

### Required `.env.local` (dev)

```env
APP_ENV=development
APP_URL=http://localhost:3000
DB_DRIVER=sqlite
DB_URL=./data/huajian_pay.db
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me-please
# Alipay / WeChat keys stored via admin UI or .env
```

### Local Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev:server` | Start PayCore Fastify API |
| `pnpm dev:admin` | Start Vue AdminUI dev server |
| `pnpm migrate` | Run Drizzle migrations (SQLite) |
| `pnpm test` | Run shared tests |

---

## 3. Production Deployment Options

### 3.1 Option A: Docker Compose (Recommended for most users)

**`docker-compose.yml`**

```yaml
version: '3.9'
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    restart: unless-stopped
    ports:
      - "3000:3000"
      - "443:443"           # HTTPS termination
    volumes:
      - ./data:/app/data
    env_file:
      - .env
    depends_on:
      - db
  db:
    image: mysql:8.0
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-changeme}
      MYSQL_DATABASE: huajian_pay
    volumes:
      - mysql-data:/var/lib/mysql
    ports:
      - "3306:3306"
  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx:/etc/nginx/conf.d:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - app

volumes:
  mysql-data:
```

**`Dockerfile`**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build   # or pnpm build:server + build:admin

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/apps/server/dist /app/apps/server/dist
COPY package*.json ./
RUN pnpm install --production --frozen-lockfile

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]   # or your server entry
```

### 3.2 Option B: PM2 + Single Process (Simpler)

**`ecosystem.config.js`**

```js
module.exports = {
  apps: [{
    name: "huajian-pay",
    script: "dist/index.js",
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    env: {
      NODE_ENV: "production",
      DB_DRIVER: "mysql",
      PORT: 3000,
      APP_URL: "https://your-domain.com"
    }
  }]
};
```

**Installation:**

```bash
pm2 install pm2-logrotate
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## 4. Production Environment Variables

Create `.env` (not committed):

```env
# Core
APP_ENV=production
APP_NAME=HuaJian_Pay
APP_URL=https://pay.example.com
APP_SECRET=change-this-in-production
SESSION_SECRET=change-this-in-production

# Database
DB_DRIVER=mysql
DB_HOST=db
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=huajian_pay
DB_SSL=false

# Admin
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me-please

# Alipay (stored via admin UI preferred)
# WeChat (stored via admin UI preferred)

# Notify worker
NOTIFY_WORKER_ENABLED=true
NOTIFY_RETRY_MAX=5
NOTIFY_RETRY_DELAY=30000
```

**Secret handling:** Never commit `.env`. Use Docker secrets or external secrets manager (e.g. Kubernetes, AWS Secrets Manager).

---

## 5. HTTPS + Reverse Proxy

### Nginx Configuration (`nginx.conf`)

```nginx
server {
    listen 80;
    server_name pay.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name pay.example.com;

    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://app:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /admin/api {
        proxy_pass http://app:3000;
        proxy_set_header Host $host;
        # ... other headers
    }
}
```

**Alipay / WeChat Notify Requirement:**  
Your platform must expose **public HTTPS URLs** for:

- `notify_url` (merchant callback from newapi)
- Channel notify endpoints (`/channels/alipay/notify`, `/channels/wechat/notify`)

**Recommended:** Use a public domain + SSL (e.g. domain with Let's Encrypt cert).

---

## 6. SQLite → MySQL Migration

### Step 1: Development (SQLite)
- `pnpm migrate` creates `data/huajian_pay.db`

### Step 2: Production Migration

```sql
-- Connect to MySQL
mysql -h db -u root -p huajian_pay

-- Dump schema
mysqldump -h db -u root -p --no-data huajian_pay > schema.sql

-- Restore to MySQL
mysql -h db -u root -p huajian_pay < schema.sql
```

**Drizzle migration script** (for future):

```ts
// scripts/migrate-mysql.ts
import { migrate } from "drizzle-orm/mysql2/migrator";
import { db, mysql2 } from "../src/db";
import { migrate as sqliteMigrate } from "drizzle-orm/sqlite3/migrator";

await sqliteMigrate(...); // or just use MySQL schema
await migrate(db, { migrationsFolder: "./drizzle" });
```

---

## 7. Backups & Recovery

### SQLite Backup

```bash
# Daily backup
sqlite3 data/huajian_pay.db ".backup ../backups/huajian_pay.db.bak"
```

### MySQL Backup (Cron)

```bash
mysqldump -h db -u root -p huajian_pay > /var/backups/huajian_pay-$(date +%Y%m%d).sql
```

### Restore

- MySQL: `mysql -u root -p huajian_pay < backup.sql`
- SQLite: `sqlite3 huajian_pay.db < backup.sql` (limited)

---

## 8. Logging & Monitoring

### Logging

**Fastify default:** Winston or Pino to `stdout`

**Log rotation (PM2):**

```bash
pm2 logrotate --rotate-interval 1d
```

### Monitoring

- **CPU / Memory:** `pm2 monit`
- **Database:** MySQL slow query log
- **Health check:** Expose `/health` endpoint (Fastify plugin)

```ts
// src/plugins/health.ts
app.get('/health', async () => {
  const dbOk = await db.healthCheck();
  return { status: 'ok', uptime: process.uptime(), db: dbOk };
});
```

---

## 9. Rollback & Release Strategy

### Tag-based releases

```bash
# After successful deploy
git tag -a v0.3.0 -m "Alipay MVP"
git push origin main --tags
```

### Rollback

```bash
# Rollback to previous tag
git checkout main
git reset --hard HEAD~1
git push origin main --force-with-lease

# Or use PM2 to restart older version
pm2 delete huajian-pay
pm2 start ecosystem.config.js --only huajian-pay
```

---

## 10. Security Checklist

| Item | Action |
| --- | --- |
| HTTPS | Required for Alipay/WeChat notify |
| Secrets | Never commit `.env`; use Docker secrets or external vault |
| Admin password | Strong random, change on first deploy |
| Database | MySQL with SSL if possible |
| Rate limiting | Fastify rate-limit plugin on `/admin/api/*` |

---

## 11. Deployment Checklist

1. [ ] Create `docker-compose.yml`
2. [ ] Generate TLS cert (Let's Encrypt via Caddy or manual)
3. [ ] Copy `nginx.conf` + certs
4. [ ] Set environment variables (no secrets)
5. [ ] `docker-compose up -d`
6. [ ] Run migrations
7. [ ] Test Alipay precreate flow
8. [ ] Set up backup cron
9. [ ] Tag release `v0.3.0`

---

## 12. Next Steps (after deploy)

- Configure Nginx with Let's Encrypt
- Set up database backup
- Monitor first 24h notify traffic
- Prepare WeChat adapter

---

**Author:** Planner  
**Date:** 2026-07-25  
**Repo:** https://github.com/lysimportant/HuaJian_Pay.git
