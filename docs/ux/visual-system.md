# HuaJian_Pay — Visual System & Component Notes

**For:** AdminUI implementation (web console + pay page)  
**Stack assumption:** HTML/CSS or React + utility CSS (Tailwind-friendly tokens). Stack not frozen.  
**Principles:** Trustworthy fintech, clear status, dense-but-breathable data UI, mobile-usable pay page.

---

## 1. Brand personality

| Attribute | Direction |
| --- | --- |
| Voice | Professional, calm, precise |
| Density | Console: medium-high (tables); Pay: low (focus) |
| Ornament | Minimal; no glassmorphism overload |
| Trust | Strong contrast, stable layout, no playful emoji-as-icons |

**Product name display:** HuaJian_Pay or 华简支付 (confirm with owner). Use text logo MVP; optional simple mark (abstract H + stable geometry).

---

## 2. Color tokens

Use semantic names in code (`--color-primary`), not raw hex scattered in components.

### 2.1 Core palette (light — default)

| Token | Hex | Usage |
| --- | --- | --- |
| `color.bg.app` | `#F4F6F9` | App background |
| `color.bg.surface` | `#FFFFFF` | Cards, tables, modals |
| `color.bg.subtle` | `#EEF2F7` | Zebra, sidebar hover well |
| `color.bg.inverse` | `#0B1220` | Rare inverse blocks |
| `color.border.default` | `#E2E8F0` | Dividers, inputs |
| `color.border.strong` | `#CBD5E1` | Emphasized borders |
| `color.text.primary` | `#0F172A` | Body / titles |
| `color.text.secondary` | `#475569` | Meta, labels |
| `color.text.muted` | `#64748B` | Placeholders, hints (min contrast on white) |
| `color.text.inverse` | `#F8FAFC` | On dark / primary buttons |
| `color.primary.DEFAULT` | `#1D4ED8` | Primary actions (blue, trust) |
| `color.primary.hover` | `#1E40AF` | Hover |
| `color.primary.muted` | `#DBEAFE` | Selected row, soft badge |
| `color.accent.DEFAULT` | `#0F766E` | Secondary accent (teal) — charts, links alt |
| `color.danger.DEFAULT` | `#DC2626` | Errors, destructive |
| `color.danger.muted` | `#FEE2E2` | Error backgrounds |
| `color.warning.DEFAULT` | `#D97706` | Pending pay, retrying |
| `color.warning.muted` | `#FEF3C7` | Warning backgrounds |
| `color.success.DEFAULT` | `#059669` | Paid / notify ok |
| `color.success.muted` | `#D1FAE5` | Success backgrounds |
| `color.info.DEFAULT` | `#2563EB` | Informational |
| `color.info.muted` | `#DBEAFE` | Info backgrounds |

### 2.2 Channel brand chips (local only)

| Channel | Chip bg | Chip text | Note |
| --- | --- | --- | --- |
| Alipay | `#E6F4FF` | `#1677FF` | Do not recolor entire app |
| WeChat | `#E8F8EF` | `#07C160` | Same |

### 2.3 Dark mode (optional MVP+)

If implemented:

| Token | Hex |
| --- | --- |
| `color.bg.app` | `#0B1220` |
| `color.bg.surface` | `#111827` |
| `color.border.default` | `#1F2937` |
| `color.text.primary` | `#F1F5F9` |
| `color.text.secondary` | `#94A3B8` |
| `color.primary.DEFAULT` | `#3B82F6` |

Glass/transparency: avoid `bg-white/10` on light; surfaces solid or `bg-white/90` min.

### 2.4 Focus & selection

- Focus ring: `2px solid color.primary.DEFAULT`, offset `2px`
- Table row hover: `color.bg.subtle`
- Table row selected: `color.primary.muted`

---

## 3. Typography

### 3.1 Font stack

| Role | Family | Fallback |
| --- | --- | --- |
| UI Sans | `"DM Sans"`, `"PingFang SC"`, `"Microsoft YaHei"`, `system-ui`, sans-serif | Body, labels |
| Mono | `"JetBrains Mono"`, `"SF Mono"`, `Consolas`, monospace | order_no, keys, JSON |

Google Fonts import (if web fonts allowed):

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

Self-host if offline deploy required.

### 3.2 Type scale

| Token | Size / line | Weight | Use |
| --- | --- | --- | --- |
| `text.xs` | 12 / 16 | 400–500 | Badges, table meta |
| `text.sm` | 13–14 / 20 | 400–500 | Secondary UI, filters |
| `text.md` | 14–15 / 22 | 400 | Body, inputs |
| `text.lg` | 16 / 24 | 500–600 | Section titles |
| `text.xl` | 20 / 28 | 600 | Page title |
| `text.2xl` | 24 / 32 | 600 | Dashboard KPI |
| `text.pay-amount` | 32–40 / 1.1 | 700 | Pay page amount |

**Rules**
- One page title (`text.xl`) per view
- Tabular figures for money: `font-variant-numeric: tabular-nums`
- Chinese/Latin mix: prefer medium weight for section headers for clarity

---

## 4. Spacing & layout

### 4.1 Spacing scale (px)

`4, 8, 12, 16, 20, 24, 32, 40, 48`  
Default component gap: **16**; form field stack: **16–20**; card padding: **20–24**.

### 4.2 Layout shell

| Region | Spec |
| --- | --- |
| Sidebar width | 232–248px desktop; collapse to icons ≤1024px |
| Header height | 56px |
| Content max width | 1280px (`max-w-7xl`); full width for wide tables OK |
| Content padding | 16px mobile / 24px desktop |
| Card radius | 12px |
| Control radius | 8px |
| Modal radius | 12–16px |

**Floating elements:** if top bar floats, use `top-4 left-4 right-4` style inset — not flush edge without safe gap.

### 4.3 Grid

- Dashboard KPIs: 2 col mobile / 4 col desktop  
- Channel cards: 1 col mobile / 2 col desktop  
- Forms: single column max 560px for credential forms; labels above fields (better for Chinese + long errors)

---

## 5. Elevation & borders

| Level | Style |
| --- | --- |
| Flat | border `color.border.default` only |
| Card | border + shadow `0 1px 2px rgb(15 23 42 / 6%)` |
| Dropdown / popover | shadow `0 8px 24px rgb(15 23 42 / 12%)` |
| Modal overlay | `rgb(15 23 42 / 45%)` |

Prefer border+light shadow over heavy neumorphism.

---

## 6. Iconography

- **SVG only** (Heroicons or Lucide). **No emoji icons.**
- Default size: 20px (`w-5 h-5`) in nav; 16px in table actions
- Stroke width consistent (1.5–2)
- Channel logos: simple official-style marks or text chips; don’t invent wrong brand paths

---

## 7. Component notes (AdminUI)

### 7.1 Buttons

| Variant | Use |
| --- | --- |
| `primary` | Save, Enable, Create, Resend confirm |
| `secondary` | Cancel, secondary actions (outline/gray) |
| `danger` | Disable merchant, revoke key |
| `ghost` | Table row actions |

- Height: 36px default; 32px compact table; 40–44px pay CTA  
- Always `cursor-pointer` on clickable controls  
- Loading: spinner + keep label width (no layout jump)  
- Transition: `colors/opacity 150–200ms` — avoid scale transforms that shift layout

### 7.2 Inputs

- Height 36–40px; border default; focus ring primary  
- Labels required marker `*` in danger color  
- Help text under field (`text.sm` secondary)  
- Secrets: `type=password` + show/hide toggle; after save show `••••••1234` + 「更换」

### 7.3 Status pills

Map flow statuses:

| Semantic | bg | text |
| --- | --- | --- |
| pending / paying | warning.muted | warning.DEFAULT |
| success / paid / notify ok | success.muted | success.DEFAULT |
| failed / notify failed | danger.muted | danger.DEFAULT |
| expired / closed / disabled | `#F1F5F9` | `#64748B` |
| enabled channel | success.muted | success.DEFAULT |

Pill: 12px radius full, px-8 py-2, `text.xs` medium, no icon required (optional dot).

### 7.4 Tables

- Header: `text.sm` medium, secondary color, sticky optional  
- Cell: `text.sm` primary; mono for IDs  
- Row height ~44–48px  
- Actions: ghost icon buttons, tooltips  
- Empty: centered message + CTA  

### 7.5 Cards

- Channel card: title row + status + short meta + primary/secondary buttons  
- KPI card: label (secondary) + value (`text.2xl`) + optional delta  

### 7.6 Sidebar

- Active item: primary.muted bg + primary text + 3px left bar primary  
- Icons + labels; collapse breakpoint  
- Bottom: settings / user  

### 7.7 Modals & confirms

- Destructive: danger primary button right; title clear  
- Resend notify: explain “支付已成功，仅重试通知”  

### 7.8 Toasts

- Corner top-right; 3–5s; success/error/info  
- Don’t use toast as only error channel for form validation  

### 7.9 Pay page (special)

- Centered card max-width 420px  
- Amount hero `text.pay-amount`  
- Primary CTA full width  
- Brand chip for channel  
- Footer: order_no mono muted  
- Background `color.bg.app`; no admin sidebar  
- Result page: large success/fail icon (SVG), amount, button 返回商户 if `return_url`

---

## 8. Motion

| Interaction | Duration | Easing |
| --- | --- | --- |
| Hover color | 150–200ms | ease-out |
| Modal in | 200ms | ease-out |
| Toast | 200ms | ease-out |

Respect `prefers-reduced-motion: reduce` — disable non-essential motion.

---

## 9. Accessibility

- Text contrast ≥ 4.5:1 for body on surfaces  
- Don’t use color alone for status (pill text + optional icon)  
- All inputs have visible labels  
- Focus visible on keyboard  
- Icon-only buttons: `aria-label`  
- Pay amount announced clearly for SR  

---

## 10. Responsive breakpoints

| Name | Width | Behavior |
| --- | --- | --- |
| sm | 640 | Forms full width |
| md | 768 | 2-col KPIs |
| lg | 1024 | Sidebar expanded |
| xl | 1280 | Comfortable table padding |

Mobile console: hamburger + drawer nav; tables horizontal scroll with sticky first column optional.

---

## 11. CSS variables (starter)

```css
:root {
  --color-bg-app: #f4f6f9;
  --color-bg-surface: #ffffff;
  --color-bg-subtle: #eef2f7;
  --color-border: #e2e8f0;
  --color-text: #0f172a;
  --color-text-secondary: #475569;
  --color-text-muted: #64748b;
  --color-primary: #1d4ed8;
  --color-primary-hover: #1e40af;
  --color-primary-muted: #dbeafe;
  --color-success: #059669;
  --color-success-muted: #d1fae5;
  --color-warning: #d97706;
  --color-warning-muted: #fef3c7;
  --color-danger: #dc2626;
  --color-danger-muted: #fee2e2;
  --radius-control: 8px;
  --radius-card: 12px;
  --font-sans: "DM Sans", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", Consolas, monospace;
  --shadow-card: 0 1px 2px rgb(15 23 42 / 6%);
}
```

Tailwind mapping example: extend `colors.primary.DEFAULT` etc. to these values.

---

## 12. Do / Don’t

| Do | Don’t |
| --- | --- |
| Mask secrets after save | Show full private keys in UI |
| Distinguish 支付失败 vs 通知失败 | Use same red badge without labels |
| Use SVG status/channel icons | Use emoji as UI icons |
| Keep pay page minimal | Put admin nav on pay page |
| Stable hover (color/opacity) | Scale cards on hover (layout shift) |
| Solid surfaces in light mode | Ultra-transparent glass on white |

---

## 13. Deliverable checklist for AdminUI

- [ ] Tokens in theme file  
- [ ] Shell layout matches IA  
- [ ] Status pill map shared  
- [ ] Channel cards + Alipay form  
- [ ] Orders table + detail timeline  
- [ ] Notify failure styling + resend modal  
- [ ] Pay page amount hierarchy  
- [ ] Empty/loading/error states  
- [ ] Light mode contrast verified  

---

*Designer handoff for HuaJian_Pay MVP. Adjust hex only via tokens if brand lock changes.*
