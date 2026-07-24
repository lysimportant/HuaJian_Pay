# HuaJian_Pay Task Plan

## Goal

Ship HuaJian_Pay: YiPay-style collection platform for newapi; Alipay receive-first (official merchant OpenAPI); WeChat if feasible; simple Node/TS deploy.

## Current Phase

Phase 2 — Architecture & channel feasibility (**Planner — completing**)

## Phases

### Phase 1: Scaffold repo, AGENTS, Git rules, tag v0.1.0

- [x] Clone repo, AGENTS.md, README, gitignore, env example, docs draft
- [x] Push + tag `v0.1.0`
- **Status:** complete

### Phase 2: Architecture & channel feasibility (Planner)

- [x] Read AGENTS.md + existing plan files
- [x] Research YiPay/newapi API + sign conventions
- [x] Alipay realistic receive options (lock official OpenAPI)
- [x] WeChat feasibility + credentials
- [x] Lock tech stack (Node 20 + TS + Fastify + Drizzle + SQLite/MySQL + Vue3)
- [x] Update `findings.md`, `docs/architecture.md`, `docs/api.md`, `progress.md`
- [ ] Commit + push plan lock
- **Status:** in_progress

### Phase 3: Payment backend core + Alipay MVP (PayCore)

- [ ] Server skeleton, schema, migrations
- [ ] YiPay sign + submit/mapi/query
- [ ] Alipay adapter (precreate + notify)
- [ ] Merchant notify worker + idempotency
- [ ] Push stepwise; tag `v0.2.0` when Alipay E2E works
- **Status:** pending (unblocked after Phase 2 push)

### Phase 4: Admin/merchant UI (AdminUI) + UX (Designer)

- [ ] Designer: IA/flows/tokens under `docs/ux/`
- [ ] AdminUI: login, channels, orders, notify logs, API keys
- **Status:** pending (AdminUI after API skeleton; Designer can start in parallel)

### Phase 5: WeChat channel

- [ ] Complete WeChat adapter + admin config
- [ ] E2E with merchant credentials
- **Status:** pending

### Phase 6: newapi integration guide + E2E verification

- [ ] `docs/newapi-integration.md`
- [ ] End-to-end paid order from newapi
- **Status:** pending

### Phase 7: Hardening, docs, v1.0.0

- [ ] Rate limits, audit, MySQL prod path, security review
- [ ] Tag `v1.0.0`
- **Status:** pending

## Key Questions (resolved)

1. **Can “fill Alipay account only” auto-receive via official API?** → No for arbitrary personal accounts; use merchant OpenAPI; settlement to bound merchant account; optional display label for account.
2. **WeChat same UX?** → Same architecture yes; personal-only no; ship after Alipay.
3. **Stack?** → Node.js TypeScript Fastify + Drizzle + SQLite/MySQL + Vue3 admin.
4. **Sign?** → Classic YiPay MD5 lowercase + key append; pluggable later.

## Decisions Made

| Decision | Rationale |
| -------- | --------- |
| Node/TS + Fastify + Drizzle | Fast MVP, typed, easy admin handoff |
| SQLite default / MySQL ready | Solo deploy simplicity |
| Alipay official precreate first | Real money path, ToS-safe |
| WeChat second | Qualification/domain friction |
| Classic epay paths + REST aliases | newapi plugin compatibility |
| DB-backed notify retries | Fewer infra deps |
| Integer cents internally | Avoid float errors |

## Errors Encountered

| Error | Attempt | Resolution |
| ----- | ------- | ---------- |
|      |         |            |

## Deliverables (Phase 2)

- `findings.md` — research conclusions
- `docs/architecture.md` — locked architecture
- `docs/api.md` — merchant API draft
- `task_plan.md` / `progress.md` — updated
- git commit + push `origin main`
