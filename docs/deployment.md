# HuaJian_Pay — Production Deployment & Operations Plan

> **Status (verified against repo HEAD):** Local SQLite + mock/alipay channel path is the **implemented** runtime.
> **Docker Compose / MySQL production stack** described below is a **recommended target architecture only** — **not implemented** in this repository (no `Dockerfile`, no `docker-compose.yml` as of this doc revision).
>
> Corrected against: root `package.json`, `.env.example`, `apps/server` env defaults, and `pnpm test:mock-e2e` (port **8080**).

---

## 1. What is actually implemented

| Capability | Status | Notes |
| --- | --- | --- |
| Node monorepo (`pnpm`) | ✅ Implemented | Root scripts orchestrate server + admin |
| HTTP API server | ✅ Implemented | Default `HOST=0.0.0.0`, **`PORT=8080`** |
| SQLite database | ✅ Implemented | `DB_DRIVER=sqlite`, `DB_DSN=./data/huajian_pay.db` |
| Admin UI (Vite) | ✅ Implemented | `pnpm dev:admin` (dev); production static build via `pnpm build` |
| Mock channel + E2E | ✅ Implemented | `CHANNEL_MODE=mock`; `pnpm test:mock-e2e` self-starts server, waits `/health`, full flow, kills child |
| Alipay channel config slots | ✅ Partial | Env keys present; enable with `CHANNEL_MODE=alipay` + real keys |
| MySQL driver wiring | ⚠️ Planned / partial | Commented in `.env.example`; **do not assume production-ready** |
| Docker / Compose | ❌ **Not implemented** | Section 6 is **recommendation only** |
| Managed reverse proxy configs | ❌ Not in repo | Use nginx/Caddy examples in Section 5 as templates |

---

## 2. Runtime topology (current monorepo)

```
HuaJian_Pay/
  package.json          # workspace scripts (source of truth for commands)
  .env.example          # env template (copy to .env — never commit secrets)
  apps/server/          # API + pay notify + admin API
  apps/admin/           # Admin SPA
  scripts/mock-e2e.mjs  # Single-command mock E2E (spawns server itself)
  docs/                 # This file and integration guides
  data/                 # SQLite file location (local/default)
```

**Default public base URL (local):** `http://localhost:8080` (`APP_URL` / `PORT` in `.env.example`).

---

## 3. Package scripts (root `package.json` — authoritative)

| Script | Purpose |
| --- | --- |
| `pnpm dev` | Concurrent `dev:server` + `dev:admin` |
| `pnpm dev:server` | Server only (`pnpm --filter @huajian/server dev`) |
| `pnpm dev:admin` | Admin Vite dev server |
| `pnpm build` | Build all packages / apps in workspace |
| `pnpm start` | Start **server** production entry (`@huajian/server start`) |
| `pnpm test:mock-e2e` | **Self-contained** mock E2E: spawn `CHANNEL_MODE=mock` server → wait `/health` → login/order/query/mock-paid/notify → kill child |
| `pnpm lint` | Workspace lint if configured |

### Production process (implemented path)

```bash
# From repo root HuaJian_Pay/
cp .env.example .env   # then edit secrets
pnpm install
pnpm build
pnpm start             # serves API on PORT (default 8080)
```

Admin production static assets: build with `pnpm build`, then either:

1. Serve `apps/admin` dist behind the same reverse proxy as the API, or  
2. Point CDN/static host at admin `dist` and set CORS / `APP_URL` accordingly.

> There is **no** root script named `start:prod` / `docker:up` unless added later — do not document fictional scripts.

### Smoke / regression

```bash
pnpm test:mock-e2e
# Expect: PASS mock e2e (exit 0). Script must not require a pre-running server.
```

---

## 4. Environment variables (aligned with `.env.example`)

Copy `.env.example` → `.env`. **Never commit real secrets.**

### Core

| Variable | Example / default | Required | Description |
| --- | --- | --- | --- |
| `APP_NAME` | `HuaJian_Pay` | no | Display name |
| `APP_ENV` | `local` / `production` | yes (prod) | Environment label |
| `APP_URL` | `http://localhost:8080` | yes | Public base URL (callbacks, links) |
| `APP_SECRET` | long random | yes (prod) | App signing / session material |
| `HOST` | `0.0.0.0` | no | Bind address |
| **`PORT`** | **`8080`** | no | **HTTP listen port (default 8080, not 3000)** |
| `CHANNEL_MODE` | `mock` \| `alipay` | yes | Channel adapter |

### Database

| Variable | Example | Notes |
| --- | --- | --- |
| `DB_DRIVER` | `sqlite` (default implemented path) | MySQL values are **template / future** |
| `DB_DSN` | `./data/huajian_pay.db` | SQLite path |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASS` | commented in `.env.example` | **Only if/when MySQL is fully implemented** |

### Admin bootstrap

| Variable | Notes |
| --- | --- |
| `ADMIN_USERNAME` | Initial admin user |
| `ADMIN_PASSWORD` | Change immediately in production |

### Alipay (when `CHANNEL_MODE=alipay`)

`ALIPAY_APP_ID`, `ALIPAY_PRIVATE_KEY`, `ALIPAY_PUBLIC_KEY`, `ALIPAY_NOTIFY_URL`, `ALIPAY_RETURN_URL`, optional `ALIPAY_ACCOUNT`.

### WeChat (optional / future)

Keys present in `.env.example` as placeholders — treat as **not go-live** until product enables WeChat.

### Platform (YiPay-compatible merchant defaults)

| Variable | Example | Notes |
| --- | --- | --- |
| `PLATFORM_PID` | `1000` | Platform merchant pid |
| `PLATFORM_KEY` | strong secret | Merchant sign key |

---

## 5. Reverse proxy (template — not shipped as files)

TLS termination and HTTP→HTTPS should sit in front of Node on **8080**.

### nginx (example)

```nginx
server {
  listen 443 ssl http2;
  server_name pay.example.com;

  # ssl_certificate     /path/fullchain.pem;
  # ssl_certificate_key /path/privkey.pem;

  client_max_body_size 2m;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Set `APP_URL=https://pay.example.com` and Alipay notify/return URLs to the public HTTPS origin.

---

## 6. Docker / MySQL — **recommended only (NOT implemented)**

The following is a **target** ops shape for a later milestone. **This repository does not currently provide Docker assets.** Do not run these commands expecting them to work out of the box.

### Suggested future layout (illustrative)

```text
# NOT IN REPO TODAY
Dockerfile              # multi-stage: pnpm build → node start
docker-compose.yml      # app + mysql + optional caddy
```

### Suggested compose sketch (do not treat as checked-in truth)

```yaml
# ILLUSTRATIVE ONLY — unimplemented template
services:
  app:
    # build: .
    # ports: ["8080:8080"]
    environment:
      APP_ENV: production
      PORT: "8080"
      DB_DRIVER: mysql
      # DB_HOST: mysql
    # depends_on: [mysql]
  mysql:
    image: mysql:8
    # volumes / secrets omitted
```

### When implementing later

1. Add real `Dockerfile` + `docker-compose.yml` and wire CI.  
2. Finish MySQL migrations/driver parity with SQLite.  
3. Healthcheck against `GET /health` on port 8080.  
4. Update this section from “recommended” → “implemented” only after assets land in git.

---

## 7. Operations checklist (implemented stack)

### Before go-live (SQLite or future MySQL)

- [ ] `.env` not in git; secrets rotated from example defaults  
- [ ] `APP_ENV=production`, strong `APP_SECRET` / `PLATFORM_KEY` / `ADMIN_PASSWORD`  
- [ ] `APP_URL` and notify URLs use public **HTTPS**  
- [ ] `CHANNEL_MODE` correct (`mock` only for staging drills)  
- [ ] `pnpm build` succeeds on release host  
- [ ] `pnpm test:mock-e2e` green on CI or release candidate  
- [ ] Process supervisor (systemd / pm2 / container) restarts `pnpm start`  
- [ ] Log rotation + disk watch on `data/` (SQLite)  
- [ ] Backup policy for DB file or future MySQL dumps  

### systemd sketch (Node on host)

```ini
[Unit]
Description=HuaJian_Pay API
After=network.target

[Service]
WorkingDirectory=/opt/HuaJian_Pay
EnvironmentFile=/opt/HuaJian_Pay/.env
ExecStart=/usr/bin/pnpm start
Restart=on-failure
User=www-data

[Install]
WantedBy=multi-user.target
```

### Health

- Probe: `GET http://127.0.0.1:8080/health` (or via public HTTPS).  
- Mock E2E already waits on `/health` before exercising pay flow.

### Rollback

1. Keep previous `pnpm build` artifact or git tag.  
2. Stop process → restore DB backup → deploy previous tag → `pnpm start`.  
3. Re-run `pnpm test:mock-e2e` in staging before re-enabling traffic.

---

## 8. Security ops (pointer)

Full threat model and go-live security checklist: follow task **`docs/security-checklist.md`** (produced after this deployment doc is accepted). Minimum here:

- Never log `PLATFORM_KEY`, Alipay private keys, or raw notify bodies with secrets.  
- Restrict admin to VPN / IP allowlist where possible.  
- Prefer mock channel in non-prod; production keys only on production hosts.

---

## 9. Document history

| Date | Change |
| --- | --- |
| 2026-07-25 | Corrected against real root scripts, `.env.example`, default **PORT=8080**, self-start `pnpm test:mock-e2e`. Marked Docker/MySQL as **unimplemented recommendations**. Removed assumptions of non-existent compose/Dockerfile scripts. |
