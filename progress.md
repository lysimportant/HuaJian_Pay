# Progress

## 2026-07-25
- Planner produced full `findings.md` (YiPay API, Alipay/WeChat feasibility, stack lock) — commit `0afcc2c`
- Lead sealed plan package: `docs/architecture.md`, `docs/api.md`, updated task_plan/progress — commit `40eea63`, tag `v0.2.0`
- Designer UX complete: `docs/ux/flows.md`, `docs/ux/ia.md`, `docs/ux/visual-system.md` (commit `ffc8e20`)
- PayCore Alipay MVP complete on main (slices A–F):
  - `ab1408b` scaffold
  - `b788bff` drizzle schema/migrate/seed
  - `4c1c23b` YiPay sign + create/query
  - `d73eaf1` Alipay precreate + notify
  - `1220179` merchant notify worker
  - `451bf6f` admin API skeleton
- Tag **v0.3.0** — backend Alipay MVP
- AdminUI on main (`fda9dd9`) + tag **v0.4.0**
- PayCore newapi integration work:
  - `docs/newapi-integration.md` — URL/pid/key/type/sign + mock/real switch
  - `scripts/mock-e2e.mjs` + `pnpm test:mock-e2e` — deterministic mock smoke
- Next: run mock E2E green, then harden / WeChat if needed

## 2026-07-24
- Cloned empty repo to `D:\pay\HuaJian_Pay`
- Team spawned: Planner, PayCore, AdminUI, Designer
- Created AGENTS.md, README, gitignore, env example, docs draft
- Pushed main + tag v0.1.0
