# HuaJian_Pay — Payment Security Threat Model & Go-Live Checklist

> **Audience:** operators + developers before production traffic.  
> **Stack context:** Node 20+ / Fastify / Drizzle / SQLite MVP / YiPay-compatible MD5 merchant API / Alipay channel (WeChat later) / Admin API.  
> **Related:** `docs/architecture.md`, `docs/api.md`, `docs/deployment.md`, `.env.example`, `apps/server/src/routes/admin.ts`.  
> **Default listen port:** **8080** (see deployment doc). Docker/MySQL are **not** assumed implemented.
>
> **Legend:** **[Implemented]** = true in current code · **[Target]** = go-live control still missing or partial · do not claim Target items as already shipped.

---

## 1. Assets in scope

| Asset | Sensitivity | Notes |
| --- | --- | --- |
| `PLATFORM_KEY` / merchant keys | Critical | MD5 sign material; full order forgery if leaked |
| `APP_SECRET` | Critical | HMAC key for admin Bearer tokens (`signToken` / `verifyToken` in `admin.ts`) |
| Admin password hash | Critical | Bootstrap via `ADMIN_*`; full config + order visibility |
| Admin Bearer token | Critical | HMAC-SHA256 over payload; **12h** `exp`; presented as `Authorization: Bearer <token>` |
| Alipay app private key / certs | Critical | Channel fund movement / notify spoof if mis-handled |
| Order rows (money, status, notify_url) | High | Fraud, refund disputes, SSRF via bad notify_url |
| SQLite file `DB_DSN` | High | Offline dump = full breach |
| Mock pay endpoints | High in prod | Must never be reachable with real money mode |
| Logs / error traces | Medium–High | Must not contain keys, tokens, or full sign strings |

---

## 2. Trust boundaries (current auth model)

```text
[newapi / merchant] --YiPay MD5--> [HuaJian_Pay public API :8080]
                                         |
                    channel RSA2/APIv3   |  outbound form notify (signed)
                                         v
                                  [Alipay / WeChat]
                                         |
[Browser admin SPA]
   |  POST /admin/api/login → JSON { token }
   |  stores token client-side (typically localStorage / memory — SPA; not HttpOnly cookie)
   |  subsequent calls: Authorization: Bearer <HMAC token>
   v
[/admin/api/*] --requireAdmin--> verify HMAC + exp (12h) using APP_SECRET
                                         |
                                  [SQLite / future MySQL]
```

### Current implementation facts (`apps/server/src/routes/admin.ts`)

| Topic | **[Implemented]** behavior |
| --- | --- |
| Login response | JSON body includes `token` (not `Set-Cookie`) |
| Token format | `base64url(JSON payload).HMAC_SHA256(body, APP_SECRET)` (base64url sig) |
| Payload | `{ sub, username, role, exp }` with `exp = now + 12h` |
| API auth | `Authorization: Bearer …` via `getBearer` + `verifyToken` (timing-safe sig compare) |
| Cookies / SameSite | **Not used** for admin session today |

### Client storage residual risk

- Bearer tokens held in SPA storage (e.g. **localStorage**) are readable by any XSS on the admin origin.  
- **[Target]** Prefer memory-only token, or hardened cookie session (`HttpOnly` + `Secure` + `SameSite`) + CSRF strategy if moving away from Bearer-in-storage.

- **Untrusted:** merchant params, channel HTTP bodies, admin login inputs, `notify_url` targets, any client-supplied token string until HMAC+exp verify succeeds.  
- **Trusted only after verify:** merchant `sign`, Alipay notify signature + amount + out_trade_no, admin Bearer after `verifyToken`.  
- **Never trust:** client-supplied “paid” flags without channel/mock authorization rules.

---

## 3. Threat model (STRIDE-style, payment-focused)

| ID | Threat | Example | Impact | Mitigations |
| --- | --- | --- | --- | --- |
| T1 | Spoofed merchant create | Forge MD5 `sign` | Free orders / junk flood | **[Implemented]** sign verify path · **[Target]** rate limit create; strong key ops |
| T2 | Amount tampering | Change `money` after sign / in return | Underpay | **[Implemented/partial]** sign covers money; channel notify must match order · **[Target]** exhaustive mismatch tests in CI |
| T3 | Replay | Resubmit old signed create/notify | Duplicate side effects | **[Implemented/partial]** paid idempotency / unique out_trade_no · **[Target]** notify attempt audit |
| T4 | Fake channel notify | Forged Alipay notify | False paid | **[Target/partial]** RSA2 verify + app_id + trade_status + amount (enable fully for alipay mode) |
| T5 | Mock channel abuse | Call mock-paid in production | False paid | **[Target]** refuse mock routes unless `CHANNEL_MODE=mock`; forbid mock in prod env |
| T6 | Merchant notify SSRF | `notify_url` → link-local / metadata | Cloud credential theft | **[Target]** URL allowlist / block private ranges; timeouts; no open redirects |
| T7 | Notify flood | Spam merchant or platform | DoS | **[Target]** backoff, max attempts, circuit break |
| T8 | Admin auth break | Weak password; **stolen Bearer token** (XSS, shared machine, log leak) | Full admin takeover until **exp (12h)** or `APP_SECRET` rotate | **[Implemented]** password verify; HMAC Bearer; 12h exp; timing-safe sig · **[Target]** strong password policy; login lockout; token revocation list; avoid long-lived localStorage; rotate `APP_SECRET` on incident |
| T9 | Key leakage | Keys/tokens in git, logs, tickets | Total compromise | **[Partial]** `.env.example` only · **[Target]** secret scan CI; redacted logs; never log Bearer |
| T10 | SQLite theft | Copy `data/*.db` | Data breach | **[Target]** FS perms; disk encryption; encrypted backups |
| T11 | XSS in admin | Untrusted order fields → script | **Steal Bearer from localStorage** | **[Target]** CSP; no raw HTML bind; Vue default escaping audit |
| T12 | CSRF on admin mutations | Cross-site browser calls API | **Low for pure Bearer-from-JS pattern** (cookie not auto-sent) · **Risk rises** if auth later moves to cookies without CSRF tokens | **[Implemented]** cookie-less Bearer (no classic cookie CSRF) · **[Target]** if switching to cookies: CSRF token + SameSite; for Bearer: still harden CORS (no `*` + credentials) and XSS (T11) |
| T13 | Dependency RCE | Malicious npm package | Host compromise | **[Target]** lockfile discipline; `pnpm audit`; pin versions |
| T14 | TLS strip | HTTP admin or notify | Token / key MITM | **[Target]** HTTPS only public `APP_URL`; HSTS at proxy |
| T15 | Privilege mix-up | Merchant API hits admin routes | Data leak | **[Implemented/partial]** `/admin/api/*` + `requireAdmin` · **[Target]** regression tests that public routes never accept Bearer as merchant auth |

---

## 4. Control baseline

### 4.1 Secrets & config

| Control | Status |
| --- | --- |
| No prod secrets in git | **[Target]** enforce with scan |
| Production `.env` mode `0600` / secret store | **[Target]** ops |
| `APP_ENV=production` | **[Target]** ops |
| `CHANNEL_MODE` ≠ `mock` on internet prod | **[Target]** ops + code guard |
| `APP_URL` public **https://** | **[Target]** ops |
| Rotate `ADMIN_PASSWORD` from example; ≥ 16 chars | **[Target]** ops |
| High-entropy `PLATFORM_KEY` + rotation runbook | **[Target]** ops |
| Alipay keys + HTTPS notify on owned domain | **[Target]** ops |
| Protect `APP_SECRET` (forges all admin tokens if leaked) | **[Implemented]** used for HMAC · **[Target]** rotation kills outstanding Bearers |

### 4.2 Cryptography & payments

| Control | Status |
| --- | --- |
| Merchant MD5 rules (skip empty/sign; sort; `md5(string+KEY)` lower); timing-safe compare | **[Implemented/partial]** verify against `apps/server` pay sign helpers |
| `money` as consistent decimal string in sign/storage/notify | **[Implemented/partial]** |
| Paid transition idempotent | **[Implemented/partial]** |
| Channel notify: verify signature before paid write | **[Target/partial]** alipay path |
| Amount + out_trade_no bind to local order | **[Implemented/partial]** |
| Mock paid/notify **disabled** unless `CHANNEL_MODE=mock` | **[Target]** hard gate for prod |
| Outbound merchant notify MD5; expect `success` | **[Implemented/partial]** |

### 4.3 HTTP surface

| Control | Status |
| --- | --- |
| TLS at reverse proxy; app on **PORT=8080** private/localhost | **[Target]** ops (`docs/deployment.md`) |
| Security headers / CSP for admin | **[Target]** |
| CORS: not `*` with credentialed admin clients | **[Target]** explicit admin origin allowlist |
| Body size limits | **[Target/partial]** |
| Rate limit login + pay create endpoints | **[Target]** (or edge WAF before go-live) |

### 4.4 Admin auth (**current Bearer model**)

| Control | Status |
| --- | --- |
| Login issues HMAC Bearer, **12h** `exp` | **[Implemented]** `admin.ts` `signToken` / `exp: Date.now() + 12h` |
| Protected routes call `requireAdmin` → Bearer required | **[Implemented]** |
| Timing-safe HMAC compare | **[Implemented]** `timingSafeEqual` on sig |
| **Session cookies / SameSite / Secure cookie flags** | **Not implemented** — do not checklist as done |
| SPA stores token (likely **localStorage**) | **[Assumed client]** treat XSS as token theft |
| Login lockout / progressive delay | **[Target]** |
| Server-side token revoke / logout denylist | **[Target]** (today: wait exp or rotate `APP_SECRET`) |
| Mask merchant keys in list APIs | **[Implemented/partial]** `maskKey` |
| Audit log for channel/key changes | **[Target]** |
| CSRF cookie pattern | **N/A currently**; re-open if cookies introduced |

### 4.5 Data & ops

| Control | Status |
| --- | --- |
| DB file perms + encrypted backups + restore drill | **[Target]** |
| Never log passwords, `PLATFORM_KEY`, Alipay private keys, raw `sign`, **Bearer tokens** | **[Target]** log policy |
| Supervisor restart; disk watch on `data/` | **[Target]** |
| `pnpm audit` (or equiv.) before release | **[Target]** |
| Staging: `pnpm test:mock-e2e` green under mock only | **[Implemented]** script path · **[Target]** CI gate |

### 4.6 newapi integration

| Control | Status |
| --- | --- |
| HTTPS base URL in newapi store | **[Target]** integrator |
| pid/key not hardcoded in public frontend | **[Target]** |
| `notify_url` HTTPS and reachable from platform egress | **[Target]** |
| Sandbox Alipay E2E before prod keys | **[Target]** |

---

## 5. Go-live gate (ordered)

1. **Config freeze:** prod `.env` reviewed (two-person if possible).  
2. **Build:** `pnpm build`; optional `pnpm --filter @huajian/admin build`.  
3. **Staging E2E:** `CHANNEL_MODE=mock` → `pnpm test:mock-e2e` PASS.  
4. **Staging Alipay sandbox:** precreate + notify + merchant notify once.  
5. **§4:** all **[Target]** items labeled **required for go-live** closed or risk-accepted in writing.  
6. **Admin auth check:** confirm production admin UI only sends `Authorization: Bearer`; no accidental token logging; XSS review on admin origin.  
7. **Cutover:** DNS/proxy; `CHANNEL_MODE=alipay`; mock routes unreachable.  
8. **Watch:** 401 spikes, unpaid stuck orders, notify retries, disk.  
9. **Rollback:** previous git tag + DB backup (`docs/deployment.md`).

---

## 6. Incident response (minimal)

| Event | Immediate action |
| --- | --- |
| `PLATFORM_KEY` / Alipay private leak | Rotate keys; reconfigure merchants/channel; audit recent orders |
| **Admin Bearer theft** / XSS | Rotate **`APP_SECRET`** (invalidates all HMAC tokens); force password reset; scrub logs; fix XSS; users must re-login |
| Admin password compromise | Reset password hash; rotate `APP_SECRET` if token also exposed; review channel key views |
| Fake paid orders | Stop channel traffic; reconcile with Alipay bill; invalidate suspect trades |
| SSRF / metadata access | Block egress; patch URL validator; rotate cloud creds if any |

> **Note:** There is **no** server-side session store to “clear cookies”. Invalidation = **`APP_SECRET` rotation** and/or waiting out **12h** `exp`, until a revoke list is **[Target]** implemented.

---

## 7. Explicit non-goals / residual risk (MVP)

- YiPay **MD5** compatibility is legacy-weak; residual forgery if keys short — long keys + rate limits; plan stronger MAC later.  
- **Bearer + localStorage** is XSS-equivalent-to-session-theft; cookie `HttpOnly` is **not** a current control.  
- SQLite not multi-AZ HA.  
- Docker/MySQL hardening N/A until those paths exist.  
- WeChat not go-live until adapter + verify complete.  
- No card data (out of PCI SAQ scope for cards); still protect order PII fields.

---

## 8. Document history

| Date | Change |
| --- | --- |
| 2026-07-25 | Initial threat model + go-live checklist. |
| 2026-07-25 | **Accuracy fix:** admin auth = `Authorization: Bearer` HMAC token (12h) per `admin.ts`, not session cookie. T8/T12, trust boundary, admin checklist, incident response rewritten. **[Implemented]** vs **[Target]** labels throughout. |
