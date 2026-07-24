# HuaJian_Pay Merchant API (draft)

**Owner:** Planner (draft) → PayCore implements & freezes  
**Status:** Draft aligned with YiPay + modern aliases  
**Sign:** MD5 (classic YiPay), lowercase hex

---

## 0. Conventions

| Item | Rule |
| --- | --- |
| Base URL | `APP_URL` e.g. `https://pay.example.com` |
| Money | Decimal string with 2 places at API edge: `1.00` |
| Internal | Integer cents |
| Charset | UTF-8 |
| Merchant identity | `pid` + secret `key` |
| Success notify ack | Response body exactly `success` |

### Sign algorithm

1. Take all parameters except `sign`, `sign_type`.
2. Drop empty values.
3. Sort keys ASCII ascending.
4. Join as `k=v` with `&`.
5. Append merchant `key` (raw concat).
6. `sign = md5(that string)` lowercase.
7. Send `sign` and `sign_type=MD5`.

---

## 1. Classic YiPay-compatible endpoints

### 1.1 Page submit — `GET|POST /submit.php`

Browser redirect payment entry (HTML pay page or 302 to channel).

**Parameters**

| Name | Required | Description |
| --- | --- | --- |
| pid | yes | Merchant id |
| type | yes | `alipay` / `wxpay` |
| out_trade_no | yes | Merchant order no |
| notify_url | yes | Async notify URL |
| return_url | no | Sync return URL |
| name | yes | Product title |
| money | yes | Amount `x.xx` |
| sitename | no | Site name |
| param | no | Attach |
| sign | yes | Signature |
| sign_type | yes | `MD5` |

**Behavior:** verify sign → create order → render pay page / redirect.

### 1.2 MAPI create — `POST /mapi.php`

Machine-friendly create (form or JSON). Prefer form for max compatibility.

**Same parameters as submit.**

**Example success JSON (implementation may match common epay mapi):**

```json
{
  "code": 1,
  "msg": "success",
  "trade_no": "202607250001",
  "payurl": "https://...",
  "qrcode": "https://..."
}
```

`code != 1` → error with `msg`.

### 1.3 Query — `GET /api.php`

| Query | Required | Description |
| --- | --- | --- |
| act | yes | `order` |
| pid | yes | |
| key | yes* | Some clones use key in query instead of sign |
| out_trade_no | yes* | or `trade_no` |
| trade_no | no | Platform trade no |

\*Implement **both**: (a) `pid`+`key`+`out_trade_no` classic; (b) signed query optional.

**Example success:**

```json
{
  "code": 1,
  "msg": "success",
  "trade_no": "202607250001",
  "out_trade_no": "N1001",
  "type": "alipay",
  "pid": 1000,
  "addtime": "2026-07-25 12:00:00",
  "endtime": "2026-07-25 12:01:00",
  "name": "newapi topup",
  "money": "10.00",
  "status": 1
}
```

`status`: `0` unpaid, `1` paid.

---

## 2. Modern REST aliases (same semantics)

| Method | Path | Mirrors |
| --- | --- | --- |
| POST | `/api/v1/pay/submit` | page-oriented create (may return HTML or URL) |
| POST | `/api/v1/pay/create` | mapi-style JSON create |
| GET | `/api/v1/order/query` | order query |

Request bodies: `application/x-www-form-urlencoded` or `application/json` (JSON still uses same field names + sign).

---

## 3. Async notify (platform → merchant / newapi)

**Method:** `POST` `application/x-www-form-urlencoded` (primary)

| Field | Description |
| --- | --- |
| pid | Merchant id |
| trade_no | Platform trade no |
| out_trade_no | Merchant order no |
| type | `alipay` / `wxpay` |
| name | Title |
| money | Paid amount |
| trade_status | `TRADE_SUCCESS` |
| param | Echo |
| sign | MD5 |
| sign_type | `MD5` |

**Merchant must:**

1. Verify sign with own key.
2. Check `out_trade_no`, `money`, `trade_status`.
3. Respond body `success` (no JSON wrapper).

**Retry policy (platform):** exponential backoff, e.g. 0s, 15s, 60s, 5m, 30m, 2h… capped; persist each attempt in `notify_attempts`.

---

## 4. Channel notify ingress (channel → platform)

| Channel | Path (suggested) |
| --- | --- |
| Alipay | `POST /channels/alipay/notify` |
| WeChat | `POST /channels/wechat/notify` |

Not merchant-facing; no YiPay sign. Verify official channel signatures only.

---

## 5. Admin API (sketch, not YiPay)

All under `/admin/api/*`, session auth required.

| Area | Examples |
| --- | --- |
| Auth | `POST /admin/api/login`, `POST /admin/api/logout`, `GET /admin/api/me` |
| Channels | `GET/PUT /admin/api/channels/alipay`, `.../wxpay` |
| Orders | `GET /admin/api/orders`, `GET /admin/api/orders/:tradeNo` |
| Notify logs | `GET /admin/api/notify-attempts`, channel notify logs |
| Merchants / keys | `GET/PUT` merchant pid/key rotation |
| Dashboard | counts: today paid, pending, notify fail |

**Security:** never return full private keys after save; show last-4 / masked.

---

## 6. Error model

### Classic / mapi

```json
{ "code": -1, "msg": "sign error" }
```

### Modern (optional unified)

```json
{
  "success": false,
  "error": { "code": "SIGN_INVALID", "message": "sign error" }
}
```

PayCore may implement classic first; modern can wrap the same codes.

---

## 7. newapi wiring (summary)

1. Deploy HuaJian_Pay with public HTTPS `APP_URL`.
2. Create/bootstrap merchant `pid` + `key` (env or admin).
3. In newapi payment config:
   - Pay URL / gateway = `APP_URL` (plugin-dependent path)
   - Merchant id = `pid`
   - Key = merchant key
   - Type mapping alipay/wxpay
4. Place a test order; confirm notify reaches newapi and order becomes paid on both sides.

Full screenshot guide: `docs/newapi-integration.md` (after server exists).

---

## 8. Implementation checklist for PayCore

- [ ] MD5 sign helper + unit tests (known vectors)
- [ ] `/submit.php`, `/mapi.php`, `/api.php`
- [ ] REST aliases
- [ ] Order unique constraint + idempotent paid
- [ ] Alipay notify verify + merchant notify worker
- [ ] Admin API skeleton for AdminUI
