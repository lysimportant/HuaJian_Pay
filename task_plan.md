# HuaJian_Pay Task Plan

## Goal
Ship HuaJian_Pay: YiPay-style collection for newapi; Alipay receive-first; WeChat after Alipay E2E.

## Locked decisions
- Stack: Node 20 + TypeScript + Fastify + Drizzle + SQLite + Vue3 admin
- Alipay: OpenAPI precreate QR P0; merchant app credentials (not personal-only API)
- WeChat: adapter interface + config; implement after Alipay
- Merchant API: YiPay MD5 classic paths + REST aliases
- Money: integer cents; notify: DB-backed retry

## Phases
1. [done] Scaffold repo, AGENTS, Git rules, tag v0.1.0
2. [done] Architecture & channel feasibility → tag v0.2.0
3. [in_progress] Payment backend core + Alipay MVP (PayCore)
4. [pending] Admin/merchant UI (AdminUI); UX docs already done (`ffc8e20`)
5. [pending] WeChat channel (if credentials ready)
6. [pending] newapi integration guide + E2E verification
7. [pending] Hardening, docs, v1.0.0 tag

## Notes
- Push after every completed step
- Tag major milestones
- Follow AGENTS.md DR-10M + HTR-90
- Planner architecture package complete: findings.md, docs/architecture.md, docs/api.md (commits `0afcc2c`, sealed `40eea63`)
