# HuaJian_Pay — Payment Security Threat Model & Go-Live Checklist

> **Audience:** operators + developers before production traffic.  
> **Stack context:** Node 20+ / Fastify / Drizzle / SQLite MVP / YiPay-compatible MD5 merchant API / Alipay channel (WeChat later) / Admin session API.  
> **Related:** `docs/architecture.md`, `docs/api.md`, `docs/deployment.md`, `.env.example`.  
> **Default listen port:** **8080** (see deployment doc). Docker/MySQL are **not** assumed implemented.

---

## 1. Assets in scope

| Asset | Sensitivity | Notes |
| --- | --- | --- |
| `PLATFORM_KEY` / merchant keys | Critical | MD5 sign material; full order forgery if leaked |
| `APP_SECRET` | Critical | App crypto / session material |
| Admin password | Critical | Full config + order visibility |
| Alipay app private key / certs | Critical | Channel fund movement / notify spoof if mis-handled |
| Order rows (money, status, notify_url) | High | Fraud, refund disputes, SSRF via bad notify_url |
| SQLite file `DB_DSN` | High | Offline dump = full breach |
| Mock pay endpoints | High in prod | Must never be reachable with real money mode |
| Logs / error traces | Medium–High | Must not contain keys or full sign strings |

---

## 2. Trust boundaries

```text
[newapi / merchant] --YiPay MD5--> [HuaJian_Pay public API :8080]
                                         |
                    channel RSA2/APIv3   |  outbound form notify (signed)
                                         v
                                  [Alipay / WeChat]
                                         |
[Browser admin] --session cookie--> [/admin/api/*]
                                         |
                                  [SQLite / future MySQL]
```

- **Untrusted:** all merchant params, channel HTTP bodies, admin login inputs, `notify_url` targets.  
- **Trusted only after verify:** merchant `sign`, Alipay notify signature + amount + out_trade_no, admin session.  
- **Never trust:** client-supplied “paid” flags without channel/mock authorization rules.

---

## 3. Threat model (STRIDE-style, payment-focused)

| ID | Threat | Example | Impact | Mitigations (required / target) |
| --- | --- | --- | --- | --- |
| T1 | Spoofed merchant create | Attacker guesses/forges MD5 `sign` | Free orders / junk flood | Strong `PLATFORM_KEY`; reject bad sign; constant-time compare; rate limit create |
| T2 | Amount tampering | Change `money` after sign or in channel return | Underpay | Sign covers `money`; channel notify amount must match order; refuse mismatch |
| T3 | Replay | Resubmit old signed create/notify | Duplicate side effects | Idempotent pay mark; unique `out_trade_no` per merchant; notify attempt log |
| T4 | Fake channel notify | POST forged Alipay notify | False paid → merchant credit | RSA2 verify; app_id check; trade_status allowlist; amount match |
| T5 | Mock channel abuse | Call mock-paid in production | False paid without money | `CHANNEL_MODE=mock` forbidden in prod; disable mock routes unless mock mode |
| T6 | Merchant notify SSRF | `notify_url` → internal metadata IP | Cloud credential theft | URL allowlist/block private ranges; timeouts; no redirect follow (or strict) |
| T7 | Notify brute / spam | Flood merchant or platform | DoS | Backoff retries; cap attempts; circuit break bad hosts |
| T8 | Admin auth break | Weak password, session fixation | Full takeover | Strong admin password; secure cookies (`Secure`/`HttpOnly`/`SameSite`); lockout |
| T9 | Key leakage | Keys in git, logs, support tickets | Total compromise | `.env` gitignored; redacted logs; secret manager later |
| T10 | SQLite theft | Copy `data/*.db` from disk | Data + key material if stored | FS permissions; encrypt disk; backups encrypted |
| T11 | XSS in admin | Stored order fields into UI | Session theft | Vue escaping; CSP; no `v-html` on untrusted fields |
| T12 | CSRF on admin | Cross-site state change | Config/key rotate abuse | SameSite cookies + CSRF token on mutations (target) |
| T13 | Dependency RCE | Malicious npm package | Host compromise | Lockfile; `pnpm audit`; pin versions; minimal prod deps |
| T14 | TLS strip | HTTP notify/URLs | MITM keys & cookies | HTTPS only public `APP_URL`; HSTS at proxy |
| T15 | Privilege mix-up | Merchant API hits admin routes | Data leak | Separate route prefixes; auth middleware on all `/admin/api/*` |

---

## 4. Control baseline (must for go-live)

### 4.1 Secrets & config

- [ ] No secrets in git history for release branch (scan `APP_SECRET`, `PLATFORM_KEY`, Alipay private key).  
- [ ] Production `.env` only on host / secret store; mode `0600` (or equivalent).  
- [ ] `APP_ENV=production`.  
- [ ] `CHANNEL_MODE=alipay` (or future wechat) — **never `mock`** on internet-facing prod.  
- [ ] `APP_URL` is public **https://** origin matching reverse proxy.  
- [ ] `ADMIN_PASSWORD` rotated from example; length ≥ 16; unique.  
- [ ] `PLATFORM_KEY` high entropy; rotate procedure documented.  
- [ ] Alipay keys from open platform; notify URL HTTPS and owned domain.

### 4.2 Cryptography & payments

- [ ] Merchant MD5: exclude empty/`sign`/`sign_type`; ASCII sort; `md5(string + KEY)` **lowercase**; verify with timing-safe compare.  
- [ ] `money` normalized as decimal string (e.g. `1.00`) consistently in sign + storage + notify.  
- [ ] Paid transition **idempotent** (second notify = success, no double credit).  
- [ ] Channel notify: verify signature **before** any DB paid write.  
- [ ] Amount and `out_trade_no` / trade_no binding checked against local order.  
- [ ] Mock paid / mock notify endpoints **disabled** when not `CHANNEL_MODE=mock`.  
- [ ] Outbound merchant notify signed with same MD5 rules; require body `success`.

### 4.3 HTTP surface

- [ ] Reverse proxy TLS; app may bind `HOST=0.0.0.0` **PORT=8080** only on private interface or localhost behind proxy.  
- [ ] Security headers at proxy or app: `X-Content-Type-Options`, `Referrer-Policy`, minimal CSP for admin.  
- [ ] CORS: admin and API not `*` with credentials.  
- [ ] Request body size limits (proxy + Fastify).  
- [ ] Rate limit: `/admin/api/login`, `/submit.php`, `/mapi.php`, `/api/v1/pay/*` (target if not yet coded — block go-live until basic limit exists or edge WAF).  

### 4.4 Admin

- [ ] All `/admin/api/*` except login require session.  
- [ ] Session cookie: `HttpOnly`, `Secure` (prod), `SameSite=Lax` or `Strict`.  
- [ ] Login lockout / delay after N failures.  
- [ ] No merchant keys returned in full after create (show once + rotate).  
- [ ] Audit log for channel config changes and key rotation (target).

### 4.5 Data & ops

- [ ] DB file permissions; automated encrypted backups; tested restore.  
- [ ] Log redaction: never log raw `sign`, keys, Authorization, full Alipay private key, passwords.  
- [ ] Process supervisor restart; disk watch on `data/`.  
- [ ] Dependency audit before release (`pnpm audit` or equivalent).  
- [ ] `pnpm test:mock-e2e` green on RC **in staging only** (mock mode).  

### 4.6 newapi integration

- [ ] newapi store uses HTTPS base URL.  
- [ ] pid/key from admin, not hardcoded in public frontend.  
- [ ] newapi `notify_url` reachable from HuaJian_Pay egress; HTTPS.  
- [ ] End-to-end test with **sandbox** Alipay before production keys.

---

## 5. Go-live gate (ordered)

1. **Config freeze:** prod `.env` reviewed by two people if possible.  
2. **Build:** `pnpm build` (server); optional `pnpm --filter @huajian/admin build`.  
3. **Staging E2E:** `CHANNEL_MODE=mock` → `pnpm test:mock-e2e` PASS.  
4. **Staging Alipay sandbox:** real precreate + notify + merchant notify once.  
5. **Security checklist §4** all **required** boxes checked.  
6. **Cutover:** point DNS/proxy; `CHANNEL_MODE=alipay`; disable mock.  
7. **Watch:** error rate, unpaid stuck orders, notify retry queue, disk.  
8. **Rollback plan:** previous git tag + DB backup restore (see `docs/deployment.md`).

---

## 6. Incident response (minimal)

| Event | Immediate action |
| --- | --- |
| Key leak (`PLATFORM_KEY` / Alipay private) | Rotate key; invalidate sessions; re-sign config; audit recent orders |
| Fake paid orders | Stop channel traffic; invalidate suspect trades; reconcile with Alipay bill |
| Admin compromise | Disable admin user; rotate `APP_SECRET`/password; review channel keys |
| SSRF / metadata access | Block egress; patch URL validator; rotate cloud creds if any |

---

## 7. Explicit non-goals / residual risk (MVP)

- MD5 YiPay compatibility is **legacy-weak** by modern standards; residual forgery risk if keys are short — mitigate with key length + rate limits, plan HMAC upgrade later.  
- SQLite single-file not multi-AZ HA.  
- Docker/MySQL hardening N/A until those deploy paths exist (`docs/deployment.md` §6).  
- WeChat not go-live until adapter + verify path complete.  
- Full PCI scope avoided by not storing card data; still protect PII in order `name`/`param`.

---

## 8. Document history

| Date | Change |
| --- | --- |
| 2026-07-25 | Initial threat model + go-live checklist after deployment.md correction (`5146976` lineage). |
