# 花间支付（HuaJian_Pay）

面向 **newapi / 类易支付** 场景的自建支付中台：商户下单 → 通道收款 → 异步通知 → 管理后台。

| 项 | 当前事实 |
| --- | --- |
| 版本标签 | **`v0.6.0`** — 微信支付 APIv3 Native、管理界面与安全回归 |
| 仓库 | monorepo：`apps/server`（Fastify API）+ `apps/admin`（Vue 3 Admin） |
| 包管理 | **pnpm**（见 `pnpm-workspace.yaml`） |
| 默认端口 | **`8080`**（`HOST`/`PORT`，见 `.env.example`） |
| 数据库 | **仅 SQLite 已实现**；MySQL 仅为 `.env.example` 注释模板，**不可宣称已支持** |
| 收款通道 | `mock` / **支付宝 RSA2** / **微信 APIv3 Native**（正式商户） |
| 明确不做 | 个人支付宝/微信收款码监控、挂机扫码、「只填账号即可官方到账」 |

更细的架构、接口与运维见 `docs/`；本 README 是**上手与配置总入口**。

---

## 目录

1. [功能与实现状态](#1-功能与实现状态)
2. [仓库结构](#2-仓库结构)
3. [环境要求](#3-环境要求)
4. [快速开始（Mock）](#4-快速开始mock)
5. [常用命令](#5-常用命令)
6. [环境变量详解](#6-环境变量详解)
7. [通道配置教程](#7-通道配置教程)
8. [newapi / 易支付接入](#8-newapi--易支付接入)
9. [管理后台 Admin](#9-管理后台-admin)
10. [Docker 与 HTTPS](#10-docker-与-https)
11. [安全要点](#11-安全要点)
12. [排障](#12-排障)
13. [文档索引](#13-文档索引)

---

## 1. 功能与实现状态

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| YiPay 风格商户 API | ✅ | `/submit.php`、`/mapi.php`、`/api.php` |
| 公共支付页 | ✅ | `/pay/:tradeNo` + 状态轮询 |
| 公开订单状态 | ✅ | `GET /api/v1/public/orders/:tradeNo/status` |
| Mock 通道 | ✅ | `CHANNEL_MODE=mock`，本地/E2E |
| 支付宝 | ✅ | RSA2 验签通知 `POST /channels/alipay/notify` |
| 微信支付 | ✅ | APIv3 Native；`POST /channels/wxpay/notify` |
| Admin API | ✅ | `/admin/api/*`（登录、订单、商户、通道配置、重发通知等） |
| Admin SPA | ✅ | `apps/admin`；**API 进程不托管静态资源** |
| Docker 多阶段 | ✅ 骨架 | 根目录 `Dockerfile` + `docker-compose.yml`（SQLite volume） |
| MySQL | ❌ | **未实现** |
| 个人码收款 | ❌ | **永不作为产品能力** |

根路径 `GET /` 会列出主要入口：`health`、classic API、public、channels、admin。

---

## 2. 仓库结构

```text
HuaJian_Pay/
├── AGENTS.md                 # 协作与目录规则
├── README.md                 # 本文件
├── package.json              # 根脚本：dev/build/start/typecheck/test:*
├── pnpm-workspace.yaml
├── .env.example              # 环境变量模板（无真实密钥）
├── Dockerfile                # 多阶段 API 镜像
├── docker-compose.yml        # API + SQLite volume；可选 admin-ui
├── deploy/nginx-admin.conf   # Admin SPA + /admin/api 反代
├── apps/
│   ├── server/               # @huajian/server — Fastify 支付后端
│   └── admin/                # @huajian/admin — Vue 管理台
├── docs/                     # 架构/API/部署/微信/安全/newapi 等
├── scripts/                  # mock-e2e、docker-smoke-local 等
└── data/                     # 本地 SQLite（内容 gitignore）
```

完整地图：`docs/structure.md`。

---

## 3. 环境要求

- **Node.js** 20+（Docker 镜像默认 Node 20）
- **pnpm** 9.x（仓库脚本与 lockfile 按 pnpm 设计）
- 可选：**Docker / Compose**（本机无 Docker 时可用 `pnpm test:docker-smoke` 做 deploy 等价冒烟）
- 生产回调域名：**公网 HTTPS**（支付宝/微信正式环境）

---

## 4. 快速开始（Mock）

适合本地开发与自动化测试，**不调用**支付宝/微信真实网关。

```bash
# 1. 克隆后进入仓库
cd HuaJian_Pay

# 2. 环境文件
cp .env.example .env
# 至少修改：APP_SECRET、ADMIN_PASSWORD、PLATFORM_KEY
# 确认：PORT=8080、CHANNEL_MODE=mock、DB_DRIVER=sqlite

# 3. 安装依赖
pnpm install

# 4. 开发热更（仅 server）
pnpm dev

# 或生产构建启动
pnpm build
pnpm start
```

健康检查：

```bash
curl -sS http://127.0.0.1:8080/health
```

一键 Mock E2E（脚本会自启服务、跑流程、清理）：

```bash
pnpm test:mock-e2e
```

默认引导商户（可在 `.env` 改）：

| 项 | 默认示例 |
| --- | --- |
| 商户 PID | `PLATFORM_PID=1000` |
| 商户 KEY | `PLATFORM_KEY=change-me-merchant-key` |
| 管理员 | `ADMIN_USERNAME` / `ADMIN_PASSWORD` |

---

## 5. 常用命令

均以**仓库根目录**执行（与根 `package.json` 一致）：

| 命令 | 作用 |
| --- | --- |
| `pnpm install` | 安装 monorepo 依赖 |
| `pnpm dev` | 开发模式启动 `@huajian/server` |
| `pnpm build` | 构建 server |
| `pnpm start` | 运行 server 构建产物 |
| `pnpm typecheck` | server TypeScript 检查 |
| `pnpm test:mock-e2e` | Mock 端到端 |
| `pnpm test:docker-smoke` | 无 Docker 时的 deploy 布局 + `/health` 冒烟 |
| `pnpm --filter @huajian/admin dev` | Admin 开发服务器 |
| `pnpm --filter @huajian/admin build` | 构建 Admin 静态资源 → `apps/admin/dist` |
| `pnpm --filter @huajian/admin preview` | 预览 Admin 构建结果 |

---

## 6. 环境变量详解

权威模板：**`.env.example`**。复制为 `.env` 后填写；**永远不要提交真实密钥**。

### 6.1 应用与监听

| 变量 | 说明 |
| --- | --- |
| `APP_NAME` | 应用名 |
| `APP_ENV` | `local` / `production` 等 |
| `APP_URL` | 对外基址（生成回调、支付页链接时使用） |
| `APP_SECRET` | 平台密钥材料（Admin 会话等依赖）；生产用强随机 |
| `HOST` / `PORT` | 默认 `0.0.0.0` / **`8080`** |

### 6.2 通道模式

| 变量 | 取值 | 说明 |
| --- | --- | --- |
| `CHANNEL_MODE` | `mock` \| `alipay` \| `wxpay` | 影响默认通道行为；商户下单仍带 `type=alipay` 或 `type=wxpay` |

### 6.3 数据库（仅 SQLite 可用）

| 变量 | 说明 |
| --- | --- |
| `DB_DRIVER` | 必须为 **`sqlite`**（当前实现） |
| `DB_DSN` | 如 `./data/huajian_pay.db`；容器内建议 `/data/huajian_pay.db` |

`.env.example` 中的 `MYSQL_*` **仅为未来占位，代码未实现**。

### 6.4 管理员与平台商户

| 变量 | 说明 |
| --- | --- |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | 后台登录；空库 seed 默认 `admin` / `12345678`（生产务必修改；已有库不自动改密） |
| `PLATFORM_PID` / `PLATFORM_KEY` | 默认易支付商户号与密钥（给 newapi 用） |

### 6.5 支付宝（`CHANNEL_MODE=alipay` 或下单 type=alipay）

| 变量 | 说明 |
| --- | --- |
| `ALIPAY_APP_ID` | 应用 APPID |
| `ALIPAY_PRIVATE_KEY` | 应用私钥 PEM |
| `ALIPAY_PUBLIC_KEY` | 支付宝公钥 PEM |
| `ALIPAY_NOTIFY_URL` | 可选覆盖；默认指向本平台支付宝通知路径 |
| `ALIPAY_RETURN_URL` | 同步跳转（若使用） |
| `ALIPAY_ACCOUNT` | 展示/备注用，**不是**个人码收款凭据 |

通知路径：**`POST /channels/alipay/notify`**（RSA2 验签 + 金额校验 + 幂等）。

也可在 Admin：`GET/PUT /admin/api/channels/alipay`（**GET 不回显密钥**；PUT 空字符串保留原密钥）。

### 6.6 微信 APIv3 Native（正式商户）

| 变量 | 说明 |
| --- | --- |
| `WECHAT_MCH_ID` | 商户号 |
| `WECHAT_APP_ID` | 关联 AppID |
| `WECHAT_APIV3_KEY` | APIv3 密钥（亦接受别名 `WECHAT_API_V3_KEY`） |
| `WECHAT_SERIAL_NO` | 商户 API 证书序列号 |
| `WECHAT_PRIVATE_KEY` | 商户 API 私钥 PEM |
| `WECHAT_PLATFORM_PUBLIC_KEY` | 平台公钥 PEM（回调验签） |
| `WECHAT_NOTIFY_URL` | 可选；默认 **`{APP_URL}/channels/wxpay/notify`** |
| `WECHAT_CERT_PATH` / `WECHAT_KEY_PATH` | 可选文件路径（部署挂载用） |

通知路径：**`POST /channels/wxpay/notify`**。

Admin：`GET/PUT /admin/api/channels/wxpay`；UI 路由 **`/channels/wxpay`**。  
完整证书、HTTPS、轮换与真实验收：**`docs/wechat-pay.md`**。

> **必须**微信商户平台正式商户 + APIv3 证书。  
> **禁止**把个人收款码监控说成官方通道。

---

## 7. 通道配置教程

### 7.1 Mock（本地）

1. `.env` 中 `CHANNEL_MODE=mock`
2. `pnpm dev` 或 `pnpm test:mock-e2e`
3. 无需支付宝/微信密钥

### 7.2 支付宝 RSA2

1. 开放平台创建应用，配置接口加签方式 **RSA2**
2. 配置应用公钥，保存支付宝公钥
3. 将应用私钥、支付宝公钥、APPID 写入 `.env` 的 `ALIPAY_*`，或 Admin → 支付宝通道
4. 支付宝应用网关通知 URL 设为：  
   `https://<你的域名>/channels/alipay/notify`
5. `APP_URL` 与公网 HTTPS 域名一致
6. 下单时 `type=alipay`；生产勿长期 `CHANNEL_MODE=mock`

### 7.3 微信 APIv3 Native

1. 开通微信商户、Native 产品权限，绑定 AppID
2. 设置 APIv3 密钥，下载商户 API 证书，记录序列号，配置平台公钥
3. 填入 `WECHAT_*` 或 Admin → **微信通道**（`/channels/wxpay`）
4. 支付通知 URL：  
   `https://<你的域名>/channels/wxpay/notify`（必须 HTTPS）
5. 反向代理须透传 **原始 body** 与 `Wechatpay-*` 头
6. newapi / 商户下单使用 **`type=wxpay`**（不是 `wechat`）
7. 扫码支付后订单应置 `paid`，并通知商户 `notify_url`

步骤细节与排障表见 **`docs/wechat-pay.md`**。

---

## 8. newapi / 易支付接入

详细字段表：**`docs/newapi-integration.md`**。

### 8.1 在 newapi 中填写

| newapi 配置 | 值 |
| --- | --- |
| 易支付接口地址 | `https://<HuaJian_Pay 公网域名>/`（即 `APP_URL`） |
| 商户 ID (PID) | `PLATFORM_PID` 或 Admin 中的商户 pid |
| 商户密钥 (KEY) | 对应商户 key |
| 支付方式 | `alipay` 或 **`wxpay`** |
| 签名 | **MD5**（`sign_type=MD5`） |

### 8.2 本平台入口

| 路径 | 用途 |
| --- | --- |
| `POST /mapi.php` | API 下单（JSON/表单，视客户端） |
| `POST /submit.php` | 页面跳转类下单 |
| `GET/POST /api.php` | 查单等经典接口 |
| `/pay/:tradeNo` | 用户扫码/打开的支付页 |
| 商户异步通知 | 平台 → 你的 `notify_url`（YiPay 字段；成功 `trade_status=TRADE_SUCCESS`） |

签名规则：除 `sign`/`sign_type` 外非空参数按键名排序拼接 + `key`，MD5 小写 hex。完整说明见 `docs/newapi-integration.md` 与 `docs/api.md`。

---

## 9. 管理后台 Admin

| 项 | 说明 |
| --- | --- |
| 代码 | `apps/admin`（Vue 3 + Vite + Naive UI） |
| 开发 | `pnpm --filter @huajian/admin dev`（开发代理指向 API，见 admin 的 vite 配置） |
| 构建 | `pnpm --filter @huajian/admin build` → `apps/admin/dist` |
| API 前缀 | **`/admin/api/*`**（Bearer 登录态；细节见安全清单） |

常见能力：登录、仪表盘、订单、商户、支付宝/微信通道配置、订单详情与**手动重发商户通知**等。

**部署注意：** server **不** `static` 托管 Admin。生产用 CDN、独立 nginx，或 Compose profile：

```bash
pnpm --filter @huajian/admin build
docker compose --profile admin-ui up -d
# 默认 Admin 侧车端口见 compose 中 ADMIN_HOST_PORT（常为 8081）
```

`deploy/nginx-admin.conf` 将 `/admin/api/` 反代到 API 容器。

---

## 10. Docker 与 HTTPS

权威说明：**`docs/deployment.md`**。

### 10.1 构建与运行（SQLite volume）

```bash
docker build -t huajian-pay-api:local .
# 或
docker compose build
docker compose up -d
curl -sS http://127.0.0.1:8080/health
```

- 数据卷：`huajian_pay_data` → 容器 `/data`，`DB_DSN=/data/huajian_pay.db`
- 密钥、`.env`、`*.pem`：**运行时注入**，勿打进镜像（`.dockerignore` 已排除）

### 10.2 无 Docker CLI 时

```bash
pnpm test:docker-smoke
# 等价：build → pnpm deploy --prod → 临时端口启动 → GET /health
```

### 10.3 HTTPS / 反代

- TLS 在 Nginx/Caddy/云 LB 终止
- `APP_URL` 使用 `https://` 公网域名
- 支付宝/微信 notify 必须可达
- 微信回调：**原始 body** + `Wechatpay-Signature` 等头不可丢

示例（仅 API）：

```nginx
location / {
  proxy_pass http://127.0.0.1:8080;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Real-IP $remote_addr;
}
```

---

## 11. 安全要点

完整清单：**`docs/security-checklist.md`**。

- 所有密钥仅运行时配置；禁止提交 `.env`、私钥、APIv3 Key
- Admin 通道 GET **不回显**支付宝/微信秘密字段；PUT **空值保留**
- 生产关闭长期 `CHANNEL_MODE=mock`
- 校验通知金额、商户号、订单号；依赖幂等避免重复入账
- 日志禁止打印完整 PEM / Authorization / APIv3 Key
- SQLite 文件权限与备份；容器使用非 root 运行时用户（见 Dockerfile）

---

## 12. 排障

| 现象 | 排查 |
| --- | --- |
| 端口连不上 | 是否 `PORT=8080`、进程是否 `pnpm start`/`dev`、防火墙 |
| E2E 失败 | 先 `pnpm test:mock-e2e`；确认无其它进程占用 8080 |
| 支付宝不回调 | 公网 HTTPS、`/channels/alipay/notify`、公钥是否匹配、RSA2 |
| 微信验签失败 | raw body 是否被改写、时钟、序列号、平台公钥、通知 URL 是否为 **`/channels/wxpay/notify`** |
| 微信配置不全 | 缺 mch_id/app_id/key/私钥/序列号/平台公钥时下单会失败 |
| Admin 调不通 API | 开发代理/生产反代是否指向 server；CORS/路径是否 `/admin/api` |
| Docker 无命令 | 本机未装 Docker 时用 `pnpm test:docker-smoke`；勿虚构已测 `docker build` |
| 误以为支持 MySQL | **未实现**；请继续使用 SQLite |

---

## 13. 文档索引

| 文档 | 内容 |
| --- | --- |
| `AGENTS.md` | 团队协作、Git、目录纪律 |
| `docs/structure.md` | 目录地图 |
| `docs/architecture.md` | 系统架构 |
| `docs/api.md` | 商户/通道/Admin API 草图与约定 |
| `docs/newapi-integration.md` | newapi 对接步骤与签名 |
| `docs/wechat-pay.md` | 微信 APIv3 证书、notify、验收 |
| `docs/deployment.md` | 部署、Compose、无 Docker 冒烟 |
| `docs/security-checklist.md` | 威胁模型与上线清单 |
| `docs/ux/` | 流程、信息架构、视觉与支付页说明 |
| `docs/planning/` | 任务/结论/进度（过程文档） |
| docs/guides/alipay-channel-setup.md | 支付宝通道图文配置教程（MD） |
| docs/guides/HuaJian_Pay-支付宝通道配置教程.docx | 同上 Word 版（含嵌入图） |
| docs/assets/alipay-channel/ | 支付宝教程统一图片目录 |

---

## 许可证

Private / 由仓库所有者决定。

---

**版本说明：** 本文档对照根 `package.json`、`.env.example`、`apps/server` 路由与 env、`docs/*` 及标签 **`v0.6.0`** 编写；通道实现以已合入代码为准，不包含个人码与 MySQL 能力描述。
