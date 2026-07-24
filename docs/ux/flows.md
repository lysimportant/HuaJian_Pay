# HuaJian_Pay — Critical UX Flows

**Product:** HuaJian_Pay (YiPay-style collection for newapi)  
**Audience:** AdminUI implementers, product reviewers  
**Scope:** MVP — Alipay receive first; WeChat optional with same UX pattern  
**Labels:** Chinese UI copy OK; identifiers English

---

## 0. Personas & goals

| Persona | Goal | Primary success |
| --- | --- | --- |
| **Operator / Admin** | Run platform, manage merchants & system | Stable channels, visible failures |
| **Merchant** | Configure receive account, collect via API | Money lands; orders & notifies clear |
| **Payer (end user)** | Pay quickly and know result | Pay page / QR → success / fail clarity |
| **Upstream (newapi)** | Create order, get async notify | Signed notify + queryable status |

---

## 1. Flow A — Configure Alipay → receive money

**Intent:** Merchant (or operator) binds Alipay credentials so subsequent orders can settle to that account.

### Entry
- Nav: **通道配置 / Channels** → **支付宝 / Alipay**
- Empty state CTA: 「配置支付宝收款」

### Steps

```text
[Channels list]
    → [Alipay channel detail / setup wizard]
        1. Choose mode (if multiple supported):
           - Official merchant API (app_id + private key + public key / cert)
           - Other receive mode (only if Planner/PayCore enables)
        2. Fill credentials form
        3. Optional: set notify domain / default return
        4. Save (client validate → API)
        5. Connection test (optional but recommended)
        6. Enable channel toggle
    → Success toast + status badge: 已启用 / 未启用 / 校验失败
```

### Form fields (UX notes)

| Field (UI label) | Key | Required | Notes |
| --- | --- | --- | --- |
| 应用 AppId | `app_id` | Yes* | Mask edit after save |
| 商户私钥 | `private_key` | Yes* | Password-style input; never echo full after save |
| 支付宝公钥 / 证书 | `alipay_public_key` / cert upload | Yes* | Mode-dependent |
| 收款账号备注 | `account_note` | No | Human label only |
| 沙箱模式 | `sandbox` | No | Toggle; warn if prod orders with sandbox |
| 启用 | `enabled` | — | Separate from “saved” |

\*Exact set follows PayCore channel adapter; hide unused fields.

### States

| State | UI |
| --- | --- |
| Never configured | Empty state + primary CTA |
| Draft invalid | Inline field errors; Save disabled until fixed |
| Saved disabled | Badge 已保存未启用; secondary 「启用」 |
| Enabled healthy | Badge 已启用 + last test time |
| Enabled unhealthy | Badge 异常 + error summary + 「重新校验」 |
| Secret rotation | 「更换密钥」 opens confirm; blanks secret fields |

### Success criteria
- Channel row shows **支付宝 · 已启用**
- Merchant can create a test order and complete pay path (Flow B)
- Secrets never shown in full after save (only last 4 / “已配置”)

### Errors
- Validation: missing AppId / key format
- Test fail: show PayCore error code + short Chinese message + 「查看日志」
- Permission: non-owner cannot edit another merchant’s channel

### Exit
- Back to channel list, or deep-link to **创建测试订单**

---

## 2. Flow B — Create order → pay → notify success

**Intent:** Upstream (newapi) or console creates an order; payer pays; platform marks success and notifies merchant.

### 2.1 Create order (API / console)

```text
[Upstream newapi or Console "创建订单"]
    → POST create-order (pid, out_trade_no, money, name, notify_url, return_url, type=alipay, sign...)
    → Platform validates sign + merchant + channel enabled
    → Order status: created / pending_pay
    → Response: order_no + pay_url (or QR content)
```

**Console path (manual test):**
1. Orders → 「创建测试订单」
2. Amount, subject, channel, optional notify_url override
3. Submit → show pay_url + QR + copy buttons

### 2.2 Pay

```text
[Payer opens pay_url]
    → Pay landing page
        - Order subject, amount (large), countdown if expire_at set
        - Channel brand (支付宝)
        - Primary: open Alipay / show QR
        - Secondary: 「我已完成支付」 → poll status
    → Redirect or app pay
    → Channel async callback to platform
    → Platform: verify → amount match → status = success (idempotent)
    → Enqueue merchant notify
```

### 2.3 Merchant notify success

```text
[Notify worker]
    → POST merchant notify_url (YiPay-style fields + sign)
    → Expect success body (e.g. `success`)
    → Mark notify_status = success
    → Order detail shows: 支付成功 · 通知成功
```

### Order status model (UI)

| Status | Chinese | Color intent |
| --- | --- | --- |
| `created` / `pending` | 待支付 | Neutral / amber |
| `paying` | 支付中 | Blue |
| `success` | 已支付 | Green |
| `failed` | 支付失败 | Red |
| `expired` | 已过期 | Gray |
| `closed` | 已关闭 | Gray |

Notify sub-status: `none` | `pending` | `success` | `failed` (with attempt count).

### Pay page UX rules
- Amount is the visual hero (tabular nums, clear currency 元)
- No secret leakage; no admin chrome on pay page
- Mobile-first; QR large enough to scan
- After success: show checkmark + optional return_url button 「返回商户」
- Prefer reduced motion for status spinners when `prefers-reduced-motion`

### Success criteria
- Order → 已支付
- Notify log → 成功 (or retrying with visible next attempt)
- Query API returns success consistently

---

## 3. Flow C — Order lookup / status

**Intent:** Merchant or admin finds an order and understands payment + notify state.

### Entry
- Nav: **订单 / Orders**
- Global search (header): order_no / out_trade_no / merchant

### List

| Column | Notes |
| --- | --- |
| 平台订单号 | Monospace; copy |
| 商户订单号 | out_trade_no; copy |
| 商户 | Admin only |
| 金额 | Right-aligned |
| 通道 | Alipay / WeChat badges |
| 支付状态 | Status pill |
| 通知状态 | Pill + attempts |
| 创建时间 | Default sort desc |
| 操作 | 详情 |

**Filters:** status, channel, date range, merchant (admin), amount range  
**Empty:** illustration + 「暂无订单」; if filters active, 「清除筛选」

### Detail

Sections:
1. **Summary strip** — amount, pay status, notify status, channel
2. **Identifiers** — order_no, out_trade_no, trade_no (channel)
3. **Timeline** — created → pay started → paid → notify attempts
4. **Notify log** — expandable rows (HTTP code, body snippet, latency)
5. **Actions** (permissioned):
   - 同步通道状态 (if adapter supports query)
   - 重发通知 (only when paid and notify not success / manual force)
   - 关闭订单 (only unpaid)

### Query UX (merchant self-serve)
- Simple search box: paste platform or merchant order no → detail
- API docs link for programmatic query (for newapi)

### Success criteria
- Any order reachable in ≤ 2 clicks from list or 1 search
- Status language consistent with Flow B table

---

## 4. Flow D — Notify failure & retry visibility

**Intent:** When merchant `notify_url` fails, operator/merchant can see why and recover without guessing.

### Trigger
- Notify worker receives non-success response, timeout, or network error
- Order already `success` (money received) but notify_status ≠ success

### UI surfaces

1. **Orders list** — notify pill: 通知失败 (red) / 重试中 (amber)
2. **Order detail → Notify panel**
   - Last error summary (Chinese + raw code)
   - Attempt history table: #, time, HTTP status, response preview, duration
   - Next retry at (if scheduled)
   - CTA: **立即重发**
3. **Dashboard widget** — count of “支付成功但通知失败” (actionable)
4. **Optional alerts** — badge on Orders nav item

### Retry interaction

```text
[重发通知]
    → Confirm dialog: explain idempotent merchant-side handling needed
    → API enqueue
    → Optimistic: notify_status = pending; toast 「已加入重试队列」
    → Poll or websocket refresh attempt list
    → Success → green; Fail → keep history + error
```

### Rules
- Never imply money was refunded when only notify failed
- Distinguish **支付失败** vs **通知失败** in copy and color
- Cap visible response body (truncate + expand); no secrets in logs UI
- Rate-limit manual resend (disable button briefly after click)

### Success criteria
- Failed notify is obvious without opening every order
- Manual resend path ≤ 2 clicks from list row

---

## 5. Flow E — Optional WeChat channel setup

**Intent:** Same mental model as Alipay: configure credentials → enable → receive.

### Entry
- Channels → **微信支付 / WeChat Pay**
- If not enabled in build: show 「即将支持」 disabled card (do not dead-end nav)

### Steps (mirror Flow A)

```text
[WeChat setup]
    1. Credential mode (mch_id, app_id, api_v3_key, cert/serial as PayCore defines)
    2. Save secrets (masked)
    3. Test / enable
    4. Create test order with type=wxpay
```

### UX parity checklist
- [ ] Same list layout and badges as Alipay
- [ ] Same enable / test / rotate secret patterns
- [ ] Pay page uses WeChat green accent only on channel chip, not whole app theme
- [ ] Orders filter includes WeChat
- [ ] Notify failure flow identical

### Fallback copy (infeasible)
> 当前环境暂不支持微信支付收款，请使用支付宝通道。  
> CTA: 配置支付宝

---

## 6. Cross-cutting flows

### 6.1 Auth
- Login → session → redirect intended URL
- Unauthenticated console routes → login
- Pay pages: **public**, no admin session required

### 6.2 API credentials (merchant)
- Settings → API：pid display, key show-once / rotate with confirm
- Copy buttons; warn on rotate (upstream must update)

### 6.3 First-run checklist (dashboard)
1. 配置支付宝通道  
2. 获取 API 凭证  
3. 创建测试订单  
4. 确认通知成功  

Mark steps done as state changes; keep dismissible.

---

## 7. Edge cases & copy principles

| Situation | Guidance |
| --- | --- |
| Double notify | UI shows multiple success attempts OK; status stays success |
| Pay success, user closes page | return_url best-effort; order still success via callback |
| Expired while paying | Pay page: 订单已过期; no pay CTA |
| Channel disabled mid-flight | New orders blocked; in-flight follow PayCore rules; show reason on create fail |
| Partial form save | Don’t enable channel until required secrets present |

**Copy tone:** calm, precise, payment-safe. Prefer 「通知商户失败，资金状态以支付结果为准」 over alarming refund language.

---

## 8. Implementation handoff (AdminUI)

| Priority | Screen / piece | Flow |
| --- | --- | --- |
| P0 | Channel Alipay setup | A |
| P0 | Orders list + detail | C |
| P0 | Pay landing (minimal) | B |
| P0 | Notify failure + resend | D |
| P1 | Dashboard checklist + failed-notify widget | A/B/D |
| P1 | API credentials | cross |
| P2 | WeChat setup parity | E |
| P2 | Advanced filters / export | C |

See also: `docs/ux/ia.md`, `docs/ux/visual-system.md`.
