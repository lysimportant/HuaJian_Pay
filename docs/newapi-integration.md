# newapi 集成指南（HuaJian_Pay）

面向 **newapi / 易支付兼容插件** 的对接说明。本平台提供 YiPay 经典接口（MD5 签名）。

> 默认本地地址：`http://127.0.0.1:8080`  
> 环境变量见仓库根目录 `.env.example`。

---

## 1. newapi 应填配置

| 配置项 | 建议值 | 说明 |
| --- | --- | --- |
| 支付网关 / API URL | `http://127.0.0.1:8080/` 或 `http://127.0.0.1:8080` | 根地址即可；插件会拼 `/mapi.php`、`/submit.php`、`/api.php` |
| 商户 ID（pid） | `1000`（默认种子） | 对应 `PLATFORM_PID` / 后台商户 pid |
| 商户密钥（key） | 与 `PLATFORM_KEY` 一致 | 默认示例为 `change-me-merchant-key`，**生产务必更换** |
| 支付方式（type） | `alipay` 或 **`wxpay`** | `wxpay` = 微信 APIv3 Native（正式商户 + 证书，见 `docs/wechat-pay.md`，核心 `5e7740c`） |
| 签名方式 | `MD5` | `sign_type=MD5`，小写 hex |
| 设备/通道模式 | 服务端 `CHANNEL_MODE=mock\|alipay\|wxpay` | newapi 侧无需配置；本地无证书时用 `mock` |

### 推荐 newapi 映射

| newapi 字段 | 本平台 |
| --- | --- |
| 易支付接口地址 | `{APP_URL}/` |
| PID | 商户 `pid` |
| KEY | 商户 `api_key` |
| 支付类型 | `alipay` 或 **`wxpay`**（Native `code_url`；回调 `POST /channels/wxpay/notify`） |
| 签名类型 | MD5 |

---

## 2. 回调 / 返回地址要求

### 2.1 商户异步通知（平台 → newapi）

下单时传入的 `notify_url` 必须：

1. **公网或内网可被本平台访问**（本地 mock 可用 `127.0.0.1` 临时 HTTP 接收器）
2. 接受 **HTTP POST**（`application/x-www-form-urlencoded`）
3. 校验 MD5 签名（算法与下单相同）
4. 业务处理成功后响应 body **纯文本** `success`（大小写不敏感，去空白后比较）
5. 幂等：同一 `out_trade_no` / `trade_no` 重复通知应仍返回 `success`

**通知字段（平台 → 商户）：**

| 字段 | 说明 |
| --- | --- |
| pid | 商户 ID |
| trade_no | 平台订单号 |
| out_trade_no | 商户订单号 |
| type | `alipay` / `wxpay` |
| name | 商品名 |
| money | 金额，小数字符串如 `1.00` |
| trade_status | 成功时为 `TRADE_SUCCESS` |
| param | 下单透传 |
| sign | MD5 签名 |
| sign_type | `MD5` |

失败会写入 `notify_attempts` 并按退避重试（最多约 8 次）。

### 2.2 同步跳转（浏览器 return_url）

- 字段：`return_url`（可选）
- 用于支付完成后浏览器回跳；**不能**作为唯一入账依据
- 入账以异步 `notify_url` + 平台订单状态为准

### 2.3 支付宝渠道回调（支付宝 → 本平台）

| 路径 | 说明 |
| --- | --- |
| `POST /channels/alipay/notify` | 真实支付宝 RSA2 验签 + 金额校验 + 幂等置 paid |

本地 mock 无需配置支付宝公钥；真实模式需在后台 / env 配置密钥，并将支付宝应用网关通知 URL 指到上述路径。

### 2.4 微信渠道回调（微信 → 本平台）

| 路径 | 说明 |
| --- | --- |
| `POST /channels/wxpay/notify` | APIv3 平台签名验签 + AES-256-GCM 解密 + 金额/商户校验 + 幂等置 paid |

- newapi 下单 `type=**wxpay**`（不是 `wechat`）
- 微信商户平台 / 配置中的通知 URL 必须为 **HTTPS** 公网地址指向上述路径
- Admin：`GET/PUT /admin/api/channels/wxpay`（秘密字段 GET 不回显，PUT 空值保留）
- 完整证书挂载、轮换与真实验收：`docs/wechat-pay.md`

---

## 3. 签名算法（MD5）

与经典易支付一致：

1. 取全部非空参数，排除 `sign`、`sign_type`
2. 按参数名 **ASCII 升序** 排序
3. 拼接：`k1=v1&k2=v2&...`（签名串内通常不做 URL encode）
4. `sign = md5(stringSignTemp + KEY)` → **小写 hex**
5. 附带 `sign_type=MD5`

### Node.js 示例

```js
import { createHash } from "node:crypto";

function signMd5(params, key) {
  const src = Object.keys(params)
    .filter((k) => k !== "sign" && k !== "sign_type")
    .filter((k) => params[k] !== undefined && params[k] !== null && String(params[k]) !== "")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("md5").update(src + key, "utf8").digest("hex");
}

const KEY = "change-me-merchant-key";
const params = {
  pid: "1000",
  type: "alipay",
  out_trade_no: "NEWAPI202507250001",
  notify_url: "http://127.0.0.1:9099/notify",
  return_url: "http://127.0.0.1:3000/return",
  name: "newapi-recharge",
  money: "1.00",
};
params.sign = signMd5(params, KEY);
params.sign_type = "MD5";
```

---

## 4. 接口说明与请求示例

### 4.1 API 下单 — `POST /mapi.php`

**Content-Type：** `application/json` 或 `application/x-www-form-urlencoded`

**必填：** `pid, type, out_trade_no, notify_url, name, money, sign, sign_type`

**成功响应示例：**

```json
{
  "code": 1,
  "msg": "success",
  "trade_no": "20250725120000abcd1234",
  "payurl": "http://127.0.0.1:8080/mock/alipay/pay/...",
  "qrcode": "http://127.0.0.1:8080/mock/alipay/qr/..."
}
```

`code !== 1` 表示失败（如签名错误 `code=-2`）。

### 4.2 页面下单 — `GET|POST /submit.php`

字段同 mapi；成功返回简易 HTML 支付页（含 payurl/qrcode 链接）。

### 4.3 订单查询 — `GET /api.php`

```
GET /api.php?act=order&pid=1000&key=change-me-merchant-key&out_trade_no=NEWAPI202507250001
```

也可用 MD5 签名查询（与下单同算法）。

**成功时关键字段：**

| 字段 | 说明 |
| --- | --- |
| code | `1` 成功 |
| status | `1` 已支付 / `0` 未支付 |
| trade_status | `TRADE_SUCCESS` / `TRADE_PENDING` |
| trade_no | 平台单号 |
| money | 金额 |

### 4.4 REST 别名

| 方法 | 路径 | 等价 |
| --- | --- | --- |
| POST | `/api/v1/pay/create` | `/mapi.php` |
| POST | `/api/v1/pay/submit` | `/submit.php` |
| GET | `/api/v1/order/query` | `/api.php?act=order` |

### 4.5 管理端（AdminUI / 运维）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/admin/api/login` | `{ "username","password" }` → `token` |
| GET | `/admin/api/me` | `Authorization: Bearer <token>` |
| GET | `/admin/api/orders` | 订单列表 |
| GET/PUT | `/admin/api/channels/alipay` | 支付宝配置 |
| GET/POST | `/admin/api/merchants` | 商户列表 / 创建（创建时一次性返回完整 key） |

默认管理员来自 env：`ADMIN_USERNAME` / `ADMIN_PASSWORD`。

---

## 5. mock 验证步骤（无需真实支付宝）

### 5.1 一键 smoke（推荐）

```powershell
Set-Location D:\pay\HuaJian_Pay
pnpm install
pnpm test:mock-e2e
# 等价：node scripts/mock-e2e.mjs
```

`scripts/mock-e2e.mjs` **会自行**：

1. 若 `http://127.0.0.1:8080/health` 未就绪，则以 `CHANNEL_MODE=mock` 拉起 `apps/server`
2. 等待 `/health`
3. 本地拉起临时商户 `notify_url` 接收器
4. MD5 签名 `POST /mapi.php` 下单
5. `POST /mock/alipay/pay/:tradeNo` 模拟支付成功
6. `GET /api.php` 查单（期望已支付 `status=1`）
7. 断言商户 notify 收到（`notify_hits>=1`）
8. 结束后清理自启的服务进程

可选环境变量：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `BASE_URL` | `http://127.0.0.1:8080` | 目标网关 |
| `PID` / `KEY` | `1000` / `change-me-merchant-key` | 须与服务端 `PLATFORM_*` / 种子商户一致 |
| `SKIP_SERVER_START=1` | 关 | 仅附着已有进程，不自启 |
| `E2E_VERBOSE=1` | 关 | 打印服务端 stdout/stderr |
| `E2E_START_TIMEOUT_MS` | `60000` | 等 `/health` 超时 |

成功示例字段：`ok=true`、`started_server=true|false`、`trade_no`、`notify_hits`。

### 5.2 手动起服务（可选）

```powershell
# .env 建议：CHANNEL_MODE=mock、PLATFORM_PID/KEY、ADMIN_*、APP_SECRET
pnpm --filter @huajian/server dev
Invoke-RestMethod http://127.0.0.1:8080/health
# 期望 ok=true, channelMode=mock
# 然后：
$env:SKIP_SERVER_START=1; pnpm test:mock-e2e
```

### 5.3 手动 mock 支付入口

仅 `CHANNEL_MODE=mock` 可用：

```http
POST /mock/alipay/pay/{trade_no}
Content-Type: application/json

{}
```

成功后订单 `status=paid`，并触发商户 `notify_url` 投递。

---

## 6. 切换真实支付宝前置条件

1. 支付宝开放平台应用（推荐沙箱先通）
2. 配置 env 或后台 `channel_configs`：
   - `ALIPAY_APP_ID`
   - `ALIPAY_PRIVATE_KEY`（应用私钥）
   - `ALIPAY_PUBLIC_KEY`（支付宝公钥）
   - `ALIPAY_NOTIFY_URL` = `{APP_URL}/channels/alipay/notify`
3. 设置 `CHANNEL_MODE=alipay`
4. 重启 `apps/server`
5. 使用真实 `payurl/qrcode` 完成一笔小额/沙箱支付
6. 确认：
   - 平台订单 `paid`
   - newapi `notify_url` 收到 `TRADE_SUCCESS` 并返回 `success`
   - `/api.php` 查询 `status=1`

**不要**把私钥、商户 key 提交进 Git。

---

## 7. 常见错误

| 现象 | 可能原因 |
| --- | --- |
| `code=-2 sign error` | key 不一致 / 参与签名字段有空值或未排序 |
| `code=-3 out_trade_no already exists` | 同一商户重复单号 |
| `code=-4 channel precreate failed` | 真实支付宝配置不完整或网关错误 |
| 一直未支付 | 未调 mock 支付 / 真实支付未完成 / notify 验签失败 |
| 商户未到账 | `notify_url` 不可达或未返回纯文本 `success` |

---

## 8. 相关文件

- 签名实现：`apps/server/src/pay/sign.ts`
- 下单/查单：`apps/server/src/routes/pay.ts`
- 支付宝/mock：`apps/server/src/channels/alipay.ts`、`apps/server/src/routes/channels.ts`
- 商户通知：`apps/server/src/pay/notify.ts`
- API 总览：`docs/api.md`
- Smoke：`scripts/mock-e2e.mjs`
