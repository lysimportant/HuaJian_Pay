# HuaJian_Pay — 部署与运维

> **权威来源：** 根目录 `package.json`、`.env.example`、`Dockerfile`、`docker-compose.yml`。  
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
| Alipay 环境位 | ✅ 部分 | `CHANNEL_MODE=alipay` + 密钥 |
| WeChat APIv3 Native | ✅ 核心已合入（`5e7740c`） | `CHANNEL_MODE=wxpay`；回调 **`POST /channels/wxpay/notify`**；Admin `GET/PUT /admin/api/channels/wxpay`；证书/验收见 `docs/wechat-pay.md` |
| Docker 多阶段镜像 | ✅ 骨架 | 根目录 `Dockerfile` + `.dockerignore` |
| Compose（SQLite volume） | ✅ 骨架 | `docker-compose.yml` |
| MySQL | ❌ 未实现 | 仅 `.env.example` 注释模板 |
| Admin 与 API 同端口静态托管 | ❌ 未实现 | 见 §5 双路径方案 |

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
| `CHANNEL_MODE` | `mock` 或 `alipay` | 生产勿长期 mock |
| `ADMIN_*` / `PLATFORM_*` | 强密码 | 运行时注入 |
| `ALIPAY_*` | 按需 | 运行时注入 |

**禁止**把 `.env`、私钥、`*.pem` 打进镜像（见 `.dockerignore`）。

---

## 4. Docker 多阶段构建（API）

文件：

- `Dockerfile` — deps → build(server+admin) → runtime(API)
- `.dockerignore` — 排除 `.env`、`node_modules`、`data`、docs 等
- `docker-compose.yml` — `api` + 可选 `admin-static`（profile `admin-ui`）
- `deploy/nginx-admin.conf` — Admin SPA + `/admin/api` 反代

### 4.1 构建镜像

```bash
docker build -t huajian-pay-api:local .
# 或
docker compose build
```

### 4.2 运行（SQLite volume）

```bash
# 至少设置强密钥（示例）
export APP_SECRET='replace-me'
export ADMIN_PASSWORD='replace-me'
export PLATFORM_KEY='replace-me'
export APP_URL='https://pay.example.com'

docker compose up -d
curl -sS http://127.0.0.1:8080/health
```

数据卷：`huajian_pay_data` → 容器 `/data`，`DB_DSN=/data/huajian_pay.db`。

停止/备份：

```bash
docker compose down
# 备份 named volume 或导出 /data/huajian_pay.db
```

### 4.3 可选 Admin UI sidecar

API **不会** `express.static` 托管 Admin。最小可靠方案：

1. **推荐生产：** 将 `apps/admin/dist` 发布到对象存储/CDN；浏览器 `VITE`/`axios` base 指向公网 API。  
2. **Compose 侧车：** 先 `pnpm --filter @huajian/admin build`，再：

```bash
docker compose --profile admin-ui up -d
# Admin: http://127.0.0.1:8081  （反代 /admin/api → api:8080）
```

镜像内将 Admin 构建产物放在 **`/app/admin-dist`**（API 进程不托管）。默认 compose 侧车挂载的是宿主机 **`./apps/admin/dist`**；也可从镜像 `docker create` + `docker cp` 抽出 `admin-dist`。

---

## 5. 反向代理（TLS 终止）

```nginx
location / {
  proxy_pass http://127.0.0.1:8080;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Real-IP $remote_addr;
}
```

`APP_URL` 与支付 notify/return 必须为公网 HTTPS。

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
- [ ] `CHANNEL_MODE=alipay` 时密钥齐全
- [ ] Admin 若需要：CDN 或 `admin-ui` profile
- [ ] RC 上 `pnpm test:mock-e2e` 或等价冒烟

---

## 8. 无 Docker CLI 的等价冒烟（本机已验证）

当主机没有 `docker` 时，用与 Dockerfile 相同的构建/部署语义验证：

```bash
# 等价：build server+admin → pnpm deploy --prod → node dist/index.js + /health
node scripts/docker-smoke-local.mjs
```

脚本会：

1. `pnpm --filter @huajian/server build`
2. `pnpm --filter @huajian/admin build`
3. `pnpm --filter @huajian/server deploy --prod .tmp/docker-smoke/server`
4. 检查 `dist/index.js` 与生产依赖（fastify / @libsql）
5. 临时 `DB_DSN=.tmp/docker-smoke/data/huajian_pay.db`、`PORT=18080` 启动并 `GET /health`
6. 结束后杀掉进程（`.tmp/` 已 gitignore）

### 静态审计结论（FileManager）

| 项 | 结论 |
| --- | --- |
| Dockerfile 多阶段 | deps → build(server+admin) → `pnpm deploy --prod /out/server` → runtime |
| 运行入口 | `CMD ["node","dist/index.js"]`，与 deploy 布局一致（冒烟已证） |
| 非 root | `USER huajian` (uid 1001)；`/data` chown |
| SQLite volume | `VOLUME ["/data"]` + compose `huajian_pay_data:/data` + `DB_DSN=/data/huajian_pay.db` |
| 密钥 | `.dockerignore` 排除 `.env`/密钥；compose 运行时 env 注入 |
| Admin | 镜像内 `/app/admin-dist`；API **不**托管；compose `admin-ui` 挂载宿主机 `apps/admin/dist` + nginx 反代 `/admin/api` |
| MySQL | **未实现**；compose 无 mysql 服务 |
| 本机 `docker build` | 无 Docker CLI，未执行；以上为等价验证 |

---

## 9. 文档历史

| 日期 | 变更 |
| --- | --- |
| 2026-07-25 | 首次纠正端口 8080、E2E、Docker/MySQL 未实现 |
| 2026-07-25 | 去除不存在的根脚本说明 |
| 2026-07-25 | **FileManager：** 落地 Dockerfile / .dockerignore / compose（SQLite volume）；Admin 侧车；明确 MySQL 未实现 |
| 2026-07-25 | **FileManager：** `scripts/docker-smoke-local.mjs` 无 Docker 等价冒烟通过；静态审计结论入库 |
