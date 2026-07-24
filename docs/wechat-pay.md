# 微信支付 APIv3（Native）部署与接入

> **产品真相：** 需要**微信商户平台正式商户** + APIv3 证书/密钥。  
> **不是**个人微信收款码监控，也**不能**只填微信号就官方自动收款。  
> **禁止**把真实 APIv3 Key / 商户私钥 / 证书写入 Git 或文档。

**关联：** `docs/api.md` · `docs/newapi-integration.md` · `docs/deployment.md` · `docs/security-checklist.md` · `.env.example`

字段与路由以当前 `apps/server` 实现为准（Coder 任务 `019f9629`）：

| 项 | 实现值 |
| --- | --- |
| 通道 type（商户/API） | **`wxpay`** |
| `CHANNEL_MODE` | `mock` \| `alipay` \| **`wxpay`** |
| 微信回调 | **`POST /channels/wxpay/notify`** |
| Admin 通道配置键 | `channel=wxpay`（JSON 字段见下） |

---

## 1. 前置条件（正式商户）

| 条件 | 说明 |
| --- | --- |
| 微信商户号 | 已开通商户 `mch_id` |
| 关联 AppID | 与商户绑定的 `app_id` |
| APIv3 密钥 | 32 字节 APIv3 Key（回调解密） |
| 商户 API 证书 | 商户私钥 + **证书序列号**（请求签名） |
| 平台公钥/证书 | 验证微信回调签名 |
| 公网 HTTPS | notify URL 必须 HTTPS 且可达 |
| 产品权限 | 至少开通 **Native 支付** |

---

## 2. 环境变量（与 `apps/server/src/config/env.ts` 对齐）

| 环境变量 | 含义 | 秘密？ |
| --- | --- | --- |
| `WECHAT_MCH_ID` | 商户号 | 否 |
| `WECHAT_APP_ID` | AppID | 否 |
| `WECHAT_APIV3_KEY` | APIv3 密钥 | **是** |
| `WECHAT_SERIAL_NO` | 商户证书序列号 | 否（敏感配置） |
| `WECHAT_PRIVATE_KEY` | 商户 API 私钥 PEM 文本 | **是** |
| `WECHAT_PLATFORM_PUBLIC_KEY` | 微信支付平台公钥 PEM | 半敏感 |
| `WECHAT_NOTIFY_URL` | 公网 HTTPS 回调；缺省为 `{APP_URL}/channels/wxpay/notify` | 否 |
| `WECHAT_CERT_PATH` | 可选：证书文件路径（若实现读取） | 否 |
| `WECHAT_KEY_PATH` | 可选：私钥文件路径（若实现读取） | **是** |

### Admin / DB 存储字段（`channelConfigs.channel = "wxpay"`）

| JSON 键 | 对应 |
| --- | --- |
| `mch_id` | 商户号 |
| `app_id` | AppID |
| `api_v3_key` | APIv3 密钥（**GET 不得回显**） |
| `private_key` | 商户私钥（**GET 不得回显**） |
| `serial_no` | 证书序列号 |
| `platform_public_key` | 平台公钥 |
| `notify_url` | 回调 URL |

解析优先级：DB 配置覆盖 env（见 `resolveWechatApiV3Config`）。  
PUT 空字符串应 **保留原秘密**（与支付宝语义一致）。

### 证书挂载

- 推荐：运行时 env / k8s secret / 只读 volume；**禁止** `COPY` 进 Docker 镜像
- `.dockerignore` 已排除 `.env`、`*.pem`
- 私钥文件权限建议 `0400`

---

## 3. HTTPS Notify

| 项 | 值 |
| --- | --- |
| 路径 | **`POST /channels/wxpay/notify`** |
| 示例 | `https://pay.example.com/channels/wxpay/notify` |
| 协议 | 生产必须 **HTTPS** |

反向代理必须：

1. 透传 **原始 body**（RSA 验签 + AES-256-GCM 解密依赖 raw）
2. 保留请求头：`Wechatpay-Signature`、`Wechatpay-Timestamp`、`Wechatpay-Nonce`、`Wechatpay-Serial`
3. `APP_URL` / `WECHAT_NOTIFY_URL` 与对外域名一致

平台 → 商户（newapi）异步通知：`type=wxpay`，成功 `trade_status=TRADE_SUCCESS`，MD5 签名；商户响应 `success`。

---

## 4. newapi 接入

| newapi 配置 | 值 |
| --- | --- |
| 网关 | `https://<HuaJian_Pay 域名>` |
| PID / KEY | 平台商户 `pid` / `key` |
| type | **`wxpay`** |

下单字段与支付宝相同，仅 `type=wxpay`。成功响应中的支付链接应对应 Native **`code_url`**（或包装后的 `/pay/{trade_no}` 页）。

本地无真实凭据时使用 `scripts/fixtures/wechat-apiv3/` 与 E2E 矩阵，**禁止**对微信生产网关滥用伪造凭据。

---

## 5. 验收清单

### 无真实凭据

- [ ] fixture 签名 / 回调解密 / 金额商户校验 / 幂等单测或脚本绿
- [ ] `alipay` + `mock` 回归不被破坏

### 真实商户

- [ ] 注入正式 `WECHAT_*` 或 Admin 配置
- [ ] 公网 HTTPS 命中 `/channels/wxpay/notify`
- [ ] `type=wxpay` 下单 → 扫码 → 订单 `paid` → 商户 notify
- [ ] 重复回调不重复入账
- [ ] Admin GET 不回显 `api_v3_key` / `private_key`

### 轮换 / 排障

| 场景 | 动作 |
| --- | --- |
| APIv3 Key 轮换 | 平台更新 → 运行时注入 → 注意旧回调窗口 |
| 商户证书过期 | 换私钥 + `WECHAT_SERIAL_NO` |
| 验签失败 | 查 raw body、代理改写、时间窗、序列号 |
| 金额不一致 | 以订单金额拒绝，不入账 |
| 日志 | 禁止打印完整 Key / Authorization / PEM |

---

## 6. 修订记录

| 日期 | 说明 |
| --- | --- |
| 2026-07-25 | FileManager：骨架 |
| 2026-07-25 | FileManager：对齐工作区真实 env（`WECHAT_APIV3_KEY` 等）与 **`/channels/wxpay/notify`**；仍不提交 Coder 业务源码 |
