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

## 6. Admin API (skeleton, session auth)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/admin/api/login` | Login |
| POST | `/admin/api/logout` | Logout |
| GET | `/admin/api/me` | Current admin |
| GET | `/admin/api/orders` | List/filter orders |
| GET | `/admin/api/orders/:tradeNo` | Detail + notify logs |
| GET/PUT | `/admin/api/channels/alipay` | Alipay config (GET never echoes secrets; PUT empty = preserve) |
| GET/PUT | `/admin/api/channels/wxpay` | WeChat APIv3 config (GET never echoes api_v3_key/private_key/platform_public_key; PUT empty secret = preserve); see `docs/wechat-pay.md` |
| GET | `/admin/api/merchants` | Merchant list (MVP may be single) |
| POST | `/admin/api/merchants` | Create merchant / rotate key |

All admin mutations require auth.

---

## 7. newapi wiring (summary)

1. Base URL = public HuaJian_Pay origin
2. pid + key from admin
3. type lipay or **wxpay** (WeChat Native code_url)
4. newapi supplies notify_url when creating orders

Full guide: docs/newapi-integration.md · WeChat ops: docs/wechat-pay.md.
