# Findings — HuaJian_Pay architecture & channel feasibility

**Owner:** Planner  
**Date:** 2026-07-25  
**Status:** locked for MVP planning (implementation still pending)

---

## 1. Requirements (captured)

| Item | Decision / note |
| --- | --- |
| Product | HuaJian_Pay |
| Upstream caller | **newapi** (billing / top-up style) |
| Protocol target | **YiPay-compatible** merchant API where practical |
| MVP channel | **Alipay** — configure credentials → receive money |
| Secondary | **WeChat Pay** if same receive effect is realistic |
| Non-goals v1 | Multi-currency, crypto, heavy multi-tenant SaaS |

---

## 2. YiPay-style API conventions (newapi-friendly)

Open-source YiPay / epay-class gateways and most newapi “易支付” payment plugins share the same merchant contract.

### 2.1 Common merchant parameters (create / submit)

| Field | Required | Meaning |
| --- | --- | --- |
| `pid` | yes | Merchant / platform ID (numeric string) |
| `type` | yes* | Channel: `alipay` / `wxpay` (and optionally `qqpay`) |
| `out_trade_no` | yes | Merchant order number (unique per merchant) |
| `notify_url` | yes | Async server callback URL |
| `return_url` | no* | Browser return URL after pay |
| `name` | yes | Product / order title |
| `money` | yes | Amount as decimal string, e.g. `1.00` |
| `sitename` | no | Site display name |
| `param` | no | Merchant attach string (echoed on notify) |
| `sign` | yes | Signature |
| `sign_type` | yes | Usually `MD5` |

\*Page submit may omit `type` if only one channel; mapi/API style usually requires it.

### 2.2 Signature pattern (classic YiPay MD5)

1. Collect all non-empty parameters except `sign` and `sign_type`.
2. Sort keys by ASCII ascending.
3. Build query string: `k1=v1&k2=v2&...` (no URL-encoding for sign source in classic PHP epay).
4. Append merchant secret: `stringSignTemp + KEY` (direct concat, **no** `&key=`).
5. `sign = md5(stringSignTemp + KEY)` → **lowercase hex**.
6. Verify notify the same way; response body to platform must be plain text `success` (case-sensitive in most clones).

**Residual risk:** some forks use `RSA` or uppercase MD5; newapi plugins overwhelmingly expect **MD5 lowercase + key append**. Implement MD5 first; keep sign algorithm pluggable.

### 2.3 Endpoints newapi typically points at

| Style | Path pattern | Use |
| --- | --- | --- |
| Page pay | `GET/POST /submit.php` | Browser redirect pay |
| API / mapi | `POST /mapi.php` or `/api/pay/create` | JSON or form create → pay URL / QR |
| Query | `GET /api.php?act=order&pid=&key=&out_trade_no=` | Order status |
| Notify ingress | merchant `notify_url` | **Outbound from us** to newapi |

**HuaJian_Pay recommendation:**

- Implement **both** YiPay-classic paths **and** clean REST aliases:
  - Classic: `/submit.php`, `/mapi.php`, `/api.php`
  - Modern: `/api/v1/pay/submit`, `/api/v1/pay/create`, `/api/v1/order/query`
- Same sign rules on both so newapi can use either base URL.

### 2.4 Async notify payload (to merchant / newapi)

Typical fields returned (form POST or query):

| Field | Notes |
| --- | --- |
| `pid` | Platform merchant id |
| `trade_no` | Platform order no |
| `out_trade_no` | Merchant order no |
| `type` | Channel type |
| `name` | Product name |
| `money` | Paid amount (must match order) |
| `trade_status` | `TRADE_SUCCESS` |
| `param` | Echo attach |
| `sign` / `sign_type` | Same MD5 scheme |

Merchant (newapi) must reply body `success`. Retry with exponential backoff on non-success.

### 2.5 newapi integration notes

newapi payment config generally needs:

1. Payment gateway base URL (HuaJian_Pay public origin)
2. `pid` + merchant `key`
3. Channel type mapping (`alipay` / `wxpay`)
4. Publicly reachable `notify_url` on newapi side (newapi provides this when creating orders)

**Doc deliverable for later:** `docs/newapi-integration.md` with screenshot-level field mapping (PayCore / Lead after API exists).

---

## 3. Alipay — realistic “fill account → receive” options

### 3.1 What users think “填支付宝账号收款” means

| Interpretation | Officially supported? | MVP? |
| --- | --- | --- |
| A. Fill **personal Alipay login** (phone/email) and auto-receive via open API | **No** reliable open API for arbitrary personal inbox without merchant product | No (production) |
| B. Fill **merchant open-platform credentials**; settlement lands on bound Alipay merchant account | **Yes** (OpenAPI products) | **Yes — primary** |
| C. Personal收款码 + amount/remark monitoring | Grey / fragile / ToS risk | Optional experimental only |
| D. Manual transfer assist page (show account + amount, admin marks paid) | Works but not auto | Fallback ops mode |

### 3.2 Recommended Alipay path (MVP lock)

**Use Alipay Open Platform merchant application** with one or more of:

| Product | Scenario | Priority |
| --- | --- | --- |
| **订单码 / 当面付 precreate** (`alipay.trade.precreate`) | Show QR, user scans with Alipay app | **P0** |
| **手机网站支付** (`alipay.trade.wap.pay`) | Mobile H5 redirect | P1 |
| **电脑网站支付** (`alipay.trade.page.pay`) | PC redirect | P1 |

**Console “Alipay account” form fields (MVP):**

| Field | Required | Purpose |
| --- | --- | --- |
| `app_id` | yes | Open platform app id |
| `merchant_private_key` | yes | App RSA2 private key |
| `alipay_public_key` | yes | Alipay public key (or cert mode later) |
| `settle_account_label` | no | Display-only Alipay login/account for ops |
| `notify_url` (platform) | system | Our public `/channels/alipay/notify` |
| Sign type | default `RSA2` | |

**Money flow:** User pays via official product → Alipay settles to the **merchant account bound to that APPID** (not an arbitrary third-party personal account injected only as free text).

**UX copy guidance:** Label form as “支付宝商户应用配置”, optional subtitle “到账账户以支付宝开放平台绑定结算户为准”; show `settle_account_label` only as human hint.

### 3.3 Rejected / deferred for MVP

- **Personal auto-collection bots** (monitor bill / email / QR OCR): high ban risk, unstable, not YiPay-professional; document under “experimental adapters” only if owner insists later.
- **ISV service provider multi-merchant authorize:** too heavy for v1.

### 3.4 Alipay adapter responsibilities (for PayCore)

1. Create platform order → call precreate/page pay → store channel trade no.
2. Verify Alipay async notify (RSA2, app_id, out_trade_no, total_amount, trade_status).
3. Idempotent transition `pending → paid`.
4. Enqueue merchant notify (YiPay-style sign to newapi).
5. Never trust client-side “I paid” alone.

---

## 4. WeChat Pay feasibility

### 4.1 Official path

| Credential | Required |
| --- | --- |
| `mch_id` | WeChat merchant id |
| `app_id` | Bound app / MP / mini program |
| `api_v3_key` | APIv3 key |
| Merchant private key + certificate serial | APIv3 request sign |
| Platform cert / public key | Notify verify |
| `notify_url` | HTTPS public |

**Products useful for collection:**

| Product | Notes | MVP priority |
| --- | --- | --- |
| **Native** (扫码) | QR for PC/web | **P0 if WeChat enabled** |
| **H5** | Mobile browser (domain whitelist) | P1 |
| **JSAPI** | WeChat in-app (openid required) | P2 |

Settlement: to **WeChat merchant account**, not arbitrary personal WeChat ID typed alone.

### 4.2 Feasibility verdict

| Goal | Verdict |
| --- | --- |
| Same architecture as Alipay (channel adapter + notify + YiPay `type=wxpay`) | **Yes** |
| “Only fill WeChat phone/ID and receive via official API” | **No** |
| MVP same release as Alipay | **Optional** — implement **adapter interface + config UI** in MVP; ship live WeChat after Alipay E2E green |
| Personal收款码 monitor | Same grey-area as Alipay personal; not MVP |

**Lock:** Design `ChannelAdapter` for WeChat now; implement production WeChat after Alipay path is verified. Do not block Alipay MVP on WeChat merchant onboarding.

---

## 5. Recommended tech stack (simple deploy)

### 5.1 Locked recommendation

| Layer | Choice | Why |
| --- | --- | --- |
| Language | **TypeScript (Node.js 20+)** | One language for API + shared types; AdminUI handoff easy; fast MVP |
| HTTP framework | **Fastify** | Fast, schema validation, solid plugin ecosystem |
| ORM / DB access | **Drizzle ORM** (or Prisma if team prefers) | Typed SQL, SQLite→MySQL path |
| Primary DB (MVP) | **SQLite** (`DB_DRIVER=sqlite`) | Zero ops for solo deploy |
| Production DB | **MySQL 8** | When concurrency / multi-instance needed |
| Admin UI | **Vue 3 + Vite + Naive UI** (or Element Plus) | Chinese admin ecosystem, Designer tokens easy to apply |
| Auth (admin) | Session cookie + bcrypt password (MVP); API keys for merchants | Simple |
| Queue / retry | **DB-backed notify attempts** first; Redis optional later | Fewer moving parts |
| Process | `pnpm` monorepo or single repo `apps/server` + `apps/admin` | Clear ownership |
| Deploy | **Docker Compose** (server + optional mysql) **or** single Node process + PM2 | Windows/Linux friendly |
| Reverse proxy | Caddy / Nginx TLS termination | Required for real Alipay/WeChat notify |

### 5.2 Alternatives considered

| Stack | Pros | Cons | Decision |
| --- | --- | --- | --- |
| PHP (Laravel / thin epay fork) | Closest to classic YiPay hosts | Weaker shared typing with modern admin; easier secret footguns | Reject as primary |
| Go (chi/gin) + Vue | Single binary, great concurrency | Split language with AdminUI; slightly slower full-stack iteration | **Backup** if Node ops issues |
| Python FastAPI | Fast to prototype | Weaker “drop-in epay host” culture here | Reject |

### 5.3 Repo layout (locked sketch)

```text
HuaJian_Pay/
  AGENTS.md
  README.md
  task_plan.md
  findings.md
  progress.md
  .env.example
  docs/
    architecture.md
    api.md
    newapi-integration.md   # later
    ux/                     # Designer
  apps/
    server/                 # PayCore — Fastify API + workers
    admin/                  # AdminUI — Vue3
  packages/
    shared/                 # sign helpers types, constants (optional)
  scripts/
  docker-compose.yml        # later
```

---

## 6. Security baseline (planning)

1. **Merchant sign:** YiPay MD5 (pluggable); reject bad sign before order create.
2. **Channel notify:** verify Alipay RSA2 / WeChat APIv3; check amount + out_trade_no + status.
3. **Idempotency:** unique `(merchant_id, out_trade_no)`; paid status only transitions forward once.
4. **Notify retry:** persistent attempts table; cap retries; mark `notify_status`.
5. **Secrets:** env / encrypted DB fields for channel keys; never log private keys.
6. **Admin:** auth on all mutations; rate-limit login.
7. **Amount:** store minor units (integer cents) internally; format decimal only at edges.
8. **HTTPS** required in production for all notify URLs.

---

## 7. Residual risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| newapi plugin expects exact `/submit.php` quirks | Integration friction | Ship classic paths + compatibility tests |
| Owner expects pure personal Alipay without merchant app | Cannot use official API | Clear UX + docs; optional manual/QR experimental later |
| WeChat domain / product qualification delay | Channel slip | Alipay-first; WeChat behind feature flag |
| SQLite write lock under notify storm | Rare paid-but-slow notify | Single writer, short transactions; MySQL upgrade path |
| MD5 YiPay is weak crypto | Theoretical | Accept for compatibility; bind to TLS + IP allowlist optional |
| Regulatory / merchant KYC | Ops | Out of software scope; document operator responsibility |

---

## 8. Decisions summary (for teammates)

| Decision | Value |
| --- | --- |
| Stack | Node.js 20 + TypeScript + Fastify + Drizzle + SQLite/MySQL + Vue3 admin |
| Alipay MVP | Official OpenAPI (precreate QR first), credentials form not “personal only” |
| WeChat | Interface + config in design; implement after Alipay E2E |
| Merchant API | YiPay MD5 classic + modern REST aliases |
| Money storage | Integer cents |
| Notify | DB-backed retry worker |
| Deploy | Docker Compose / PM2, TLS reverse proxy |

---

## Resources

- Repo: https://github.com/lysimportant/HuaJian_Pay.git
- Workspace: `D:\pay\HuaJian_Pay`
- Upstream product context: newapi billing integration via YiPay-style gateway
- Alipay Open Platform docs (operator must register app & products)
- WeChat Pay APIv3 docs (merchant platform)
