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

## 6. 启动后端 API（Docker Compose）

### 6.1 构建并启动

```bash
cd /opt/HuaJian_Pay
docker compose up -d --build
```

### 6.2 健康检查

```bash
curl -sS http://127.0.0.1:8080/health
```

期望：

```json
{"ok":true}
```

### 6.3 常用运维

```bash
docker compose ps
docker compose logs -f api
docker compose restart api
docker compose down
```

数据卷默认：

```text
huajian_pay_data → 容器 /data
DB_DSN=/data/huajian_pay.db
```

---

## 7. 构建 Admin 前端

API **不会**自动托管 Admin 页面，需要单独构建静态资源：

```bash
# 服务器需 Node.js 20+ 与 pnpm
# 若没有 pnpm：
# npm i -g pnpm

cd /opt/HuaJian_Pay
pnpm install
pnpm --filter @huajian/admin build
```

产物目录：

```text
/opt/HuaJian_Pay/apps/admin/dist
```

可选 Compose 侧车（本机 8081 预览）：

```bash
docker compose --profile admin-ui up -d
# http://服务器IP:8081
```

生产仍建议用 **Nginx + 域名 HTTPS**，不要长期用 IP:8081。

---

## 8. Nginx + HTTPS（核心）

### 8.1 站点配置示例

新建：

```bash
sudo nano /etc/nginx/sites-available/huajian-pay.conf
```

内容（把域名和路径换成你的）：

```nginx
server {
  listen 80;
  server_name pay.example.com;

  # 先用于申请证书；证书申请后可由 certbot 自动改写为 443
  location / {
    return 301 https://$host$request_uri;
  }
}

server {
  listen 443 ssl http2;
  server_name pay.example.com;

  # certbot 会写入证书路径；也可手写
  # ssl_certificate     /etc/letsencrypt/live/pay.example.com/fullchain.pem;
  # ssl_certificate_key /etc/letsencrypt/live/pay.example.com/privkey.pem;

  root /opt/HuaJian_Pay/apps/admin/dist;
  index index.html;

  client_max_body_size 10m;

  # Admin API
  location /admin/api/ {
    proxy_pass http://127.0.0.1:8080/admin/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # 易支付兼容入口
  location ~ ^/(submit\.php|mapi\.php|api\.php)$ {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # 支付页 / 通道回调 / 健康检查
  location ~ ^/(channels|pay|health)(/|$) {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # 微信回调需要原始 body；不要做会改写 body 的缓冲插件
    proxy_request_buffering on;
  }

  # Admin SPA
  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

启用：

```bash
sudo ln -sf /etc/nginx/sites-available/huajian-pay.conf /etc/nginx/sites-enabled/huajian-pay.conf
sudo nginx -t
sudo systemctl reload nginx
```

### 8.2 申请 HTTPS 证书

```bash
sudo certbot --nginx -d pay.example.com
```

成功后访问：

```bash
curl -sS https://pay.example.com/health
```

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
