# HuaJian_Pay — Information Architecture

**Consoles:** Admin (operator) + Merchant  
**Related:** `docs/ux/flows.md`, `docs/ux/visual-system.md`

---

## 1. Product surfaces

| Surface | Who | Auth | Purpose |
| --- | --- | --- | --- |
| **Admin console** | Platform operator | Admin role | Merchants, global channels, all orders, system |
| **Merchant console** | Merchant user | Merchant role | Own channels, orders, API keys, profile |
| **Pay page** | Payer | Public | Complete payment |
| **Merchant API** | newapi / integrators | pid + key sign | Create / query orders (not a UI nav) |

MVP may ship **one web app** with role-based nav (recommended) rather than two codebases.

---

## 2. Sitemap (role-based)

### 2.1 Merchant console

```text
/login
/ (dashboard)
/channels
  /channels/alipay
  /channels/wechat          # optional / gated
/orders
  /orders/:orderId
/orders/create              # test order helper
/notify-logs                # optional flat list; else only under order detail
/credentials                # API pid/key
/settings
  /settings/profile
  /settings/security        # password / 2FA later
/docs                       # link out to integration doc
```

### 2.2 Admin console (superset)

```text
/login
/ (dashboard)
/merchants
  /merchants/:id
  /merchants/:id/channels
/channels                   # global view / templates if any
/orders                     # all merchants + merchant filter
  /orders/:orderId
/notify-logs
/system
  /system/general
  /system/users             # admin users
  /system/health
/audit                      # optional MVP+
```

### 2.3 Public pay

```text
/pay/:orderNo               # pay landing
/pay/:orderNo/result        # success / fail / expired
```

---

## 3. Primary navigation

### Merchant sidebar (desktop) / tab bar (mobile)

| Order | ID | Label (ZH) | Route | Notes |
| --- | --- | --- | --- | --- |
| 1 | dashboard | 概览 | `/` | Checklist + KPIs |
| 2 | channels | 通道 | `/channels` | Alipay / WeChat cards |
| 3 | orders | 订单 | `/orders` | Badge: notify failures count |
| 4 | credentials | API 凭证 | `/credentials` | High-risk actions |
| 5 | settings | 设置 | `/settings` | Footer of nav |

**Secondary (header):** search orders, env badge (sandbox/prod), user menu (logout).

### Admin sidebar additions

| Order | ID | Label (ZH) | Route |
| --- | --- | --- | --- |
| after dashboard | merchants | 商户 | `/merchants` |
| after orders | notify-logs | 通知日志 | `/notify-logs` |
| bottom | system | 系统 | `/system` |

---

## 4. Page inventory & purpose

### Dashboard (`/`)
- **Merchant:** today volume, success rate, open checklist, failed-notify count, recent orders
- **Admin:** platform volume, active merchants, channel health, failed notifies

### Channels list (`/channels`)
- Cards/table: Alipay, WeChat
- Status badges: 未配置 / 已启用 / 异常
- CTA per card → detail setup

### Channel detail (`/channels/alipay`, `/channels/wechat`)
- Credential form, enable toggle, test connection, last error
- Link: 创建测试订单

### Orders list (`/orders`)
- Filterable table; row → detail
- Bulk: none in MVP (avoid dangerous mass actions)

### Order detail (`/orders/:id`)
- Summary, timeline, notify attempts, actions (resend, sync, close)

### Create test order (`/orders/create`)
- Merchant-only helper for Flow B without upstream

### Credentials (`/credentials`)
- pid, key management, sign algorithm hint, example request snippet (non-secret)

### Notify logs (`/notify-logs`) — admin or power merchant
- Cross-order list of failed/pending notifies; deep link to order

### Merchants (admin)
- List, create/disable merchant, impersonate view (optional, careful), reset API key

### System (admin)
- Site name, default callback base URL, maintenance flag, health probes

### Login
- Email/username + password; error without user enumeration detail

### Pay + result
- Minimal chrome; no console nav

---

## 5. Object model (UI-facing)

```text
Merchant
  ├── Channels[] (alipay, wechat)
  ├── Credentials (pid, key meta)
  └── Orders[]
        ├── Payment attempts / channel trade ids
        └── NotifyAttempts[]
```

**Navigation mapping**
- Merchant-centric for merchant role  
- Order-centric investigation for support (admin always can open order → merchant → channel)

---

## 6. Hierarchy & depth rules

| Rule | Value |
| --- | --- |
| Max nav depth | 2 (section → detail) |
| Critical task clicks | ≤ 3 from login (e.g. enable Alipay, find failed notify) |
| Detail back target | Parent list with preserved filters (query string) |
| Destructive actions | Confirm modal; never top-nav |

---

## 7. URL & state conventions

- English path segments: `/orders`, `/channels/alipay`
- Filters in query: `?status=success&notify=failed&from=&to=`
- Use platform `order_no` in path; show `out_trade_no` as field
- Sandbox banner when merchant/channel in sandbox mode

---

## 8. Empty, loading, error placement

| Level | Pattern |
| --- | --- |
| App shell | Skeleton sidebar + content pulse |
| Table | Row skeletons (5) then empty state |
| Form submit | Button loading; disable double submit |
| Page error | Illustration + retry + support hint |
| Toast | Success / non-blocking errors |
| Inline | Field validation |

---

## 9. Permission matrix (UI)

| Capability | Merchant | Admin |
| --- | --- | --- |
| View own orders | ✓ | ✓ (all) |
| Configure own channels | ✓ | ✓ (any) |
| Resend notify (own) | ✓ | ✓ |
| Manage merchants | — | ✓ |
| System settings | — | ✓ |
| View full secrets | never (mask) | never (mask) |

Hide unauthorized nav items; do not only hide buttons on page body.

---

## 10. MVP cut line

**Must ship for Alipay MVP**
- Login, Dashboard (basic), Channels Alipay, Orders list/detail, Notify resend, Credentials, Pay page

**Defer if needed**
- Notify global log page (detail panel enough)
- WeChat
- Audit log
- 2FA
- Multi-admin RBAC beyond admin/merchant

---

## 11. Handoff notes for AdminUI

1. Implement shell: sidebar + header + content max-width once; pages plug in.
2. Role flag drives nav config object (single source).
3. Align route names with this doc before inventing aliases.
4. Status enums shared with PayCore API — map to labels in one `status.ts` dict.
5. Visual tokens: `docs/ux/visual-system.md`.
