# HuaJian_Pay — Agents Guide

**Platform:** HuaJian_Pay  
**Repo:** https://github.com/lysimportant/HuaJian_Pay.git  
**Workspace:** `D:\pay\HuaJian_Pay`  
**Encoding:** UTF-8  
**Language:** English for code identifiers, APIs, paths, tags, and branch names; use Chinese for Git commit/push summaries, product copy, and user docs.

---

## 1. Product Goal

Build a lightweight **YiPay-compatible payment collection platform** for **newapi** billing.

### Must-have (MVP)
- Merchant fills **Alipay account** and can receive payments to that account.
- Create order → pay page / QR → async notify → order success.
- Admin/merchant console: channel config, orders, notify logs, API keys.
- Compatible with common **YiPay (易支付)** style merchant API where practical (`pid`, `key`, `notify_url`, `return_url`, sign rules).
- Integrate cleanly with **newapi** as the business upstream caller.

### Should-have (same MVP if feasible)
- **WeChat Pay** channel with the same “receive to configured account/app” effect when credentials allow.

### Non-goals (v1)
- Multi-currency / crypto.
- Full bank settlement network.
- Heavy multi-tenant SaaS billing beyond single-operator + merchants.

---

## 2. Team Roster & Responsibilities

| Name | Role | Owns | Does NOT own |
| --- | --- | --- | --- |
| **Aion CLI** | Lead | Task board, sequencing, review, Git release policy, synthesis to user | Day-to-day feature coding |
| **Planner** | Architecture & planning | `docs/planning/*` plan files, module split, data model, API sketch, security baseline | Large code dumps |
| **Coder** | Feature / payment coding | Backend+frontend feature implementation, bugfix, tests, adapters | Pure visual design tokens only |
| **PayCore / E2EFixer** | Payment backend / verification | Server, DB, Alipay/WeChat, sign/notify, mock E2E | Pixel-perfect UI polish |
| **AdminUI** | Admin / merchant frontend wiring | Console pages, forms, API wiring | Payment crypto internals |
| **UIPolish** | Visual UI beauty | Visual polish, theme, spacing, hierarchy, component styling to look premium | Backend protocol / DB schema |
| **FileManager** | Repository file hygiene | Directory structure, moves, `.gitignore`, prevent root clutter, classify files by type | Business feature logic |
| **Designer** | UX / UI system | Information architecture, flows, visual tokens, component guidance | Production backend logic |

### Responsibility detail

#### Planner
- Survey YiPay open protocols and realistic Alipay/WeChat personal/merchant receive options.
- Decide stack (recommend Node/Go/PHP only after findings; prefer maintainable modern stack).
- Produce architecture, ER diagram notes, env vars, deploy notes under `docs/`.
- Keep plan files under `docs/planning/` updated as truth for teammates.

#### Coder
- Dedicated implementation role for production code (server, admin, shared packages, tests).
- Prefer small reviewable commits; push each completed slice.
- Follow directory layout and do not dump new files into repo root.

#### PayCore / E2EFixer
- Implement payment core: orders, channels, callbacks, idempotency, signature verify, retry notify.
- Alipay path first; WeChat second if credentials model is clear.
- Keep mock E2E single-command and deterministic.
- Every completed step: commit + push (see Git rules).

#### AdminUI
- Build admin + merchant UI against backend APIs.
- Screens: login, dashboard, channels (Alipay/WeChat), orders, notify logs, system settings, API credentials.
- English code; Chinese UI labels OK.

#### UIPolish
- Make the admin/pay UI **look good**: visual hierarchy, color system, cards, tables, empty/error states, mobile density.
- Implement visual tokens from Designer; prefer CSS/theme files under `apps/admin/src/styles/` and shared components under `apps/admin/src/components/`.
- Do not invent new API contracts.

#### FileManager
- Enforce classified directories; move misplaced files; keep root minimal.
- Own `.gitignore` hygiene and temp isolation under `.tmp/<task-id>/`.
- Never delete user/business content without Lead authorization; prefer `git mv` preserving history.

#### Designer
- Define IA and critical flows: “fill Alipay account → receive money”, order lookup, notify failure handling.
- Provide layout/visual guidance AdminUI/UIPolish can implement without redesign thrash.

---

## 3. Git Rules (mandatory)

Repo: `https://github.com/lysimportant/HuaJian_Pay.git`  
Default branch: `main`

1. **Push after every completed step**  
   - Finish a meaningful unit of work → `git add` → commit → `git push origin <branch>`.  
   - Do not batch many unrelated steps without intermediate pushes if the step is already reviewable.

2. **Commit message style**  
   - 使用中文摘要，保留英文 Conventional Commit 类型与可选 scope：
     - `feat(pay): 增加支付宝回调验签`
     - `docs(agents): 明确团队职责`
     - `chore(git): 完善忽略规则和项目说明`

3. **Tags for major versions / large milestones**  
   - Tag format: `vMAJOR.MINOR.PATCH` (semver).  
   - Examples: `v0.1.0` scaffold, `v0.2.0` alipay MVP, `v1.0.0` production-ready.  
   - Create annotated tags: `git tag -a v0.1.0 -m "scaffold: project skeleton"` then `git push origin v0.1.0`.

4. **Branching (lightweight)**  
   - Small team may work on `main` for early scaffold if conflicts are low.  
   - Prefer feature branches when parallel: `feat/alipay-core`, `feat/admin-ui`.  
   - Merge via PR when possible; direct push to `main` OK for early empty-repo bootstrap by Lead.

5. **Never force-push `main`** unless user explicitly orders it.  
6. **Never commit secrets** (`.env`, private keys, certs). Use `.env.example` only.

---

## 4. Cross-Team Execution Rules (v1.1)

**Full text is binding for every current and future teammate.**

### 4.1 Principles
- Keep tasks moving until done, clearly blocked, or paused by user.
- On recoverable errors: keep files/logs/state; resume from last success; never wipe and restart.
- Recovery order: inventory → last success node → log error → bounded backoff → retry unfinished → verify → continue.
- Do not start unbounded retry storms across members.
- Token/API cost does not justify weak recovery (subject to DR-10M).

### 4.2 Recoverable faults
Treat as recoverable: provider rate limits (429), gateway/network/DNS failures, 5xx, timeouts, truncated/decode errors, temporary auth/route issues, and other transient provider errors.

### 4.3 90s no-content strategy
- If no valid response content within 90s after request start → cancel/discard and resume unfinished part from last good breakpoint.
- If any valid content arrives within 90s, do not cancel solely because total duration exceeds 90s **unless HTR-90 is also active (see below)**.
- Retries must reuse verified artifacts.

### 4.4 Breakpoint resume
- Before retry: inventory task status, files, git status/diff, last verified node.
- Do not re-run verified steps unless invalidated.
- Incremental edits only after reading current files.
- Report which breakpoint you resumed from.

### 4.5 Temp files
- Temp/diagnostics only under task-specific subdirs (e.g. `.tmp/`, `tmp/task-id/`).
- Do not pollute repo root or ship logs into delivery dirs unless required.

### 4.6 DR-10M (Ten-call gate)
- Shared rolling **60s window**, max **10 successful** model/provider calls for the **whole team**.
- Failures/timeouts/cancels do not count as successes, but still avoid storms.
- Lead coordinates budget; members must not spawn new agents to bypass.
- User phrases to pause/resume:  
  - Pause: `取消 DR-10M 规则` / `停用十次闸门`  
  - Resume: `启用 DR-10M 规则` / `启用十次闸门`  
- **Default: ENABLED** unless user paused.

### 4.7 HTR-90 (Hard 90s gate) — ENABLED
- Each model/provider/gateway request hard-capped at **90s total**. Cancel at 90s even if partial content arrived.
- If first valid content not seen by **30s**, cancel early.
- If runtime cannot cancel, discard late results after regain control; resume from last success.
- Log: member, task id, total time, TTFB, breakpoint, cancel method, retry result.
- HTR-90 does not override DR-10M.

### 4.8 Roles under these rules
- Lead: budget, priority, cross-member recovery.
- Members: report call need, errors, success count, breakpoints; no concurrent retries near DR-10M limit.
- New members must read this file before work.
- Handoffs must include artifacts, progress, errors, last success, unfinished steps, budget state.

### 4.8.1 Autonomous task dispatch and reporting (mandatory)
- **Do not ask the user to confirm individual teammate tasks, assignments, wake-ups, replacements, or routine recovery actions.** The user has granted the Lead standing authority to dispatch and adjust work directly.
- The Lead creates, assigns, sequences, pauses, resumes, reassigns, or replaces teammates as required by the task and these rules, without a separate user approval turn.
- A member receiving a task must start execution immediately. Do not ask the user for confirmation and do not remain idle while an assigned, unblocked task is incomplete.
- Members report through `team_send_message` to the **Lead**, not directly to the user.
- A member must report to the Lead when:
  1. a meaningful step or the whole task is complete (include files, commit/push hash, tests, residual risks, next breakpoint);
  2. an error, timeout, network/provider failure, validation failure, merge conflict, or other blocker occurs (include evidence, existing artifacts, last success, retry count, and proposed recovery entry);
  3. requirements conflict or a decision is needed that cannot be resolved from repository docs or current task context.
- The Lead reviews each report and decides whether to accept, request fixes, retry from a breakpoint, reassign, sequence dependent work, or escalate a genuine product decision to the user.
- Routine ACK/status spam is prohibited. Report only completion, concrete progress checkpoints requested by Lead, actionable errors, or clear blockers.
- Idle notifications are signals for Lead monitoring, not completion. If an unblocked task remains incomplete, the Lead must wake/reassign the member based on actual files, Git state, and test evidence.

### 4.9 Checklist (every recovery)
- [ ] Error type recorded?
- [ ] Treated as recoverable?
- [ ] Artifacts preserved?
- [ ] Resume from last success (not full redo)?
- [ ] HTR-90 first-byte 30s / total 90s enforced?
- [ ] Late results discarded if uncancellable?
- [ ] git status/diff checked when in git workspace?
- [ ] Timeout metadata logged?
- [ ] Bounded backoff, no storm?
- [ ] Temp files isolated?
- [ ] DR-10M enabled? under 10 successes / 60s?
- [ ] Lead coordinated budget?
- [ ] No bypass via team/provider/account switch?
- [ ] Verified output + residual risks + next resume point reported?

---

## 5. Working Agreements

1. Read this `AGENTS.md` before coding.
2. Prefer plan files from Planner over tribal memory.
3. Bug fix order: **locate → fix behavior → types/style last**.
4. Security first for payment: verify sign, idempotent notify, amount/order match, no secret leakage.
5. Chinese product UX and Git commit/push summaries are required; **code identifiers, APIs, paths, tags, and branch names remain in English**.
6. After each assigned task slice: update progress notes + commit + push.
7. Dependent work is sequential: do not park a teammate on “wait until X finishes” (timeout risk). Lead dispatches B only after A reports done.

---

## 6. Directory Layout

Canonical tree map: `docs/structure.md` (maintained by FileManager). & File Classification (mandatory)

**Do not dump everything into the repo root.** Same category → same folder. English path names only.

```text
HuaJian_Pay/
  AGENTS.md                 # team rules only (root OK)
  README.md                 # product entry only (root OK)
  package.json              # monorepo root
  pnpm-workspace.yaml
  .env.example
  .gitignore
  apps/
    server/                 # payment backend
    admin/                  # Vue admin console
  packages/                 # shared libs (optional)
  docs/
    architecture.md
    api.md
    deployment.md
    newapi-integration.md
    security-checklist.md
    planning/               # task_plan, findings, progress
    ux/                     # flows, IA, visual system, reviews
    briefs/                 # Lead task briefs
  scripts/                  # e2e / ops scripts
  data/                     # local sqlite (gitignored content)
  .tmp/<task-id>/           # temp only; never ship as product
```

### Classification rules
1. Root may only hold monorepo/tooling entry files + `AGENTS.md` + `README.md`.
2. Planning notes → `docs/planning/` (not root).
3. Product/API/ops docs → `docs/`.
4. UX docs → `docs/ux/`.
5. Lead briefs → `docs/briefs/`.
6. Runtime code → `apps/*` or `packages/*`.
7. Scripts → `scripts/`.
8. Temporary diagnostics → `.tmp/<task-id>/` only.
9. **FileManager** owns reorganizations; others create files in the correct folder from the start.
10. When moving files, update imports/README links in the same commit.

---

## 7. Milestone Tags (initial plan)

| Tag | Meaning |
| --- | --- |
| `v0.1.0` | Scaffold + AGENTS + README + Git rules |
| `v0.2.0` | Architecture plan approved / locked |
| `v0.3.0` | Order + Alipay receive MVP |
| `v0.4.0` | Admin console MVP |
| `v0.5.0` | WeChat channel (if feasible) |
| `v1.0.0` | newapi-ready production baseline |

Lead may adjust tags when scope changes.

---

## 8. Immediate Priority Order

1. Keep mock E2E single-command green (`pnpm test:mock-e2e`)
2. FileManager: classify root planning files into `docs/planning/`
3. Coder: backend/frontend feature work as assigned
4. UIPolish: premium visual polish for admin console
5. Deployment/security docs accuracy + newapi-ready baseline

---

*Last updated by Lead (Aion CLI). All teammates must follow this document.*
