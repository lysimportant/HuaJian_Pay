# 微信支付 APIv3（Native）部署与接入

> **实现对齐 commit：** `5e7740c`（微信 APIv3 Native 通道核心）  
> **产品真相：** 需要**微信商户平台正式商户** + APIv3 证书/密钥。  
> **不是**个人微信收款码监控，也**不能**只填微信号就官方自动收款。  
> **禁止**把真实 APIv3 Key / 商户私钥 / 证书写入 Git 或本文档。

**关联文档：** `docs/api.md` · `docs/newapi-integration.md` · `docs/deployment.md` · `docs/security-checklist.md` · `.env.example`

---

## 1. 实现对照表（代码事实）

| 项 | 值 |
| --- | --- |
| 商户/API 支付方式 `type` | **`wxpay`** |
| 服务端 `CHANNEL_MODE` | `mock` \| `alipay` \| **`wxpay`** |
| 微信结果通知 | **`POST /channels/wxpay/notify`** |
| Admin 读配置 | **`GET /admin/api/channels/wxpay`** |
| Admin 写配置 | **`PUT /admin/api/channels/wxpay`** |
| DB 通道键 | `channel_configs.channel = "wxpay"` |
| Native 下单 | 微信支付 APIv3 `POST /v3/pay/transactions/native` |
| 成功支付串 | 响应 `code_url`（写入订单 `pay_url` / `qr_url`） |
| 配置优先级 | **DB 覆盖 env**（`resolveWechatApiV3Config`） |

### 源码入口

| 文件 | 职责 |
| --- | --- |
| `apps/server/src/config/env.ts` | `WECHAT_*` 环境变量 |
| `apps/server/src/channels/wechat-api-v3.ts` | 签名、Native 下单、回调验签、AES-GCM |
| `apps/server/src/channels/wechat.ts` | 通道适配器 `createWechatChannel` |
| `apps/server/src/channels/index.ts` | `type=wxpay` → 微信适配器 |
| `apps/server/src/routes/wechat-channel.ts` | `/channels/wxpay/notify` |
| `apps/server/src/routes/admin.ts` | Admin GET/PUT `/admin/api/channels/wxpay` |
| `apps/server/src/routes/pay.ts` | 商户下单 `type` 含 `wxpay` |

---

## 2. 前置条件（正式商户）

| 条件 | 说明 |
| --- | --- |
| 微信商户号 | 已开通 `mch_id` |
| 关联 AppID | 与商户绑定的 `app_id` |
| APIv3 密钥 | 商户平台设置的 32 字节 Key（回调解密） |
| 商户 API 证书 | 商户私钥 + **证书序列号**（请求 `Authorization` 签名） |
| 平台公钥/证书 | 验证回调 `Wechatpay-Signature` |
| 公网 HTTPS | notify 必须 **HTTPS** 且可被微信访问 |
| 产品权限 | 至少开通 **Native 支付**（扫码） |

**明确禁止宣称：**

- 个人收款码 OCR/挂机扫码
- 「只填微信号即可官方自动到账」
- 将真实密钥写入仓库、镜像或文档

---

## 3. 环境变量（`.env` / 容器运行时）

与 `apps/server/src/config/env.ts` 一致：

| 环境变量 | 含义 | 秘密？ |
| --- | --- | --- |
| `CHANNEL_MODE` | 含 `wxpay` 时走微信真实 Native（非 mock） | 否 |
| `WECHAT_MCH_ID` | 商户号 | 否 |
| `WECHAT_APP_ID` | AppID | 否 |
| `WECHAT_APIV3_KEY` 或 `WECHAT_API_V3_KEY` | APIv3 密钥 | **是** |
| `WECHAT_SERIAL_NO` | 商户 API 证书序列号 | 否（敏感配置） |
| `WECHAT_PRIVATE_KEY` | 商户 API 私钥 PEM 文本 | **是** |
| `WECHAT_PLATFORM_PUBLIC_KEY` | 微信支付平台公钥 PEM | 半敏感 |
| `WECHAT_NOTIFY_URL` | 公网回调；**缺省** `{APP_URL}/channels/wxpay/notify` | 否 |
| `WECHAT_CERT_PATH` | 可选：证书/材料文件路径（实现保留） | 否 |
| `WECHAT_KEY_PATH` 或 `WECHAT_PRIVATE_KEY_PATH` | 可选：私钥文件路径（实现保留） | **是** |

**注入原则：**

- 仅运行时注入（compose/k8s secret/环境变量）
- **不要** `COPY` 私钥进 Docker 镜像（见 `.dockerignore` 的 `.env` / `*.pem`）
- 日志中禁止打印完整 Key / PEM / `Authorization`

### 证书挂载建议

| 方式 | 建议 |
| --- | --- |
| 小规模 | env 中写入 PEM（`\n` 转义） |
| 生产 | 只读 volume / secret 挂载，权限 `0400`，仅运行用户可读 |
| 与数据卷分离 | SQLite 用 `/data`；证书不要写进 DB 文件卷 |

---

## 4. Admin 配置 API（GET/PUT）

### `GET /admin/api/channels/wxpay`

需管理员登录。返回**可编辑非密字段 + 秘密是否已配置**，**永不回显**完整 `api_v3_key` / `private_key` / `platform_public_key`：

```json
{
  "mch_id": "...",
  "app_id": "...",
  "api_v3_key": "",
  "private_key": "",
  "serial_no": "...",
  "platform_public_key": "",
  "notify_url": "https://pay.example.com/channels/wxpay/notify",
  "has_api_v3_key": true,
  "has_private_key": true,
  "has_platform_public_key": true,
  "private_key_hint": "…abcd"
}
```

### `PUT /admin/api/channels/wxpay`

Body JSON 字段：

| 键 | 说明 |
| --- | --- |
| `mch_id` | 商户号 |
| `app_id` | AppID |
| `api_v3_key` | APIv3 密钥；**空 / 省略 = 保留原值**（`resolveSecretField`） |
| `private_key` | 商户私钥 PEM；空 = 保留 |
| `serial_no` | 证书序列号 |
| `platform_public_key` | 平台公钥；空 = 保留 |
| `notify_url` | 回调 URL；空则回落 env / 默认路径 |

写库后同样返回 `publicWxpayConfigView`（秘密字段仍为空字符串 + `has_*` 标志）。

### DB JSON 存储键（`channel_configs.config`）

`mch_id`, `app_id`, `api_v3_key`, `private_key`, `serial_no`, `platform_public_key`, `notify_url`

---

## 5. Native 下单与 HTTPS Notify

### 5.1 商户下单（newapi / 易支付兼容）

- `POST /mapi.php` 或 `/submit.php`
- `type=wxpay`（与 `alipay` 并列）
- 签名：MD5 YiPay 规则（见 `docs/newapi-integration.md`）

成功时平台订单带微信 **`code_url`**（扫码链接）；公共支付页可展示二维码并轮询状态。

### 5.2 微信 → 平台回调

| 项 | 值 |
| --- | --- |
| 路径 | **`POST /channels/wxpay/notify`** |
| 完整 URL 示例 | `https://pay.example.com/channels/wxpay/notify` |
| 协议 | 生产必须 **HTTPS** |

**反向代理必须：**

1. 透传 **原始 body**（RSA 验签与 AES-256-GCM 解密依赖 raw）
2. 保留请求头：`Wechatpay-Signature`、`Wechatpay-Timestamp`、`Wechatpay-Nonce`、`Wechatpay-Serial`（实现读取为小写 header 名）
3. `APP_URL` / `WECHAT_NOTIFY_URL` 与对外域名一致

成功处理响应：`{"code":"SUCCESS","message":"成功"}`  
失败：`{"code":"FAIL","message":"..."}`（HTTP 400）

### 5.3 平台 → 商户（newapi）异步通知

与支付宝相同 YiPay 字段集；**`type=wxpay`**，成功 `trade_status=TRADE_SUCCESS`，MD5 签名；商户 body 响应 `success`。

### 5.4 安全校验（实现已做）

- 平台签名验签 + 时间窗（默认约 5 分钟）
- AES-256-GCM 解密 resource
- 校验 `mchid` / `appid` / `out_trade_no`（平台 `trade_no`）/ 金额分 / `currency=CNY`
- 仅 `trade_state=SUCCESS` 入账
- 幂等：重复通知不重复改状态

---

## 6. newapi 接入（`type=wxpay`）

| newapi 配置项 | 值 |
| --- | --- |
| 网关 / API 地址 | `https://<HuaJian_Pay 域名>` |
| 商户 ID | `pid`（如 `PLATFORM_PID`） |
| 商户密钥 | 对应 `key` |
| 支付方式 type | **`wxpay`** |
| 签名 | MD5 |

下单示例（仅 `type` 与支付宝不同）：

```text
pid=1000
type=wxpay
out_trade_no=...
notify_url=https://your-newapi/notify
name=recharge
money=1.00
sign=...
sign_type=MD5
```

---

## 7. 验收清单

### 7.1 无真实凭据（开发）

- [ ] 使用仓库 fixture / 单测（`scripts/fixtures/wechat-apiv3` 若存在）验证签名与解密
- [ ] `CHANNEL_MODE=mock` 下 alipay/mock E2E 仍绿
- [ ] Admin GET 不回显微信秘密字段

### 7.2 真实商户验收

1. 配置 `WECHAT_*` 或 Admin PUT `/admin/api/channels/wxpay`
2. `CHANNEL_MODE=wxpay`（或确保下单 `type=wxpay` 且配置完整）
3. 公网 HTTPS 可达 `.../channels/wxpay/notify`
4. newapi / mapi `type=wxpay` 下单 → 获得 `code_url` → 微信扫码支付
5. 回调到达 → 订单 `paid` → 商户 `notify_url` 收到 `type=wxpay`
6. 重复回调不重复入账
7. Admin：`has_api_v3_key` 等为 true，输入框秘密为空

### 7.3 轮换与排障

| 场景 | 动作 |
| --- | --- |
| APIv3 Key 轮换 | 商户平台更新 → Admin PUT 新 key 或改 env 并重启 |
| 商户证书过期 | 换私钥 + 更新 `serial_no` |
| 平台公钥更新 | 更新 `platform_public_key` / env |
| 验签失败 | 查 raw body 是否被代理改写、时钟、序列号 |
| 金额不一致 | 实现拒绝入账；查订单金额与回调 `amount.total` |
| 配置不全 | 下单报错：微信 APIv3 配置不完整（缺 mch_id/app_id/key/私钥/序列号/平台公钥） |

---

## 8. 与部署文档交叉点

- 容器：密钥仅运行时注入；见 `docs/deployment.md`
- 安全清单：`docs/security-checklist.md` 微信密钥与 HTTPS notify
- Docker：`.dockerignore` 排除 `.env` / `*.pem`

---

## 9. 修订记录

| 日期 | 说明 |
| --- | --- |
| 2026-07-25 | FileManager：骨架 |
| 2026-07-25 | FileManager：对齐工作区字段与 `/channels/wxpay/notify` |
| 2026-07-25 | FileManager：**对齐已推送核心 `5e7740c`** — Admin GET/PUT、env、Native/notify、newapi、证书/HTTPS/轮换/真实验收 |
