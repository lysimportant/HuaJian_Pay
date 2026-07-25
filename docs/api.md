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

### 6.2 Multi-admin users (role=`admin` only)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/admin/api/admin-users` | List users (no hashes) |
| POST | `/admin/api/admin-users` | Create `{ username, password, display_name?, role? }` |
| PATCH | `/admin/api/admin-users/:id` | Update `display_name` / `role` / `status`; cannot disable or demote **last active admin**; disable bumps `token_version` |
| POST | `/admin/api/admin-users/:id/reset-password` | Body `{ new_password }`; bumps `token_version`; no password echo |

### 6.3 Orders / channels / merchants

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/admin/api/orders` | List/filter orders |
| GET | `/admin/api/orders/:tradeNo` | Detail + notify logs |
| GET/PUT | `/admin/api/channels/alipay` | Alipay config (GET never echoes secrets; PUT empty = preserve) |
| GET/PUT | `/admin/api/channels/wxpay` | WeChat APIv3 config (GET never echoes secrets; PUT empty = preserve) |
| GET | `/admin/api/merchants` | Merchant list |
| POST | `/admin/api/merchants` | Create merchant / rotate key |

All admin mutations require auth. `viewer` role can login and use profile/orders/read paths
as currently gated by `requireAdmin`; user-management routes require `role=admin`.

---

## 7. newapi wiring (summary)

1. Base URL = public HuaJian_Pay origin
2. pid + key from admin
3. type lipay or **wxpay** (WeChat Native code_url)
4. newapi supplies notify_url when creating orders

Full guide: docs/newapi-integration.md · WeChat ops: docs/wechat-pay.md.
