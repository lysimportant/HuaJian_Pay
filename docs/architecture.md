# Architecture — HuaJian_Pay

**Status:** locked for MVP (from `docs/planning/findings.md`, 2026-07-25)  
**Repo:** https://github.com/lysimportant/HuaJian_Pay.git

---

## 1. Context

| Item | Value |
| --- | --- |
| Product | HuaJian_Pay |
| Upstream | **newapi** (billing / top-up) |
| Merchant protocol | **YiPay-compatible** (MD5 classic + REST aliases) |
| Channel P0 | **Alipay** Open Platform (precreate QR first) |
| Channel P1 | **WeChat Pay** (adapter + config first; live after Alipay E2E) |
| Operator UX | Configure channel credentials; settlement to bound merchant account |

### Important product truth

“只填支付宝账号就能收款”在**官方开放接口**下对应的是：

- 配置 **支付宝开放平台应用**（`app_id` + RSA2 密钥）
- 到账账户 = 该应用绑定的**商户结算户**
- 可选展示字段 `settle_account_label`（支付宝登录号）仅作运维提示

**不是**任意个人支付宝手机号即可走稳定官方 API。个人码监控等灰产方案不进 MVP。

---

## 2. Stack (locked)

| Layer | Choice |
| --- | --- |
| Runtime | Node.js 20+ / TypeScript |
| HTTP | Fastify |
| DB access | Drizzle ORM |
| DB MVP | SQLite |
| DB prod path | MySQL 8 |
| Admin UI | Vue 3 + Vite + Naive UI (or Element Plus) |
| Notify retry | DB-backed attempts (Redis optional later) |
| Package manager | pnpm |
| Deploy | Docker Compose and/or PM2 + reverse proxy (TLS) |

---

## 3. Repo layout

```text
HuaJian_Pay/
  AGENTS.md
  README.md
  .env.example
  docs/
    structure.md            # FileManager layout map
    architecture.md
    api.md
    deployment.md
    newapi-integration.md
    planning/               # task_plan, findings, progress
    ux/                     # Designer
    briefs/                 # Lead briefs
  apps/
    server/                 # PayCore
    admin/                  # AdminUI
  packages/
    shared/                 # optional sign helpers / types
  scripts/
  data/                     # local SQLite (gitignored content)
  # docker-compose.yml      # later (not in repo yet)
```

---

## 4. Components

```text
                    ┌─────────────┐
   newapi / browser │  Merchant   │
                    └──────┬──────┘
           YiPay sign      │
                    ┌──────▼──────┐
                    │  HTTP API   │  Fastify
                    │ submit/mapi │
                    │ query/admin │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         OrderService  ChannelHub   NotifyWorker
              │            │            │
              │     ┌──────┴──────┐     │
              │     ▼             ▼     │
              │  AlipayAdapter  WeChat  │
              │  (P0)         (later)   │
              │            │            │
              └────────────┼────────────┘
                           ▼
                     SQLite / MySQL
```

1. **HTTP API** — YiPay classic paths + `/api/v1/*`, admin REST  
2. **Order service** — create, pay URL/QR, expire, paid, idempotency  
3. **Channel adapters** — Alipay RSA2 notify; WeChat APIv3 later  
4. **Notify worker** — signed callbacks to merchant `notify_url`, retry  
5. **Admin API + Vue console** — channels, orders, logs, keys  
6. **Storage** — merchants, orders, channels, notify_attempts  

---

## 5. Data model (sketch)

### merchants
- `id`, `pid` (public merchant id), `name`
- `api_key` (secret, hashed or encrypted at rest preferred)
- `status`, `created_at`

### channel_configs
- `id`, `merchant_id` (or platform-global for single-tenant MVP)
- `channel` (`alipay` | `wxpay`)
- `config_json` / encrypted fields: app_id, keys, settle_account_label, …
- `enabled`

### orders
- `id`, `trade_no` (platform), `out_trade_no` (merchant)
- `merchant_id`, `channel`, `name`, `amount_cents` (integer)
- `status` (`pending` | `paid` | `expired` | `closed`)
- `channel_trade_no`, `paid_at`, `notify_status`
- `notify_url`, `return_url`, `param`
- unique `(merchant_id, out_trade_no)`

### notify_attempts
- `id`, `order_id`, `attempt_no`, `http_status`, `response_body`, `next_retry_at`, `created_at`

### admin_users
- `id`, `username`, `password_hash`, `role`

**Money:** store **integer cents** internally; decimal strings only at API edges.

---

## 6. Order lifecycle

```text
create (signed) → pending
    → channel pay (QR / redirect)
    → channel async notify (verified) → paid (once)
    → enqueue merchant notify → notify_ok | notify_retrying
expire job: pending past TTL → expired
```

Rules:
- Paid transitions only forward once (idempotent).
- Channel notify must verify signature, `out_trade_no`, amount, success status.
- Merchant notify body success token: plain `success`.

---

## 7. Security baseline

1. Merchant request: YiPay MD5 sign (pluggable); reject bad sign.  
2. Channel notify: Alipay RSA2 / WeChat APIv3.  
3. Idempotent paid; unique merchant order no.  
4. Persistent notify retries with cap.  
5. Secrets in env / encrypted fields; never log private keys.  
6. Admin auth on all mutations; rate-limit login.  
7. HTTPS in production for notify URLs.  

---

## 8. Env (see `.env.example`)

- `APP_URL`, `APP_SECRET`
- `DB_DRIVER` / `DB_DSN`
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`
- Alipay: `ALIPAY_APP_ID`, keys, notify/return
- WeChat: mch/app/v3 key/certs (later)
- Platform merchant defaults: `PLATFORM_PID`, `PLATFORM_KEY`

---

## 9. Implementation order (PayCore)

1. Repo apps scaffold (`apps/server`) + DB schema + migrate  
2. YiPay sign util + create order + query  
3. Classic routes `/submit.php`, `/mapi.php`, `/api.php` + REST aliases  
4. Alipay precreate + notify verify + paid  
5. Notify worker → merchant  
6. Admin auth + channel config + order list APIs  
7. WeChat adapter stub / feature flag  

---

## 10. Residual risks

See `docs/planning/findings.md` §7. Main product risk: user expectation of pure personal Alipay without merchant app — mitigated by console copy + docs.
