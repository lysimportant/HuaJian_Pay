# Architecture — HuaJian_Pay (locked for MVP)

**Owner:** Planner  
**Status:** Locked 2026-07-25  
**Based on:** `findings.md`

---

## 1. Context

| Item | Value |
| --- | --- |
| Product | HuaJian_Pay |
| Upstream | newapi (merchant / billing caller) |
| Protocol | YiPay-compatible merchant API + modern aliases |
| Channel priority | Alipay (official OpenAPI) → WeChat (adapter ready, implement second) |
| Stack | Node.js 20 + TypeScript + Fastify + Drizzle ORM + SQLite/MySQL + Vue 3 admin |

---

## 2. High-level components

```text
                    ┌──────────────────┐
   newapi / browser │  Merchant API    │  YiPay classic + /api/v1/*
                    │  (sign verify)   │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  Order Service   │  create / query / expire / paid
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
      ┌────────────┐  ┌────────────┐  ┌────────────┐
      │ Alipay     │  │ WeChat     │  │ Manual/QR  │
      │ Adapter    │  │ Adapter    │  │ (optional) │
      └─────┬──────┘  └─────┬──────┘  └────────────┘
            │ notify        │ notify
            └───────┬───────┘
                    ▼
            ┌───────────────┐
            │ Notify Worker │  signed callback → merchant notify_url
            └───────────────┘

   Admin browser ──► Admin API ──► same DB (channels, orders, keys, logs)
```

| Component | Owner | Responsibility |
| --- | --- | --- |
| Merchant HTTP API | PayCore | Create/query orders, classic epay paths, sign verify |
| Order service | PayCore | Lifecycle, idempotency, amount integrity |
| Channel adapters | PayCore | Alipay RSA2, WeChat APIv3 (later) |
| Channel notify ingress | PayCore | Verify channel callbacks, mark paid |
| Merchant notify worker | PayCore | Retry signed POSTs until `success` |
| Admin API | PayCore | Auth, CRUD channels/keys/settings, order/logs read |
| Admin web | AdminUI | Console UX |
| UX system | Designer | Flows / tokens under `docs/ux/` |
| Planning truth | Planner | This file + plan/findings/progress |

---

## 3. Request flows

### 3.1 Create order + pay (happy path)

1. newapi signs request with merchant `key`, calls `submit` / `mapi` / `/api/v1/pay/create`.
2. Platform verifies sign, validates amount/title, inserts order `pending` (unique `pid + out_trade_no`).
3. Order service selects channel adapter by `type` (`alipay` / `wxpay`).
4. Adapter creates channel pre-order (e.g. Alipay `trade.precreate`) → QR URL or pay URL.
5. Response: redirect page, or JSON `{ payurl / qrcode, trade_no }`.
6. User pays in Alipay/WeChat app.
7. Channel async notify → verify → set order `paid` (once) → enqueue merchant notify.
8. Notify worker POSTs YiPay-style form to `notify_url` until body equals `success`.

### 3.2 Query order

- Classic: `/api.php?act=order&pid=&key=&out_trade_no=`
- Modern: `GET /api/v1/order/query?pid=&out_trade_no=&sign=...`
- Response includes `status` (`0` unpaid / `1` paid), amounts, channel trade no.

### 3.3 Admin configure Alipay

1. Admin logs in.
2. Opens Channels → Alipay.
3. Saves `app_id`, RSA keys, optional settle label.
4. System stores secrets encrypted-at-rest or restricted DB column; never returns private key in full after save (mask).
5. Health check endpoint optional: validate key format / app_id presence.

---

## 4. Data model sketch

Internal amounts: **integer cents** (`amount_cents`). Edges accept/display decimal `money`.

### 4.1 Tables (MVP)

#### `merchants`
| Column | Type | Notes |
| --- | --- | --- |
| id | PK | |
| pid | string unique | Public merchant id (e.g. `1000`) |
| name | string | |
| api_key_hash | string | Store hash; compare on sign using raw key from secure field **or** store encrypted raw key for sign (YiPay needs raw key for MD5). **Lock:** store encrypted raw `api_key` (AES-GCM with `APP_SECRET`) for sign compatibility; never log. |
| status | enum | `active` / `disabled` |
| created_at / updated_at | timestamps | |

#### `admin_users`
| Column | Type |
| --- | --- |
| id | PK |
| username | unique |
| password_hash | bcrypt/argon2 |
| created_at | |

#### `channel_configs`
| Column | Type | Notes |
| --- | --- | --- |
| id | PK | |
| channel | enum | `alipay` / `wxpay` |
| enabled | bool | |
| config_json | encrypted text | app_id, keys, serial, etc. |
| settle_label | string nullable | Display-only receive account hint |
| updated_at | | |

#### `orders`
| Column | Type | Notes |
| --- | --- | --- |
| id | PK | |
| trade_no | string unique | Platform order no |
| merchant_id | FK | |
| out_trade_no | string | Unique with merchant_id |
| channel | enum | |
| name | string | |
| amount_cents | int | |
| status | enum | `pending` / `paid` / `expired` / `closed` |
| notify_url | string | |
| return_url | string nullable | |
| param | string nullable | |
| channel_trade_no | string nullable | Alipay/WeChat trade no |
| paid_at | timestamp nullable | |
| expire_at | timestamp nullable | |
| client_ip | string nullable | |
| created_at / updated_at | | |

**Unique index:** `(merchant_id, out_trade_no)`.

#### `notify_attempts`
| Column | Type | Notes |
| --- | --- | --- |
| id | PK | |
| order_id | FK | |
| attempt_no | int | |
| request_url | string | |
| request_body | text | |
| response_body | text nullable | |
| http_status | int nullable | |
| success | bool | true if body trim == `success` |
| next_retry_at | timestamp nullable | |
| created_at | | |

#### `channel_notify_logs`
| Column | Type | Notes |
| --- | --- | --- |
| id | PK | |
| channel | enum | |
| order_id | FK nullable | |
| headers / body | text | Redact secrets |
| verify_ok | bool | |
| created_at | | |

#### `audit_logs` (optional MVP+)
Admin mutations: who/what/when.

---

## 5. Module split (apps)

```text
apps/server/
  src/
    main.ts
    config/env.ts
    db/
      schema.ts
      migrate.ts
    modules/
      merchant-api/     # sign, submit, mapi, query
      orders/
      channels/
        types.ts        # ChannelAdapter interface
        alipay.ts
        wechat.ts       # stub until enabled
      notify/
      admin-api/
      auth/
    workers/
      notify-worker.ts
      expire-worker.ts  # optional

apps/admin/
  src/
    pages/
      Login
      Dashboard
      Channels
      Orders
      NotifyLogs
      ApiKeys / Merchants
      Settings
```

### ChannelAdapter interface (sketch)

```ts
interface ChannelAdapter {
  readonly type: 'alipay' | 'wxpay';
  createPayment(order: Order): Promise<{ payUrl?: string; qrCode?: string; raw?: unknown }>;
  parseAndVerifyNotify(req: IncomingNotify): Promise<NotifyResult>;
  queryChannelOrder?(order: Order): Promise<ChannelQueryResult>;
}
```

---

## 6. Environment & deploy

Use `.env.example` as source of truth. Critical vars:

| Group | Vars |
| --- | --- |
| App | `APP_NAME`, `APP_ENV`, `APP_URL`, `APP_SECRET` |
| DB | `DB_DRIVER=sqlite|mysql`, DSN / host credentials |
| Admin bootstrap | `ADMIN_USERNAME`, `ADMIN_PASSWORD` |
| Alipay | `ALIPAY_*` (or DB-stored via admin UI preferred for multi-channel ops) |
| WeChat | `WECHAT_*` |
| Platform merchant defaults | `PLATFORM_PID`, `PLATFORM_KEY` (bootstrap merchant) |

**Deploy modes:**

1. **Dev:** SQLite file `./data/huajian_pay.db`, `pnpm dev` server + admin.
2. **Prod simple:** Node process (PM2) + reverse proxy TLS + SQLite or MySQL.
3. **Prod compose:** `server` + `mysql` + optional `admin` static via server or nginx.

**Public URL requirement:** Alipay/WeChat notify and merchant callbacks need a stable HTTPS origin (`APP_URL`).

---

## 7. Security architecture

| Control | Implementation |
| --- | --- |
| Merchant request auth | YiPay MD5 sign (lowercase), reject on mismatch |
| Channel callbacks | Official signature verify + amount match + order state machine |
| Idempotent pay | Conditional update `status=pending → paid` only once |
| Key storage | Encrypt channel secrets with `APP_SECRET`; mask in admin API |
| Admin auth | Session cookie (httpOnly, secure in prod) + password hash |
| Transport | HTTPS in production |
| Logging | No private keys / full secrets; redact notify bodies if needed |
| CSRF | SameSite cookies for admin; merchant API is signed not cookie-based |

---

## 8. Compatibility matrix

| Client need | Support |
| --- | --- |
| newapi 易支付插件 base URL | Yes — document base + `pid`/`key` |
| `type=alipay` | MVP |
| `type=wxpay` | Phase 2 (interface in MVP) |
| Response `success` on notify | Yes |
| MD5 sign | Yes (default) |
| RSA merchant sign | Deferred |

---

## 9. Phased delivery (engineering)

| Phase | Tag hint | Scope |
| --- | --- | --- |
| Scaffold | `v0.1.0` | Done |
| Plan lock | `v0.1.1` docs | This architecture + findings |
| Server skeleton | | DB schema, merchant sign, empty adapters |
| Alipay MVP | `v0.2.0` | precreate + notify + merchant notify |
| Admin console | | Channels, orders, logs, keys |
| WeChat | `v0.3.0` | If credentials ready |
| Hardening + newapi guide | `v1.0.0` | E2E, rate limits, docs |

---

## 10. Open items (do not block Alipay MVP)

1. Exact newapi plugin field labels (document after first E2E).
2. Cert mode Alipay vs public-key mode (start public-key RSA2).
3. Redis for notify queue (only if DB worker insufficient).
4. Multi-merchant SaaS packaging.

---

## 11. Handoff notes

- **PayCore:** implement from this doc + `docs/api.md`; Alipay first; no personal-bot collection in MVP.
- **AdminUI:** wire screens to Admin API; Chinese labels OK; mask secrets.
- **Designer:** prioritize “configure Alipay merchant app → test receive → order/notify failure” flows.
- **Lead:** unblock PayCore after this plan is pushed; coordinate tags.
