# AdminUI Implementation Review

**Reviewer:** Designer  
**Date:** 2026-07-25  
**Code under review:** `apps/admin` (Vue 3 + Vite + Naive UI)  
**Spec baseline:** `docs/ux/flows.md`, `docs/ux/ia.md`, `docs/ux/visual-system.md`, `docs/briefs/adminui-mvp.md`  
**Scope:** UX audit document only — no edits under `apps/admin`

---

## 1. Executive summary

AdminUI is a **working admin operator console** with login, dashboard KPIs, orders list/detail, dedicated Alipay config page, merchant list/create, and settings placeholder. Shell uses light sidebar, CSS design tokens in `style.css`, auth route guard, and responsive nav collapse.

Against the UX package and payment-safe ops needs, the largest gaps are:

1. **Secrets handling regression risk** — Alipay form loads `private_key` / public key from API into editable fields (plaintext textarea).
2. **Notify failure ops incomplete** — order detail has **no resend notify** action; no attempt history; no notify-status filter.
3. **Channel setup validation** — no required-field rules, no test connection, no “已配置/掩码” pattern.
4. **Product surfaces still out of app** — public pay page, merchant self-console, test-order wizard.

| Area | vs admin brief | vs full UX |
| --- | --- | --- |
| IA (admin shell) | Good | Partial (no pay/merchant role) |
| Alipay configure | Present | Weak validation/secrets UX |
| Orders lookup | Good list | Detail thin |
| Notify failure flow | Dashboard KPI only | **Fail** (no resend) |
| Visual tokens | Improved | Partial Naive mix |
| A11y / mobile | Basic OK | Tables need work |
| Ship admin MVP? | **Conditional** — fix P0 secrets + resend | |

---

## 2. Reviewed files

| Path | Notes |
| --- | --- |
| `src/router/index.ts` | Routes + `requiresAuth` guard |
| `src/layouts/AdminLayout.vue` | Nav, brand, logout, responsive |
| `src/views/LoginView.vue` | Login form |
| `src/views/DashboardView.vue` | KPIs + recent orders |
| `src/views/OrdersView.vue` | Filters, table, pagination |
| `src/views/OrderDetailView.vue` | Descriptions only |
| `src/views/AlipayView.vue` | Channel form page |
| `src/views/MerchantsView.vue` | List + create |
| `src/views/SettingsView.vue` | Placeholder tip |
| `src/api/*`, `src/utils/*`, `src/style.css`, `App.vue` | Client, labels, tokens |

**Not in repo surface:** `/pay/*` pay page, merchant role console.

---

## 3. Information architecture

### 3.1 Implemented map

```text
/login
/dashboard          # 概览
/orders             # 订单
/orders/:tradeNo    # 订单详情
/alipay             # 支付宝配置
/merchants          # 商户
/settings           # 设置（占位）
```

Nav labels: 概览 · 订单 · 支付宝 · 商户 · 设置. Brand: **花间支付**.

### 3.2 vs `docs/ux/ia.md`

| Expectation | Status | Notes |
| --- | --- | --- |
| Admin shell + sidebar | **Pass** | Light sider; mobile → top tabs |
| Orders list + detail | **Pass** | Param is `tradeNo` (platform order) |
| Channel Alipay setup | **Pass** | Dedicated `/alipay` (better than modal) |
| Merchants admin | **Pass** | List/create; no detail page |
| Dashboard + failed notify KPI | **Pass** (if API fields present) | |
| Credentials page | N/A admin | Merchant key one-shot on create (verify MerchantsView) |
| Notify logs page | **Missing** | MVP cut OK if detail supports resend |
| Header global search | **Missing** | Search only on orders page |
| Preserve list filters on back | **Fail** | Back to `{ name: 'orders' }` drops query |
| Pay page | **Missing** | Separate product task |
| System/health | **Missing** | Settings is static tip |
| Role-based merchant nav | **Missing** | Admin-only app |

**IA verdict:** Admin operator map is coherent. Prefer renaming nav “支付宝” → “通道” later if WeChat arrives; keep `/alipay` route or alias `/channels/alipay`.

---

## 4. Critical flows

### 4.1 Flow A — Configure Alipay → receive

| Rule | Current | Verdict |
| --- | --- | --- |
| Entry Channels → Alipay | Nav item 支付宝 → `/alipay` | Pass |
| Fields app_id / private_key / alipay_public_key / enable | Present + notify_url / return_url | Pass coverage |
| Sandbox toggle | Absent | **P1** |
| Client required validation | None before save | **P0** |
| Secrets masked after save | **Loads full keys into textarea** | **P0 security/UX** |
| Password-style or show-once | Plain textarea | **P0** |
| Connection test | Absent | **P1** |
| Unhealthy / 异常 badge | Absent | **P1** |
| Empty state CTA | N/A (always form) | Partial |
| Save toast + reload | Yes | Pass |

### 4.2 Flow B — Create → pay → notify

| Piece | Status |
| --- | --- |
| Console test order | **Missing** |
| Pay landing | **Missing** (not admin) |
| Orders reflect success | List/detail show status | Display Pass |

### 4.3 Flow C — Order lookup

| Piece | Status |
| --- | --- |
| List columns / money / status tags | **Pass** |
| Keyword + pay status filter | **Pass** |
| Notify status filter | **Missing / P1** |
| Detail identifiers + times | **Pass** |
| Timeline | **Missing / P1** |
| Copy buttons | **Missing / P2** |
| Mono / tabular money | **Pass** (CSS utilities) |

### 4.4 Flow D — Notify failure & retry

| Piece | Status |
| --- | --- |
| Dashboard 通知失败 KPI | Intended via stats | Pass if API |
| List notify column | Detail shows raw `notify_status` | List depends on fields |
| Resend notify CTA | **Not in OrderDetailView** | **P0 Fail** |
| Confirm “仅重试通知” | N/A | **P0** with resend |
| Attempt history table | **Missing** | **P1** |
| Nav badge failed count | **Missing** | **P1** |

### 4.5 Flow E — WeChat

| Piece | Status |
| --- | --- |
| Setup / 即将支持 | **Missing** | **P2** |

### 4.6 Auth

| Piece | Status |
| --- | --- |
| Guard + token login | **Pass** |
| Logout | **Pass** |
| 401 handling | Client layer (verify continues to clear token) | Assume Pass if unchanged |

---

## 5. Status & error feedback

**Strengths**
- Shared `statusLabel` / `statusType` / `money` / `formatTime`
- `pickMsg` + `useMessage` on load/save failures
- Card/table `loading` states
- Dashboard error toast on stats failure

**Gaps**
1. **P0** — No resend path ⇒ operators cannot recover notify failures in UI  
2. **P0** — Alipay save with empty secrets allowed  
3. **P1** — Empty states (zero orders / zero merchants) are Naive defaults only  
4. **P1** — Settings looks like a feature but is non-actionable  
5. **P1** — Order detail `notify_status` raw, not mapped through `statusLabel`  
6. **P2** — No skeletons; no page-level error retry panel on detail when `order` null after error  

---

## 6. Sensitive credentials (critical)

| Control | Verdict |
| --- | --- |
| Alipay private key input type | **Fail** — `textarea`, not masked |
| Reload secrets from GET into form | **Fail / P0** — violates “never echo full after save” |
| Merchant api_key one-time on create | **Partial Pass** — modal label「仅展示一次」 |
| Merchant list key column | **Fail / P0** — renders `r.key \|\| r.secret \|\| '******'`; if API returns key it displays |
| Token in localStorage | MVP OK; security checklist |
| Logout clears token | Pass |

**Required pattern (spec):**
- GET channel returns `app_id`, `enabled`, `has_private_key`, optional `app_id` mask — **not** raw private key  
- UI: empty secret fields mean “unchanged”; placeholder `已配置，留空则不修改`  
- Optional「更换密钥」clears field for new value only  

Until API+UI match this, treat Alipay page as **not production-safe**.

---

## 7. Visual system compliance

| Token / rule | Current (`style.css` + Naive) | Verdict |
| --- | --- | --- |
| `--hj-*` CSS variables | Present (primary blue, surfaces, radius, shadow) | **Pass direction** |
| Match visual-system hex | Close (`#1d4ed8`, `#f4f6f9`, etc.) | **Good** |
| DM Sans / JetBrains | Not loaded; system + ui-monospace | **Partial** |
| No emoji icons | Brand uses「花」character in tile | **Pass** (better than 💳) |
| Naive themeOverrides | Partial / default components | **P1** align tags/buttons |
| Status pill semantics | `n-tag` + statusType | **Pass** |
| Pay page amount hero | N/A | — |
| Density / hero page titles | `.hero` pattern consistent | **Pass** |

UIPolish in progress may improve further; re-check after their push.

---

## 8. Accessibility

| Rule | Status |
| --- | --- |
| `lang` / viewport | Pass (index.html) |
| Form labels (`n-form-item`) | Pass |
| Status text + color | Pass |
| Focus rings | Browser/Naive default |
| Icon-only controls | Mostly text buttons |
| `prefers-reduced-motion` | Not handled | **P2** |
| Keyboard login | Pass |

---

## 9. Mobile / responsive

| Rule | Status |
| --- | --- |
| &lt;960px top tab nav | **Pass** |
| Content padding | **Pass** |
| Login card | **Pass** |
| Wide tables | Overflow risk | **P1** wrap in scroll container |
| Alipay form label-left 140px | Tight on mobile | **P1** stack labels on small screens |

---

## 10. Priority backlog

### P0

1. **Stop echoing Alipay private keys** — API mask + UI leave-blank-to-keep; password/textarea with never prefill secret.  
2. **Client validation** on Alipay: require app_id; require keys on first setup.  
3. **Restore resend notify** on order detail with confirm copy:  
   > 订单支付状态不变；此操作仅重试商户异步通知，不会重复扣款。  
4. **Map notify_status** through shared label/tag helpers (not raw).  
5. **Double-submit guard** on resend/save.  
6. **Merchant list must never show raw api_key** — always mask; one-time only in create modal.

### P1

1. Notify-status filter on orders + optional nav badge.  
2. Order timeline + notify attempt list (needs API).  
3. Empty states with CTA.  
4. Preserve orders query when returning from detail.  
5. Naive `themeOverrides` fully wired to `--hj-*`.  
6. Mobile table scroll; Alipay form label-top on small screens.  
7. Sandbox flag + warning; channel test if backend supports.  
8. Settings: real fields or demote/hide until backend ready.

### P2

1. Public pay page.  
2. Merchant console / roles.  
3. Create test order.  
4. WeChat「即将支持」.  
5. Copy buttons for trade nos.  
6. Global header search.  
7. Fonts per visual-system (optional self-host).

---

## 11. Executable acceptance checklist

### Auth
- [ ] `/orders` logged-out → `/login`
- [ ] Login success → dashboard + username
- [ ] Logout → token cleared; protected routes blocked

### Dashboard
- [ ] KPI cards render (订单数/金额/成功/通知失败 as API allows)
- [ ] Recent order row → detail
- [ ] API error → toast, no white crash

### Orders
- [ ] Pagination works
- [ ] Status filter + keyword work
- [ ] Money formatted; status tagged in Chinese
- [ ] Detail shows trade_no, out_trade_no, pid, money, times
- [ ] **Resend notify** visible when paid & notify not success (after P0)
- [ ] Resend confirm explains no double charge
- [ ] Failed resend shows API message

### Alipay
- [ ] Page loads without showing full private key (after P0)
- [ ] First-time save blocked if app_id/keys missing
- [ ] Re-save with blank secret does not wipe key server-side
- [ ] Enable toggle persists
- [ ] notify_url / return_url save

### Merchants
- [ ] Create returns **one-time** api_key + warning
- [ ] List never shows raw api_key
- [ ] Cannot re-open modal to reveal old key

### Shell / visual
- [ ] Desktop sidebar + mobile tabs
- [ ] No emoji brand mark
- [ ] Primary actions use brand blue
- [ ] Mono for order ids where applied

### Out of checklist (product gaps)
- [ ] Pay page E2E  
- [ ] Merchant self-serve  
- [ ] WeChat channel  
- [ ] Console test order  

---

## 12. Residual risks

1. **Secret leakage via admin GET** — highest severity for go-live.  
2. **Ops blind spot** — paid-but-notify-failed orders lack recovery button.  
3. **Settings placeholder** — user trust / support confusion.  
4. **Filter loss** — support workflows slower.  
5. **Concurrent UIPolish** — visual may change underfoot; re-verify tokens after polish merges.  
6. **Pay page absence** — end-user Flow B not demoable from this app alone.

---

## 13. Next resume points

| Owner | Action |
| --- | --- |
| **AdminUI / UIPolish / Coder** | P0 secrets UX + resend notify + validation |
| **PayCore** | Channel GET without raw private_key; notify attempts API; resend endpoint stable |
| **Designer** | Re-audit after P0; optional pay-page microcopy |
| **Lead** | Keep pay page & merchant console as separate tasks |
| **Security checklist task** | Token storage, secret echo, resend abuse |

---

## 14. Constraint

This review does **not** modify `apps/admin`. Implementation fixes belong to AdminUI/UIPolish/Coder agents.
