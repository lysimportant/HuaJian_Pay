# 花间支付 · 支付宝通道完整配置教程（RSA2）

> **适用版本：** HuaJian_Pay（含标签 **v0.6.0** 及之后主线）  
> **对照源码：** `apps/server` 通道与 env、`apps/admin` 支付宝配置页、`.env.example`、`README.md`、`docs/api.md`  
> **图文资产目录：** [`docs/assets/alipay-channel/`](../assets/alipay-channel/)  
> **Word 高清版：** [`点击下载 HuaJian_Pay-支付宝通道配置教程-高清版.docx`](./HuaJian_Pay-支付宝通道配置教程-高清版.docx)
>
> **官网快捷入口：** [支付宝开放平台官网](https://open.alipay.com/) · [开放平台文档中心](https://opendocs.alipay.com/) · [开放平台控制台](https://open.alipay.com/develop/manage) · [HuaJian_Pay GitHub](https://github.com/lysimportant/HuaJian_Pay)

---

## 0. 阅读前必读（产品边界）

| 可以做 | 不可以做 / 禁止宣称 |
| --- | --- |
| 使用**支付宝开放平台企业/个体应用** + **RSA2** 官方接口收款 | 个人收款码 OCR、挂机扫码监控 |
| 配置 `app_id`、应用私钥、支付宝公钥、HTTPS 异步通知 | 「只填个人支付宝账号即可官方自动到账」 |
| 通过 Admin 或环境变量注入密钥 | 把真实密钥提交进 Git / 写入文档截图 |
| `CHANNEL_MODE=mock` 本地联调 | 生产长期 mock 当真收款 |

本教程描述的是 **官方当面付/扫码类能力（RSA2）** 接入本平台的步骤，不是个人码方案。

---

## 1. 架构总览

![支付宝通道架构流程（原创）](../assets/alipay-channel/01-architecture-flow.png)

**数据流摘要：**

1. newapi / 商户以易支付协议下单：`type=alipay`，MD5 签名 → 本平台 `/mapi.php` 或 `/submit.php`
2. 本平台创建订单，调用支付宝 OpenAPI（真实模式）或 Mock，得到支付串 / 二维码相关 URL
3. 用户打开 `/pay/:tradeNo` 或扫码完成支付
4. 支付宝异步通知 **`POST /channels/alipay/notify`** → RSA2 验签 + 金额校验 + 幂等置 `paid`
5. 本平台再通知商户 `notify_url`（YiPay 字段，MD5）

---

## 2. 字段关系图（开放平台 ↔ 本平台）

![配置字段映射（原创）](../assets/alipay-channel/02-field-mapping.png)

| 支付宝开放平台 / 材料 | 环境变量（`.env`） | Admin 表单字段 | API / DB 键 |
| --- | --- | --- | --- |
| 应用 APPID | `ALIPAY_APP_ID` | App ID | `app_id` |
| 应用私钥 PEM | `ALIPAY_PRIVATE_KEY` | 应用私钥（**GET 不回显**） | `private_key` |
| 支付宝公钥 PEM | `ALIPAY_PUBLIC_KEY` | 支付宝公钥（**GET 不回显**） | `public_key` |
| 异步通知 URL | `ALIPAY_NOTIFY_URL` | 异步通知 URL | `notify_url` |
| 同步跳转 URL | `ALIPAY_RETURN_URL` | 同步跳转 URL | `return_url` |
| 结算备注（可选） | `ALIPAY_ACCOUNT` | 结算账户备注 | `settle_account_label` |
| 通道模式 | `CHANNEL_MODE=alipay` | 页眉展示 `CHANNEL_MODE=…` | — |

**默认通知 URL（未单独配置时）：** `{APP_URL}/channels/alipay/notify`  
（见 `apps/server/src/channels/index.ts` 对 `notifyUrl` 的回落逻辑。）

**Admin 路由与 API：**

| 项 | 值 |
| --- | --- |
| UI 路径 | `/channels/alipay`（`AlipayView.vue`） |
| 读取 | `GET /admin/api/channels/alipay` |
| 写入 | `PUT /admin/api/channels/alipay` |
| 客户端 | `fetchAlipayChannel` / `updateAlipayChannel` |

**密钥语义（与代码一致）：**

- GET 返回 `has_private_key` / `has_public_key` 与可选 `*_hint` 后缀，**密钥输入框始终为空**
- PUT 时密钥字段 **留空 / 省略 = 保留库中原值**；填写非空 = 替换
- 页面文案：「密钥字段留空表示保留原值，填写则替换」

---

## 3. 前置资质与开放平台准备

### 3.1 你需要具备

1. 支付宝开放平台账号与**可签约应用**（企业/个体等符合当面付或扫码产品要求的主体）
2. 已创建应用并拿到 **APPID**
3. 接口加签方式选择 **RSA2（SHA256WithRSA）**
4. 能配置**公网 HTTPS** 异步通知地址（生产）
5. 本平台已部署可访问：`APP_URL`、Admin、SQLite 数据目录

### 3.2 开放平台建议操作顺序

1. 登录 [支付宝开放平台](https://open.alipay.com/)（页面结构可能变化，以官网为准）
2. 创建 / 进入应用 → 获取 **APPID**
3. **开发设置 → 接口加签方式 → 公钥**  
   - 本地生成 RSA2 密钥对（见 §4）  
   - 上传**应用公钥**  
   - 下载/复制**支付宝公钥**（验签回调用）
4. 开通所需产品能力（如**当面付** / 扫码相关产品，以商户实际签约为准）
5. 配置应用网关 / 授权回调等（若产品要求）
6. 将异步通知 URL 设为：  
   `https://<你的 HuaJian_Pay 域名>/channels/alipay/notify`

> 若需引用开放平台控制台截图：仅使用**不含账号、手机号、真实 APPID、密钥**的公开界面示意，并注明「界面可能更新」。本教程优先使用本仓库**原创示意图**与**脱敏 Admin 模拟图**。

---

## 4. RSA2 密钥生成与配置

### 4.1 生成密钥对（示例，OpenSSL）

在安全机器上执行（**不要**把私钥提交仓库）：

```bash
# 生成应用私钥（PKCS#1 或按开放平台要求转换为 PKCS8）
openssl genrsa -out app_private_key.pem 2048
# 导出应用公钥
openssl rsa -in app_private_key.pem -pubout -out app_public_key.pem
```

将 `app_public_key.pem` 内容配置到支付宝开放平台；将平台提供的**支付宝公钥**保存为 `alipay_public_key.pem`。

### 4.2 填入本平台

**方式 A — 环境变量（适合 Docker / 运维注入）**

```env
CHANNEL_MODE=alipay
ALIPAY_APP_ID=你的APPID
ALIPAY_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
ALIPAY_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
ALIPAY_NOTIFY_URL=https://pay.example.com/channels/alipay/notify
ALIPAY_RETURN_URL=https://pay.example.com/
# 可选，仅展示/备注，不是收款凭据
ALIPAY_ACCOUNT=
```

PEM 多行可用 `\n` 写在一行，或由编排系统注入多行 secret。

**方式 B — Admin 图形界面（推荐运营人员）**

1. 启动 API 与 Admin（见 README）
2. 登录后台 → 侧栏 **支付宝通道**（`/channels/alipay`）
3. 填写 App ID、粘贴密钥（首次）、通知 URL 等 → **保存配置**
4. 再次打开页面：密钥框应为空，并显示「已配置」徽章

### 4.3 脱敏配置页示意（对照当前 Admin UI）

![Admin 支付宝配置页脱敏示意（原创模拟，非真实密钥）](../assets/alipay-channel/03-admin-alipay-config-desensitized.png)

该图按 `AlipayView.vue` 字段布局制作：**App ID / 应用私钥 / 支付宝公钥 / 异步通知 URL / 同步跳转 URL / 结算账户备注 / 启用开关 / CHANNEL_MODE 徽章**。图中 APPID 与密钥均为**伪造脱敏**，不可用于生产。

---

## 5. newapi / 易支付侧配置

详见 [`docs/newapi-integration.md`](../newapi-integration.md)。

| newapi 配置项 | 建议值 |
| --- | --- |
| 易支付接口地址 | `https://<HuaJian_Pay 域名>/`（即 `APP_URL`） |
| 商户 ID | `PLATFORM_PID` 或 Admin 商户 pid（默认示例 `1000`） |
| 商户密钥 | 对应 `PLATFORM_KEY` / 商户 key |
| 支付方式 type | **`alipay`** |
| 签名 | MD5 |

本平台入口：`POST /mapi.php`、`POST /submit.php`、查询 `/api.php`；用户支付页 `/pay/:tradeNo`。

---

## 6. Mock 与真实小额验收

![验收与回调流程（原创）](../assets/alipay-channel/04-acceptance-callback-flow.png)

### 6.1 Mock（无需真实密钥）

```bash
# .env: CHANNEL_MODE=mock
pnpm install
pnpm test:mock-e2e
# 或
pnpm dev
curl -sS http://127.0.0.1:8080/health
```

用于验证下单、支付页、商户通知链路，**不调用**支付宝网关。

### 6.2 真实模式检查清单

- [ ] `CHANNEL_MODE=alipay`（或订单 `type=alipay` 且配置完整）
- [ ] App ID / 应用私钥 / 支付宝公钥已配置（Admin `has_*` 为 true 或 env 非空）
- [ ] `APP_URL` 为公网 **HTTPS** 域名
- [ ] 支付宝应用异步通知 = `https://域名/channels/alipay/notify`
- [ ] 反代未改写 body、证书有效
- [ ] 用 **最小金额** 真实下单扫码
- [ ] 订单变为 `paid`，商户 `notify_url` 收到 `type=alipay` 且验签通过
- [ ] 重复通知不重复入账（幂等）
- [ ] Admin 重新打开：密钥框为空，仍显示已配置

---

## 7. 回调、HTTPS 与防火墙

| 项 | 要求 |
| --- | --- |
| 路径 | **`POST /channels/alipay/notify`** |
| 协议 | 生产必须 **HTTPS** |
| 验签 | RSA2 + 支付宝公钥 |
| 业务校验 | `out_trade_no`、金额、`trade_status` 等（以服务端实现为准） |
| 幂等 | 已支付订单重复通知安全 |
| 防火墙 | 放行支付宝网段访问 443；勿仅允许办公网 IP |
| 反代 | 保留原始 POST body；正确传递 `X-Forwarded-Proto` |

同步跳转 `return_url` 仅影响浏览器回跳，**不能替代**异步通知入账。

---

## 8. 常见错误排查

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| 下单失败 / 通道错误 | 缺 app_id 或密钥 | Admin 或 env 补齐 |
| 验签失败 | 支付宝公钥与应用不匹配；密钥格式错误 | 重新下载支付宝公钥；检查 PEM 头尾与换行 |
| 收不到回调 | 非 HTTPS、URL 错误、防火墙 | 用公网探测 notify；查支付宝通知日志 |
| 金额不一致拒单 | 订单金额与回调不一致 | 核对下单 `money` 与支付宝账单 |
| 密钥保存后仍提示未配置 | PUT 时传了空字符串被当成清空（本实现应保留） | 确认客户端省略空密钥字段（Admin 已实现） |
| 生产仍 mock | `CHANNEL_MODE=mock` | 改为 `alipay` |
| 误用个人账号字段 | 把 `ALIPAY_ACCOUNT` 当密钥 | 该字段仅为备注展示 |

---

## 9. 密钥轮换与安全

1. 开放平台生成新密钥对 → 上传新应用公钥 → 取得（或确认）支付宝公钥  
2. 在维护窗口：Admin 粘贴**新**应用私钥与支付宝公钥并保存（或滚动更新 env 后重启）  
3. 用小额单验证回调  
4. 旧私钥下线；**勿**在日志、截图、工单中粘贴完整 PEM  
5. Docker：密钥运行时注入；`.dockerignore` 已排除 `.env` / `*.pem`  
6. 完整威胁模型见 [`docs/security-checklist.md`](../security-checklist.md)

---

## 10. 相关命令与文件索引

| 路径 / 命令 | 说明 |
| --- | --- |
| `.env.example` | 环境变量模板 |
| `apps/admin/src/views/AlipayView.vue` | 支付宝配置页 UI |
| `apps/server/src/config/env.ts` | `ALIPAY_*`、`CHANNEL_MODE` |
| `apps/server/src/channels/` | 支付宝适配与 mock |
| `POST /channels/alipay/notify` | 异步通知 |
| `GET/PUT /admin/api/channels/alipay` | Admin 配置 API |
| `pnpm test:mock-e2e` | Mock 验收 |
| `docs/assets/alipay-channel/*` | 本教程图片 |
| `README.md` | 总配置入口 |

---

## 11. 图片清单

| 文件 | 内容 |
| --- | --- |
| `01-architecture-flow.png` | 原创架构 / 主数据流 |
| `02-field-mapping.png` | 开放平台 ↔ env/Admin 字段映射 |
| `03-admin-alipay-config-desensitized.png` | 对照 AlipayView 的脱敏配置页模拟图 |
| `04-acceptance-callback-flow.png` | Mock/真实验收与回调步骤 |

---

## 修订记录

| 日期 | 说明 |
| --- | --- |
| 2026-07-25 | FileManager：首版图文教程（MD + 资产 + Word），对齐当前 Admin/env/路由 |
