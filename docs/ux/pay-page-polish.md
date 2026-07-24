# Public Pay Page — Visual & State Specification

**Product:** HuaJian_Pay  
**Audience:** Frontend implementers (AdminUI / dedicated pay surface)  
**Related:** `docs/ux/flows.md` §Flow B, `docs/ux/visual-system.md`, `docs/ux/ia.md`  
**Scope:** Public payer-facing pay + result pages only (no admin chrome)  
**Labels:** Chinese UI copy OK; routes/ids English

---

## 1. Goals

| Goal | Success signal |
| --- | --- |
| Payer understands **how much** and **what** they pay in &lt; 2 seconds | Amount is visual hero; subject secondary |
| QR / open-app path is obvious | Primary pay affordance above the fold on mobile |
| Status is unambiguous | Distinct success / expired / error / paying states |
| Channel trust without rebranding whole page | Alipay / WeChat **chips only** |
| Accessible and calm | Contrast, focus, reduced motion, no emoji icons |

**Non-goals:** Admin nav, merchant notify UI, secret display, dark-mode-first (optional later).

---

## 2. Routes & data

| Route | Purpose |
| --- | --- |
| `/pay/:orderNo` | Active pay landing (pending / paying) |
| `/pay/:orderNo/result` | Terminal or intermediate result (success / fail / expired) — may also be in-page state swap |

**Minimum fields from API (display):**

| Field | UI use |
| --- | --- |
| `order_no` / `trade_no` | Footer mono id; copy optional |
| `out_trade_no` | Optional secondary id (collapsed on mobile) |
| `name` / subject | Order title |
| `money` | Hero amount (元) |
| `type` / channel | `alipay` \| `wxpay` chip |
| `status` | Drive state machine |
| `expire_at` | Countdown |
| `qr_content` / `qr_url` / `pay_url` | QR + open-app CTA |
| `return_url` | Success secondary button |
| `error_message` | Human-safe error text only |

Never show merchant keys, platform secrets, or raw stack traces.

---

## 3. Layout

### 3.1 Structure (all breakpoints)

```text
┌─────────────────────────────────────┐
│  optional top bar: product name     │  text only, muted
│                                     │
│     ┌─────────────────────────┐     │
│     │  channel chip           │     │
│     │  subject                │     │
│     │  ￥ AMOUNT (hero)       │     │
│     │  countdown (if any)     │     │
│     │  ─────────────────      │     │
│     │  QR (pending)           │     │
│     │  primary CTA            │     │
│     │  secondary: 我已完成支付 │     │
│     │  help / tips            │     │
│     │  order_no mono          │     │
│     └─────────────────────────┘     │
│  footer: 安全提示（短）              │
└─────────────────────────────────────┘
```

- **Page bg:** `color.bg.app` `#F4F6F9`
- **Card:** `color.bg.surface` `#FFFFFF`, radius `12–16px`, light border + `--shadow-card`
- **No admin sidebar / header nav**
- Max one primary CTA; avoid competing blues vs channel green

### 3.2 Desktop (≥ 768px)

| Spec | Value |
| --- | --- |
| Card max-width | `420–440px` |
| Vertical center | Card vertically centered in viewport (min padding 24px) |
| QR size | `200–220px` render box |
| Amount | `40px` / weight 700 / tabular-nums |
| Side margins | Auto; no multi-column clutter |

### 3.3 Mobile (&lt; 768px)

| Spec | Value |
| --- | --- |
| Card | Full width minus `16px` side padding; top spacing `24–32px` (not forced vertical center if keyboard/safe-area issues) |
| QR size | `min(72vw, 220px)` — scannable |
| Amount | `32–36px` weight 700 |
| CTA | Full width, min height `44px` |
| Safe area | Respect `env(safe-area-inset-*)` on bottom CTA |
| Thumb reach | Primary CTA and「我已完成支付」within lower half when possible |

### 3.4 Hierarchy (visual weight)

1. **Amount** (largest)  
2. QR or status icon  
3. Primary CTA  
4. Subject + channel chip  
5. Countdown / tips  
6. Order id footer  

---

## 4. Amount & QR

### 4.1 Amount

- Format: `￥` + amount with 2 decimal places (or API precision); `font-variant-numeric: tabular-nums`
- Color: `color.text.primary` `#0F172A`
- Label above optional: 「支付金额」`text.sm` secondary
- Never animate amount digits on every poll (causes motion sickness / distrust)

### 4.2 QR

| Rule | Detail |
| --- | --- |
| Quiet zone | ≥ 4 modules padding inside white box |
| Error correction | Prefer medium (M) if generator configurable |
| Loading | Skeleton square same size; not zero-height flash |
| Failed to load QR | Inline error +「刷新二维码」if API supports regenerate |
| Overlay on expired | Dim QR + stamp「已过期」; do not leave scannable-looking live QR |
| Channel logo center | Optional small mark; must not break scan (test real devices) |
| Long-press | Allow native save/scan on mobile where OS permits |

### 4.3 Open-app / deep link

- If `pay_url` is http(s) landing inside wallet: primary button「打开支付宝」/「打开微信」
- If only QR: primary emphasis on QR; button becomes「保存二维码」or hide
- Do not open new tabs without user gesture

---

## 5. Countdown

| Rule | Detail |
| --- | --- |
| Source | `expire_at` server time; prefer server offset if clock skew known |
| Display | `剩余 mm:ss` or `剩余 x 分 y 秒` under amount |
| Color | Default secondary; &lt; 60s → `color.warning.DEFAULT` |
| At 0 | Transition to **expired** state (section 6); stop polling pay intent |
| No expire_at | Hide countdown row entirely |
| Reduced motion | Text-only updates OK; no pulse animation |

Polling recommendation while pending: 2–3s interval; backoff after 2 min; stop on terminal state.

---

## 6. Page states

Use a single state machine; do not show pay CTA on terminal states.

### 6.1 `loading` (first paint)

- Card skeleton: amount bar + QR square + button bars  
- No fake amount `0.00` unless API returned it  

### 6.2 `pending` / `paying` (ready to pay)

- Channel chip + subject + amount + countdown + QR/CTA  
- Secondary:「我已完成支付」→ trigger status poll / go result check  
- Tip:「请使用{支付宝/微信}扫一扫完成支付」  

### 6.3 `success`

- Large success SVG check (not emoji) in `color.success.DEFAULT`  
- Title:「支付成功」  
- Amount retained (confirmation)  
- Primary optional:「返回商户」if `return_url` present (full URL open)  
- Secondary: none or「完成」  
- **Do not** keep live QR  

### 6.4 `expired`

- Warning/neutral icon  
- Title:「订单已过期」  
- Body:「请返回商户重新下单」  
- QR disabled/dimmed  
- No primary pay CTA  
- Optional: link back if `return_url`  

### 6.5 `failed` (pay failed / closed)

- Danger icon +「支付失败」or「订单已关闭」  
- Show safe `error_message` if any  
- CTA:「返回商户」if return_url; else no dead-end — show order_no for support  

### 6.6 `error` (page/API error — order not found, network)

- Title:「无法加载订单」  
- Body: short reason  
- CTA:「重试」re-fetch; optional return_url  
- Distinguish 404 order vs network (copy)  

### 6.7 `paid_elsewhere` / race

If user still on page and poll returns success → auto-switch to success (toast optional, quiet preferred).

---

## 7. Channel identity (Alipay / WeChat)

| Channel | Chip bg | Chip text | Primary CTA label | Tip |
| --- | --- | --- | --- | --- |
| Alipay | `#E6F4FF` | `#1677FF` | 打开支付宝 | 请使用支付宝扫一扫 |
| WeChat | `#E8F8EF` | `#07C160` | 打开微信 | 请使用微信扫一扫 |

**Rules**
- Chip + optional monochrome official-style mark (SVG); **no emoji**  
- Do **not** recolor entire page green/blue to match wallet — page stays HuaJian tokens  
- CTA may use channel color **only** for that button; page primary elsewhere stays `#1D4ED8` if needed  
- Unsupported channel: error state「暂不支持该支付方式」  

---

## 8. Copy deck (ZH)

| Key | Copy |
| --- | --- |
| amount_label | 支付金额 |
| countdown | 剩余 {time} |
| tip_alipay | 请使用支付宝扫一扫，完成支付 |
| tip_wechat | 请使用微信扫一扫，完成支付 |
| cta_done | 我已完成支付 |
| success_title | 支付成功 |
| expired_title | 订单已过期 |
| expired_body | 请返回商户网站重新发起支付 |
| fail_title | 支付失败 |
| load_error | 无法加载订单信息 |
| retry | 重试 |
| return_merchant | 返回商户 |
| footer_secure | 支付服务由平台提供，请确认金额后支付 |
| order_label | 订单号 |

Tone: calm, precise; never imply refund when only page load fails.

---

## 9. Motion & interaction

| Interaction | Spec |
| --- | --- |
| Button hover | Color/opacity 150–200ms; `cursor-pointer` |
| Status switch | Cross-fade ≤ 200ms; respect `prefers-reduced-motion` → instant |
| Polling | No full-card flash; update status region only |
| Double tap CTA | Disable button while deep-link attempt in flight |

---

## 10. Accessibility

| Requirement | Implementation note |
| --- | --- |
| Contrast | Body text ≥ 4.5:1 on white/surface |
| Amount | Exposed to SR as e.g. `支付金额 {n} 元` |
| Channel chip | Text label, not color alone |
| Status icon | Adjacent text title (成功/过期/失败) |
| Focus | Visible ring on CTAs and「重试」 |
| QR | `alt`/`aria-label`:「支付二维码，金额 {n} 元」; decorative status SVG `aria-hidden` if title present |
| Keyboard | CTAs reachable; result page usable without pointer |
| Reduced motion | Disable non-essential animation |
| Language | `lang="zh-CN"` on pay document |

---

## 11. Security & privacy (UX)

- Public page: no admin session required  
- Do not log PII to console in production builds  
- `return_url` open only http(s); block `javascript:`  
- Order ids shown fully OK; no secret query params in shareable UI chrome  
- On success, stop QR rendering to reduce accidental second scan confusion  

---

## 12. Component checklist (implementer)

- [ ] `PayShell` — bg, centered card, no admin layout  
- [ ] `PayAmount` — hero typography + tabular nums  
- [ ] `ChannelChip` — alipay / wechat tokens  
- [ ] `PayCountdown` — expire handling  
- [ ] `PayQr` — size, loading, expired overlay  
- [ ] `PayPrimaryButton` — channel-aware label  
- [ ] `PaySecondaryDone` — poll trigger  
- [ ] `PayStatus` — success / expired / failed / error  
- [ ] `PayOrderMeta` — mono order_no  
- [ ] `ReturnMerchant` — safe external nav  

Tokens: reuse `docs/ux/visual-system.md` CSS variables; pay-specific amount size `text.pay-amount` 32–40px.

---

## 13. Acceptance checklist (QA)

### Layout
- [ ] Desktop: card ~420px centered; no horizontal scroll  
- [ ] Mobile 320–430px: amount + QR + CTA visible without horizontal scroll  
- [ ] No admin nav / sidebar on pay routes  

### Hierarchy
- [ ] Amount is largest text on pending page  
- [ ] QR ≥ ~200px desktop / scannable on device  
- [ ] Single clear primary action  

### Countdown
- [ ] Hidden when no `expire_at`  
- [ ] Shows mm:ss (or equivalent) and turns warning near end  
- [ ] At 0 → expired UI; pay CTA removed  

### States
- [ ] Loading skeleton then pending  
- [ ] Success: check icon + title + amount; no live QR  
- [ ] Expired: cannot initiate pay  
- [ ] Fail/error: safe message + retry or return  
- [ ] Poll to success auto-updates without manual refresh  

### Channel
- [ ] Alipay chip colors per table  
- [ ] WeChat chip colors per table (if enabled)  
- [ ] Page chrome not fully recolored  

### A11y
- [ ] Status not color-only  
- [ ] Focus visible on buttons  
- [ ] QR has accessible name  
- [ ] `prefers-reduced-motion` honored  

### Safety
- [ ] No secrets on page  
- [ ] `return_url` only http(s)  
- [ ] 404 order vs network error copy differ  

### Regression
- [ ] `flows.md` Flow B pay steps still satisfied  
- [ ] Visual tokens match system (primary/success/warning/danger)  

---

## 14. MVP cut vs later

| MVP | Later |
| --- | --- |
| Alipay pending + success + expired + load error | WeChat parity polish |
| QR +「我已完成支付」poll | App deep-link analytics |
| Simple result on same route or `/result` | Multi-language |
| Static footer tip | Merchant logo co-brand |

---

## 15. Handoff

| Owner | Action |
| --- | --- |
| Frontend | Implement pay routes per this spec; do not block on AdminUI polish |
| PayCore | Ensure pay page API returns fields in §2; stable status enums |
| Designer | Re-review screenshots after first implementation |

**File:** `docs/ux/pay-page-polish.md` only for this task.
