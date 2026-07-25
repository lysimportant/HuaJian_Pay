# API — HuaJian_Pay (draft)

YiPay-compatible merchant API + modern aliases.  
Sign algorithm: **MD5 lowercase**, classic epay style (see `docs/planning/findings.md` §2.2).

---

## 1. Signature (merchant → platform)

1. Take all non-empty params except `sign`, `sign_type`.  
2. Sort keys ASCII ascending.  
3. Join as `k1=v1&k2=v2&...` (classic: no URL-encoding in sign source).  
4. `sign = md5(stringSignTemp + KEY)` lowercase hex.  
5. `sign_type=MD5`.

---

## 2. Classic YiPay-compatible routes

### 2.1 Page submit

`GET|POST /submit.php`

| Field | Required | Description |
| --- | --- | --- |
| pid | yes | Merchant id |
| type | yes* | `alipay` / `wxpay` |
| out_trade_no | yes | Merchant order no |
| notify_url | yes | Async notify URL |
| return_url | no | Browser return |
| name | yes | Title |
| money | yes | Decimal string e.g. `1.00` |
| sitename | no | Site name |
| param | no | Attach |
| sign | yes | MD5 |
| sign_type | yes | `MD5` |

**Response:** HTML redirect / pay page (or 302 to Alipay).

### 2.2 API create (mapi)

`POST /mapi.php`

Same fields as submit (form or JSON — implement form first for max compatibility).

**Success JSON (typical):**

```json
{
  "code": 1,
  "msg": "success",
  "trade_no": "platform-trade-no",
  "payurl": "https://...",
  "qrcode": "https://..."
}
```

Exact shape may be adjusted for target newapi plugin; keep `code/msg/payurl/qrcode/trade_no`.

### 2.3 Order query

`GET /api.php?act=order&pid=&key=&out_trade_no=`

Or signed query variant. Return status, money, trade_no, paid flag.

---

## 3. Modern REST aliases (same sign rules)

| Method | Path | Maps to |
| --- | --- | --- |
| POST | `/api/v1/pay/submit` | page submit |
| POST | `/api/v1/pay/create` | mapi create |
| GET | `/api/v1/order/query` | order query |

---

## 4. Channel callbacks (inbound)

| Channel | Path | Verify |
| --- | --- | --- |
| Alipay | `POST /channels/alipay/notify` | RSA2, amount, out_trade_no, trade_status |
| WeChat | `POST /channels/wxpay/notify` | APIv3 RSA verify + AES-256-GCM decrypt; headers Wechatpay-Timestamp/Nonce/Signature/Serial; response `{"code":"SUCCESS"}`; see `docs/wechat-pay.md` |

On success: mark order paid (idempotent), enqueue merchant notify, respond per channel rules.

---

## 5. Outbound merchant notify

Platform → merchant `notify_url` (form POST recommended):

| Field | Notes |
| --- | --- |
| pid | Merchant id |
| trade_no | Platform order no |
| out_trade_no | Merchant order no |
| type | `alipay` / `wxpay` |
| name | Product name |
| money | Decimal paid amount |
| trade_status | `TRADE_SUCCESS` |
| param | Echo |
| sign / sign_type | Same MD5 scheme |

Merchant must respond body: **`success`**.  
Retry with backoff on failure; persist attempts.

---

## 6. Admin API (Bearer HMAC token)

Auth: `Authorization: Bearer <token>` after login. Token is HMAC-SHA256 over JSON payload
`{ sub, username, role, tv, exp }` signed with `APP_SECRET` (12h). Field **`tv`** =
`admin_users.token_version` at issue time; each request reloads the user and rejects if
status ≠ `active` or `tv` mismatch (password change / disable / reset-password).

**Never returned:** `password_hash`, raw secrets, full channel keys.

### 6.1 Auth & profile

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/admin/api/login` | Body `{ username, password }` → `{ token, user }` (public user only) |
| GET | `/admin/api/me` | Current user profile |
| PUT | `/admin/api/me` | Update `display_name` and/or `username` (unique) |
| PUT | `/admin/api/me/password` | Body `{ old_password, new_password }` (≥8 chars); bumps `token_version`; returns **new** `token` |

Public user JSON:

```json
{
  "id": 1,
  "username": "admin",
  "display_name": "Administrator",
  "role": "admin",
  "status": "active",
  "created_at": 0,
  "updated_at": 0
}
```

### 6.2 Roles (RBAC)

| role | 中文 | Capabilities |
| --- | --- | --- |
| `super_admin` | 超级管理员 | 账号 CRUD；通道/商户写；订单读；`/me*` |
| `admin` | 管理员 | 同上（不可创建 `super_admin`；改超级管理员需自身为 super_admin） |
| `viewer` | 普通用户 | 仅 `/me*` + 订单只读；**禁止** `/admin-users*` 与通道/商户写 |

登录失败等稳定中文：`用户名或密码错误`、`原密码错误`、`权限不足，普通用户无法管理账号` 等。

### 6.3 Multi-admin users (`super_admin` / `admin` only)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/admin/api/admin-users` | 列表；query `keyword` / `role` / `status`；不回显 hash |
| GET | `/admin/api/admin-users/:id` | 单用户详情 |
| POST | `/admin/api/admin-users` | 创建 `{ username, password, display_name?, role? }`（`admin`\|`viewer`） |
| PATCH | `/admin/api/admin-users/:id` | 编辑 `username` / `display_name` / `role` / `status`；禁禁用/降级**最后一个有效管理员** |
| DELETE | `/admin/api/admin-users/:id` | 删除；禁删自己 / 最后有效管理员 |
| POST | `/admin/api/admin-users/:id/reset-password` | `{ new_password }`；bump `token_version` |

### 6.4 Orders / channels / merchants

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/admin/api/orders` | List/filter orders（登录即可） |
| GET | `/admin/api/orders/:tradeNo` | Detail + notify logs |
| GET/PUT | `/admin/api/channels/alipay` | 写操作需管理员角色；GET 不回显密钥 |
| GET/PUT | `/admin/api/channels/wxpay` | 同上 |
| GET | `/admin/api/merchants` | Merchant list（管理员） |
| POST | `/admin/api/merchants` | Create merchant / rotate key（管理员） |

---

## 7. newapi wiring (summary)

1. Base URL = public HuaJian_Pay origin
2. pid + key from admin
3. type lipay or **wxpay** (WeChat Native code_url)
4. newapi supplies notify_url when creating orders

Full guide: docs/newapi-integration.md · WeChat ops: docs/wechat-pay.md.
