# HuaJian_Pay — Production Deployment & Operations Plan

> **Verified against git HEAD package manifests (authoritative):**
> - root `package.json` scripts only: `dev`, `build`, `start`, `typecheck`, `test:mock-e2e`
> - `@huajian/server` scripts: `dev`, `build`, `start`, `typecheck`
> - `@huajian/admin` scripts: `dev`, `build`, `typecheck`, `preview` (via `pnpm --filter @huajian/admin …`)
> - `.env.example`: **`PORT=8080`**, `HOST=0.0.0.0`, SQLite default, `CHANNEL_MODE=mock|alipay`
>
> **Docker / MySQL production stack below is a recommended target only — not implemented** (no `Dockerfile`, no `docker-compose.yml` in repo).

---

## 1. Implementation status

| Capability | Status | Notes |
| --- | --- | --- |
| pnpm monorepo | ✅ | `pnpm-workspace.yaml`; packages under `apps/*` |
| HTTP API (`@huajian/server`) | ✅ | Fastify; default **`PORT=8080`**, `HOST=0.0.0.0` |
| SQLite | ✅ | `DB_DRIVER=sqlite`, `DB_DSN=./data/huajian_pay.db` |
| Admin SPA (`@huajian/admin`) | ✅ code | Vue/Vite app; **not** wired as a root script |
| Mock channel + E2E | ✅ | `CHANNEL_MODE=mock`; `pnpm test:mock-e2e` self-starts server, waits `/health`, full flow, kills child |
| Alipay env slots | ✅ partial | Fill keys; set `CHANNEL_MODE=alipay` |
| MySQL | ⚠️ template | Commented block in `.env.example` only — **not production-ready** |
| Docker / Compose | ❌ **not implemented** | See §6 recommendations only |
| Root `dev:admin` / `dev:server` / `lint` | ❌ **do not exist** | Use commands in §3 only |

---

## 2. Repo layout (ops-relevant)

```text
HuaJian_Pay/
  package.json              # root scripts (source of truth)
  pnpm-workspace.yaml
  .env.example              # copy → .env (never commit secrets)
  apps/server/              # API + pay + admin API
  apps/admin/               # Admin SPA (separate package scripts)
  scripts/mock-e2e.mjs
  docs/
  data/                     # default SQLite location
```

Local API base: `http://localhost:8080` (`APP_URL` / `PORT` in `.env.example`).

---

## 3. Commands that actually exist

### 3.1 Root `package.json` (only these)

| Command | Expands to | Purpose |
| --- | --- | --- |
| `pnpm dev` | `pnpm --filter @huajian/server dev` | API dev (`tsx watch src/index.ts`) |
| `pnpm build` | `pnpm --filter @huajian/server build` | Compile server (`tsc` → `dist/`) |
| `pnpm start` | `pnpm --filter @huajian/server start` | Run `node dist/index.js` on **PORT** (default **8080**) |
| `pnpm typecheck` | `pnpm --filter @huajian/server typecheck` | Server `tsc --noEmit` |
| `pnpm test:mock-e2e` | `node scripts/mock-e2e.mjs` | Self-contained mock E2E |

**There are no root scripts named** `dev:server`, `dev:admin`, `lint`, `start:prod`, `docker:up`, or concurrent “dev both apps”.

### 3.2 Server package (`@huajian/server`)

| Command | Purpose |
| --- | --- |
| `pnpm --filter @huajian/server dev` | same as root `pnpm dev` |
| `pnpm --filter @huajian/server build` | `tsc -p tsconfig.json` |
| `pnpm --filter @huajian/server start` | `node dist/index.js` |
| `pnpm --filter @huajian/server typecheck` | `tsc --noEmit` |

### 3.3 Admin package (`@huajian/admin`)

Admin is **not** started by root `pnpm dev`. Use filter:

| Command | Purpose |
| --- | --- |
| `pnpm --filter @huajian/admin dev` | Vite dev server |
| `pnpm --filter @huajian/admin build` | `vue-tsc --noEmit && vite build` |
| `pnpm --filter @huajian/admin typecheck` | `vue-tsc --noEmit` |
| `pnpm --filter @huajian/admin preview` | Preview production static build |

### 3.4 Local full-stack (two terminals)

```bash
# Terminal A — API (port 8080 by default)
pnpm dev

# Terminal B — Admin UI
pnpm --filter @huajian/admin dev
```

### 3.5 Production-ish process (implemented path = Node + SQLite)

```bash
# Repo root HuaJian_Pay/
cp .env.example .env   # edit secrets; keep PORT=8080 unless reverse-proxied differently
pnpm install
pnpm build             # builds @huajian/server only
pnpm start             # listens HOST/PORT from env (default 0.0.0.0:8080)

# Optional: production admin assets
pnpm --filter @huajian/admin build
# Serve apps/admin/dist via CDN or reverse proxy (not bundled into root start).
```

### 3.6 Smoke / regression

```bash
pnpm test:mock-e2e
# Expect: PASS mock e2e (exit 0).
# Script spawns CHANNEL_MODE=mock server, waits GET /health, runs login/order/query/mock-paid/notify, kills child.
# Does not require a pre-running server.
```

### 3.7 Pre-release checks (recommended)

```bash
pnpm typecheck
pnpm --filter @huajian/admin typecheck
pnpm build
pnpm --filter @huajian/admin build
pnpm test:mock-e2e
```

---

## 4. Environment (`.env.example`)

Copy `.env.example` → `.env`. **Never commit real secrets.**

| Variable | Example / default | Notes |
| --- | --- | --- |
| `APP_NAME` | `HuaJian_Pay` | Display |
| `APP_ENV` | `local` / `production` | Label |
| `APP_URL` | `http://localhost:8080` | Public base URL |
| `APP_SECRET` | long random | Required in prod |
| `HOST` | `0.0.0.0` | Bind |
| **`PORT`** | **`8080`** | **HTTP listen port (not 3000)** |
| `CHANNEL_MODE` | `mock` \| `alipay` | Channel adapter |
| `DB_DRIVER` | `sqlite` | Implemented default |
| `DB_DSN` | `./data/huajian_pay.db` | SQLite path |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASS` | commented | MySQL **template only** |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | bootstrap | Change in prod |
| `ALIPAY_*` | empty in example | Required when `CHANNEL_MODE=alipay` |
| `WECHAT_*` | empty | Optional / future |
| `PLATFORM_PID` / `PLATFORM_KEY` | YiPay-compatible defaults | Merchant platform key |

---

## 5. Reverse proxy (template — not shipped in repo)

Terminate TLS in front of Node on **8080**.

```nginx
server {
  listen 443 ssl http2;
  server_name pay.example.com;

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

Set `APP_URL=https://pay.example.com` and payment notify/return URLs to the public HTTPS origin.

---

## 6. Docker / MySQL — recommended only (**NOT implemented**)

Do **not** document or run fictional root scripts. When Docker is added later, introduce real `Dockerfile` / `docker-compose.yml` and update this section.

Illustrative target (not in git today):

```yaml
# ILLUSTRATIVE ONLY — unimplemented
services:
  app:
    # build: .
    # ports: ["8080:8080"]
    environment:
      APP_ENV: production
      PORT: "8080"
      DB_DRIVER: mysql
  mysql:
    image: mysql:8
```

Before calling MySQL “supported”: implement driver parity, migrations, healthcheck on `GET /health`, and CI.

---

## 7. Operations checklist (current Node + SQLite path)

- [ ] `.env` not in git; secrets rotated from example defaults  
- [ ] `APP_ENV=production`, strong `APP_SECRET` / `PLATFORM_KEY` / `ADMIN_PASSWORD`  
- [ ] `APP_URL` and notify URLs use public **HTTPS**  
- [ ] `CHANNEL_MODE=mock` only for staging drills  
- [ ] `pnpm build` + `pnpm start` on release host (port **8080** or proxy→8080)  
- [ ] `pnpm test:mock-e2e` green on RC  
- [ ] Process supervisor (systemd / pm2) restarts `pnpm start`  
- [ ] Backup `data/huajian_pay.db` (or future MySQL dumps)  
- [ ] Admin static (`pnpm --filter @huajian/admin build`) deployed if UI is required  

### systemd sketch

```ini
[Unit]
Description=HuaJian_Pay API
After=network.target

[Service]
WorkingDirectory=/opt/HuaJian_Pay
EnvironmentFile=/opt/HuaJian_Pay/.env
ExecStart=/usr/bin/pnpm start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

### Health / rollback

- Probe: `GET /health` on the API port (default **8080**).  
- Rollback: previous git tag → restore DB backup → `pnpm build && pnpm start` → re-run `pnpm test:mock-e2e` in staging.

---

## 8. Security pointer

Full threat model / go-live checklist: `docs/security-checklist.md` (follow-on task after this doc is accepted).

Minimum: never log `PLATFORM_KEY` or Alipay private keys; restrict admin exposure; mock channel outside production.

---

## 9. Document history

| Date | Change |
| --- | --- |
| 2026-07-25 | First correction pass: port 8080, mock E2E, Docker/MySQL as non-implemented. |
| 2026-07-25 | **Incremental fix:** removed non-existent root scripts (`dev:admin`, `dev:server`, `lint`, concurrent root `dev`). Documented **only** root scripts from `package.json` and filter commands for `@huajian/admin` / `@huajian/server`. |
