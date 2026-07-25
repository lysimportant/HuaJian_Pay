# HuaJian_Pay — 部署与运维

> **权威来源：** 根目录 `package.json`、`.env.example`、`.env.production.example`、`Dockerfile`、`docker-compose.yml`。  
> **数据库现状：** 生产路径为 **SQLite + volume**。`.env.example` 中 MySQL 块仅为未来模板 — **MySQL 未实现，不可宣称已支持。**

---

## 1. 实现状态

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| pnpm monorepo | ✅ | `apps/server`、`apps/admin` |
| HTTP API | ✅ | Fastify，默认 **`PORT=8080`** |
| SQLite | ✅ | `DB_DRIVER=sqlite`，容器内默认 `DB_DSN=/data/huajian_pay.db` |
| Admin SPA | ✅ 代码 | Vite/Vue；**API 进程不托管静态资源** |
| Mock E2E | ✅ | `pnpm test:mock-e2e` 自启服务 |
| Alipay 环境机 | ✅ 部分 | `CHANNEL_MODE=alipay` + 密钥 |
| WeChat APIv3 Native | ✅ 核心 | `CHANNEL_MODE=wxpay`；回调 `POST /channels/wxpay/notify`；见 `docs/wechat-pay.md` |
| Docker 多阶段镜像 | ✅ | 根目录 `Dockerfile` + `.dockerignore`（`pnpm deploy --prod`） |
| Compose（SQLite volume） | ✅ 生产可用 | `api` + 可选 `--profile web`（Admin SPA + 反代） |
| MySQL | ❌ 未实现 | 仅 `.env.example` 注释模板 |
| Admin 与 API 同端口静态托管 | ❌ 未实现 | 用 Compose `web` 或 CDN/主机 Nginx |

---

## 2. 本机 Node（无 Docker）

```bash
cp .env.example .env   # 改密钥；PORT=8080
pnpm install
pnpm build             # 仅 @huajian/server
pnpm start             # node apps/server dist，监听 HOST/PORT

# 可选 Admin
pnpm --filter @huajian/admin build
# 用 CDN / nginx / vite preview 托管 apps/admin/dist
```

根脚本（仅这些）：`dev` `build` `start` `typecheck` `test:mock-e2e`。  
Admin：`pnpm --filter @huajian/admin dev|build|preview`。

冒烟：

```bash
pnpm test:mock-e2e
curl -sS http://127.0.0.1:8080/health
```

---

## 3. 环境变量（运行时注入）

| 变量 | 容器建议 | 说明 |
| --- | --- | --- |
| `APP_ENV` | `production` | |
| `APP_URL` | 公网 HTTPS 基址 | 回调 URL 依赖 |
| `APP_SECRET` | 强随机 | **勿写入镜像** |
| `HOST` / `PORT` | `0.0.0.0` / `8080` | |
| `DB_DRIVER` | `sqlite` | 当前唯一实现 |
| `DB_DSN` | `/data/huajian_pay.db` | 与 volume 对齐 |
| `CHANNEL_MODE` | `alipay` / `wxpay` | 生产勿长期 `mock` |
| `ADMIN_*` / `PLATFORM_*` | 强密码 | 运行时注入 |
| `ALIPAY_*` / `WECHAT_*` | 按需 | 运行时注入 |

完整生产模板见 **`.env.production.example`**。  
**禁止**把 `.env`、私钥、`*.pem` 打进镜像（见 `.dockerignore`）。

---

## 4. Docker 多阶段 + Compose

相关文件：

| 文件 | 作用 |
| --- | --- |
| `Dockerfile` | deps → build(server+admin) → `pnpm deploy --prod` → runtime(API) + `/app/admin-dist` |
| `.dockerignore` | 排除 `.env`、`node_modules`、`data`、大体积 docs 等 |
| `docker-compose.yml` | `api`；profile **`web`**：`admin-dist-init` + `admin-static` |
| `deploy/nginx-compose.conf` | 容器内 Nginx：SPA + 反代 API |
| `deploy/nginx-host.conf` | **主机** HTTPS 终止样例（上游 `127.0.0.1:8088`） |
| `deploy/nginx-admin.conf` | 与 compose 配置等价的兼容别名 |
| `.env.production.example` | 生产 env 模板 |

### 4.1 构建镜像

```bash
docker build -t huajian-pay-api:local .
# 或
docker compose build
```

### 4.2 仅 API（默认）

```bash
cp .env.production.example .env
# 编辑 APP_URL / APP_SECRET / ADMIN_PASSWORD / PLATFORM_KEY / 渠道密钥

docker compose up -d --build
curl -sS http://127.0.0.1:8080/health
```

- 数据卷：`huajian_pay_data` → 容器 `/data`，`DB_DSN=/data/huajian_pay.db`
- API 默认绑定 **`127.0.0.1:8080`**（`API_HOST_BIND` / `API_HOST_PORT` 可改）
- 停止：`docker compose down`（volume 默认保留）

### 4.3 API + Admin（profile `web`）

```bash
docker compose --profile web up -d --build
# Admin + 同域反代：http://SERVER_IP:8088/
# /admin/api、/health、支付回调路径 → api:8080
```

流程：

1. 构建镜像时把 Admin `dist` 拷入 **`/app/admin-dist`**
2. 一次性任务 `admin-dist-init` 同步到 named volume `huajian_pay_admin_dist`
3. `admin-static`（nginx）挂载该 volume + `deploy/nginx-compose.conf`
4. 默认暴露 **`0.0.0.0:8088`**（`ADMIN_HOST_BIND` / `ADMIN_HOST_PORT`）

生产推荐：主机 Nginx/Caddy 终止 TLS，反代到 `127.0.0.1:8088`（见 §5）。  
CDN 方案仍可用：只跑 `api`，Admin 静态单独发布。

---

## 5. 反向代理（TLS 终止）

```nginx
# 推荐：HTTPS 终止后反代 Compose web 入口
location / {
  proxy_pass http://127.0.0.1:8088;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

完整示例：`deploy/nginx-host.conf`。  
`APP_URL` 与支付 notify/return **必须**为公网 HTTPS。

---

## 6. MySQL（明确未实现）

- 驱动与迁移未交付。
- **禁止**在运维文档中写「已支持 MySQL」。
- 未来若实现：需驱动、迁移、健康检查与 CI，再更新本节与 Compose。

---

## 7. 运维清单

- [ ] 密钥仅运行时注入；镜像无 `.env`
- [ ] SQLite volume 已挂载且可备份
- [ ] `GET /health` 探针
- [ ] `CHANNEL_MODE` 与渠道密钥齐备
- [ ] Admin：`docker compose --profile web` 或 CDN/主机 dist
- [ ] 主机防火墙：仅 80/443 对外；8080 尽量本机
- [ ] RC 前 `pnpm test:mock-e2e` 或等价冒烟

---

## 8. 无 Docker CLI 的等价冒烟（本机已验证路径）

```bash
# 等价：build server+admin → pnpm deploy --prod → node dist/index.js + /health
node scripts/docker-smoke-local.mjs
# 或
pnpm test:docker-smoke
```

脚本会：

1. `pnpm --filter @huajian/server build`
2. `pnpm --filter @huajian/admin build`
3. `pnpm --filter @huajian/server deploy --prod .tmp/docker-smoke/server`
4. 检查 `dist/index.js` 与生产依赖
5. 临时 `DB_DSN` + `PORT=18080` 启动并 `GET /health`
6. 结束后杀掉进程（`.tmp/` 已 gitignore）

### 静态审计摘要

| 项 | 结论 |
| --- | --- |
| Dockerfile 多阶段 | deps → build → `pnpm deploy --prod /out/server` → runtime |
| 运行入口 | `CMD ["node","dist/index.js"]`，与 deploy 布局一致 |
| 非 root | `USER huajian`（uid 10001）；`/data` chown |
| SQLite volume | `VOLUME ["/data"]` + compose named volume |
| 密钥 | `.dockerignore` 排除；compose 运行时 env |
| Admin | 镜像内 `/app/admin-dist`；profile **`web`** 同步 volume + nginx |
| MySQL | **未实现**；compose 无 mysql 服务 |

---

## 9. 文档历史

| 日期 | 变更 |
| --- | --- |
| 2026-07-25 | 首次对齐端口 8080、E2E、Docker/MySQL 现状 |
| 2026-07-25 | 落地 Dockerfile / compose（SQLite volume）；Admin 侧车 |
| 2026-07-25 | `scripts/docker-smoke-local.mjs` 无 Docker 等价冒烟 |
| 2026-07-25 | **生产 Compose：** profile 统一为 `web`（8088）；`pnpm deploy` 布局；`nginx-compose` / `nginx-host` / `.env.production.example` |
