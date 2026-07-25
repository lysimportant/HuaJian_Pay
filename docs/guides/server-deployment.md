# 花间支付 · 服务器部署教程

> **适用前提：** 你已经有 Linux 服务器和公网域名。  
> **推荐方案：** Docker Compose 部署 API + Nginx 托管 Admin + HTTPS。  
> **Word 文档：** [`HuaJian_Pay-服务器部署教程.docx`](./HuaJian_Pay-服务器部署教程.docx)  
> **示意图目录：** [`docs/assets/server-deploy/`](../assets/server-deploy/)
>
> **相关链接：**
> - [HuaJian_Pay GitHub](https://github.com/lysimportant/HuaJian_Pay)
> - [部署说明 deployment.md](../deployment.md)
> - [支付宝密钥获取教程](./alipay-keys-setup.md)
> - [支付宝通道配置教程](./alipay-channel-setup.md)

---

## 1. 你要部署什么

本项目生产只需要 **2 个对外能力**：

| 组件 | 作用 | 怎么跑 |
| --- | --- | --- |
| 后端 API | 易支付接口、支付页、支付宝/微信回调、Admin API | Docker 容器 `8080` |
| Admin 前端 | 管理后台页面 | 构建静态文件，由 Nginx 托管 |
| SQLite | 订单/商户/配置数据 | 容器数据卷，无需单独装数据库 |
| 通知重试 | 商户异步通知 | 内嵌后端，无需单独 Worker |

**不要**把 `8080` 直接暴露公网。  
**必须**用域名 + HTTPS，支付宝正式回调才稳定。

---

## 2. 推荐架构

```text
用户 / newapi / 支付宝
        │
        ▼
 https://pay.你的域名.com
        │
        ▼
      Nginx（TLS 终止）
   ┌────┴────┐
   │         │
 Admin静态   反代 API
 dist/       127.0.0.1:8080
             │
             ▼
      Docker: HuaJian API
             │
             ▼
      SQLite volume /data
```

### 关键公网 URL

把下面的 `pay.example.com` 换成你的真实域名：

| 用途 | URL |
| --- | --- |
| Admin | `https://pay.example.com/` |
| 健康检查 | `https://pay.example.com/health` |
| 支付宝回调 | `https://pay.example.com/channels/alipay/notify` |
| 微信回调 | `https://pay.example.com/channels/wxpay/notify` |
| newapi 网关 | `https://pay.example.com/` |

---

## 3. 部署前检查

### 3.1 服务器建议

- 系统：Ubuntu 22.04 / 24.04（推荐）
- 配置：2 核 4G 起步
- 开放端口：`80`、`443`
- 已解析域名 A 记录到服务器公网 IP

### 3.2 需要安装

```bash
# Ubuntu 示例
sudo apt update
sudo apt install -y ca-certificates curl git nginx

# Docker 官方安装文档：
# https://docs.docker.com/engine/install/ubuntu/
# 装完后确认：
docker --version
docker compose version
```

证书可用：

```bash
sudo apt install -y certbot python3-certbot-nginx
```

或宝塔面板一键 SSL。

---

## 4. 拉代码

```bash
sudo mkdir -p /opt
cd /opt
sudo git clone https://github.com/lysimportant/HuaJian_Pay.git
cd HuaJian_Pay
```

后续所有命令默认在：

```text
/opt/HuaJian_Pay
```

---

## 5. 写生产 `.env`

```bash
cp .env.example .env
nano .env   # 或 vim / 面板编辑
```

### 必改项（示例）

```env
APP_ENV=production
APP_URL=https://pay.example.com
APP_SECRET=请换成超长随机串
HOST=0.0.0.0
PORT=8080

CHANNEL_MODE=alipay

DB_DRIVER=sqlite
DB_DSN=/data/huajian_pay.db

ADMIN_USERNAME=admin
ADMIN_PASSWORD=请换成强密码

PLATFORM_PID=1000
PLATFORM_KEY=请换成商户强密钥

ALIPAY_APP_ID=你的APPID
ALIPAY_PRIVATE_KEY=你的应用私钥完整内容
ALIPAY_PUBLIC_KEY=支付宝公钥完整内容
ALIPAY_NOTIFY_URL=https://pay.example.com/channels/alipay/notify
ALIPAY_RETURN_URL=https://pay.example.com/
```

### 安全要求

- `.env` **禁止提交 Git**
- 权限收紧：

```bash
chmod 600 .env
```

- 真实私钥只放服务器
- 首次登录后立刻改 Admin 密码

如何获取应用私钥 / 支付宝公钥，见：

- [支付宝密钥获取教程](./alipay-keys-setup.md)
- Word：`HuaJian_Pay-支付宝密钥获取教程.docx`

---

## 6. 一键启动 Docker Compose（推荐）

### 6.1 写环境变量

```bash
cd /opt/HuaJian_Pay
cp .env.production.example .env   # 生产推荐模板（含端口绑定变量）
# 也可：cp .env.example .env
nano .env
chmod 600 .env
```

必改项：`APP_URL`（`https://你的域名`）、`APP_SECRET`、`ADMIN_PASSWORD`、`PLATFORM_KEY`，以及支付宝/微信密钥。生产请将 `CHANNEL_MODE` 设为 `alipay` 或 `wxpay`，不要长期使用 `mock`。

### 6.2 启动 API + Admin Web

```bash
docker compose --profile web up -d --build
```

这会启动：

| 容器 | 端口 | 作用 |
| --- | --- | --- |
| `huajian-pay-api` | `127.0.0.1:8080` | 支付后端（仅本机） |
| `huajian-pay-admin` | `0.0.0.0:8088` | Admin + 反代支付/回调 |
| `huajian-pay-admin-dist-init` | — | 同步 Admin 静态资源（一次性） |

### 6.3 健康检查

```bash
curl -sS http://127.0.0.1:8080/health
curl -sS http://127.0.0.1:8088/health
```

期望：

```json
{"ok":true}
```

浏览器先访问：

```text
http://服务器IP:8088/
```

### 6.4 常用运维

```bash
docker compose --profile web ps
docker compose logs -f api
docker compose logs -f admin-static
docker compose --profile web restart
docker compose --profile web down
```

数据卷：

```text
huajian_pay_data  → /data/huajian_pay.db
huajian_pay_admin_dist → Admin 静态文件
```

### 6.5 仅启动 API（不要 Admin 容器）

```bash
docker compose up -d --build
```

---

## 7. 域名 HTTPS（生产必须）

Compose 的 `8088` 是 HTTP 入口。生产请用宿主机 Nginx/宝塔把域名 443 反代到 `127.0.0.1:8088`。

参考文件：

```text
deploy/nginx-host.conf
deploy/nginx-compose.conf
```

### 7.1 宿主机反代示例

```nginx
server {
  listen 80;
  server_name pay.example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name pay.example.com;

  # ssl_certificate     /etc/letsencrypt/live/pay.example.com/fullchain.pem;
  # ssl_certificate_key /etc/letsencrypt/live/pay.example.com/privkey.pem;

  location / {
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_pass http://127.0.0.1:8088;
  }
}
```

### 7.2 申请证书

```bash
sudo certbot --nginx -d pay.example.com
curl -sS https://pay.example.com/health
```

> 若你更习惯宝塔：网站反代目标填 `http://127.0.0.1:8088`，再开强制 HTTPS。

---

## 9. 配置支付宝与 newapi

### 9.1 支付宝

1. 开放平台填好应用公钥，拿到支付宝公钥  
2. 回调地址设为：

```text
https://pay.example.com/channels/alipay/notify
```

3. HuaJian_Pay `.env` 或 Admin → 支付宝通道 填好：
   - App ID
   - 应用私钥
   - 支付宝公钥
4. `CHANNEL_MODE=alipay`
5. `APP_URL=https://pay.example.com`

### 9.2 newapi

| newapi 配置 | 值 |
| --- | --- |
| 易支付接口地址 | `https://pay.example.com/` |
| 商户 ID (PID) | `PLATFORM_PID` 或 Admin 商户 pid |
| 商户密钥 (KEY) | 对应商户 key |
| 支付方式 | `alipay` 或 `wxpay` |
| 签名 | MD5 |

---

## 10. 上线验收清单

### 基础

- [ ] 域名已解析到服务器
- [ ] HTTPS 有效
- [ ] `https://域名/health` 返回 `{"ok":true}`
- [ ] Admin 可打开
- [ ] Admin 可用强密码登录

### 支付

- [ ] 应用私钥 / 支付宝公钥已配置
- [ ] 支付宝回调 URL 可公网访问
- [ ] 真实小额支付成功
- [ ] 订单状态变为 `paid`
- [ ] 商户 `notify_url` 返回 `success`

### 安全

- [ ] `.env` 权限 `600`
- [ ] `8080` 不对公网开放
- [ ] 默认密码已更换
- [ ] 真实密钥未提交 Git

---

## 11. 备份与更新

### 备份

最重要：

```text
SQLite 数据库文件（volume 内 /data/huajian_pay.db）
```

示例导出：

```bash
docker compose exec api ls -l /data
# 按你的 volume 备份策略，把 huajian_pay.db 定期拷到对象存储/另一台机器
```

### 更新

```bash
cd /opt/HuaJian_Pay
git pull
docker compose up -d --build
pnpm install
pnpm --filter @huajian/admin build
sudo nginx -t && sudo systemctl reload nginx
curl -sS https://pay.example.com/health
```

---

## 12. 常见问题

| 现象 | 处理 |
| --- | --- |
| `/health` 不通 | 容器是否启动；Nginx 是否反代；防火墙是否放行 80/443 |
| Admin 打开空白 | `apps/admin/dist` 是否构建；Nginx root 是否指向 dist |
| Admin 登录失败 | `/admin/api` 是否反代到 8080；密码是否正确 |
| 支付宝不回调 | 是否 HTTPS；回调路径是否 `/channels/alipay/notify`；公钥是否匹配 |
| 保存报私钥/公钥未配置 | 见密钥教程，填完整 PEM，不要把应用公钥填成支付宝公钥 |
| 以为要装 MySQL | **当前未实现 MySQL**，继续用 SQLite |

---

## 13. 推荐落地顺序（给你）

因为你已经有服务器和域名，按这个做：

1. 域名 A 记录指向服务器  
2. 安装 Docker / Compose / Nginx / Certbot  
3. `git clone` 项目  
4. 写生产 `.env`  
5. `docker compose up -d --build`  
6. 构建 Admin `dist`  
7. 配置 Nginx + 申请 HTTPS  
8. 配支付宝密钥与回调  
9. 小额真实支付验收  
10. 把 newapi 指到你的域名  

---

## 14. 文档与下载

| 文件 | 说明 |
| --- | --- |
| 本 Markdown | `docs/guides/server-deployment.md` |
| Word 教程 | `docs/guides/HuaJian_Pay-服务器部署教程.docx` |
| 示意图 | `docs/assets/server-deploy/` |
| 运维总览 | `docs/deployment.md` |
| 支付宝密钥 | `docs/guides/alipay-keys-setup.md` |
