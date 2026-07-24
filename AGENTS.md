# HuaJian_Pay — Agents Guide

**Platform:** HuaJian_Pay  
**Repo:** https://github.com/lysimportant/HuaJian_Pay.git  
**Workspace:** `D:\pay\HuaJian_Pay`  
**Encoding:** UTF-8  
**Language:** English for code, paths, commits, tags, branch names; Chinese OK for product copy and user docs.

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
| **Planner** | Architecture & planning | `task_plan.md`, `findings.md`, `progress.md`, module split, data model, API sketch, security baseline | Large code dumps |
| **PayCore** | Payment backend | Server, DB, Alipay/WeChat adapters, sign/notify, orders, reconcile, YiPay-style API | Pixel-perfect UI polish |
| **AdminUI** | Admin / merchant frontend | Console pages, forms, order lists, channel settings UX wiring | Payment crypto / bank protocol internals |
| **Designer** | UX / UI system | Information architecture, flows, visual tokens, component guidance | Production backend logic |

### Responsibility detail

#### Planner
- Survey YiPay open protocols and realistic Alipay/WeChat personal/merchant receive options.
- Decide stack (recommend Node/Go/PHP only after findings; prefer maintainable modern stack).
- Produce architecture, ER diagram notes, env vars, deploy notes.
- Keep plan files updated as truth for teammates.

#### PayCore
- Implement payment core from plan: orders, channels, callbacks, idempotency, signature verify, retry notify.
- Alipay path first: configure Alipay account / app credentials → money lands correctly.
- WeChat path second if credentials model is clear.
- Provide API docs for newapi integration.
- Every completed step: commit + push (see Git rules).

#### AdminUI
- Build admin + merchant UI against backend APIs.
- Screens: login, dashboard, channels (Alipay/WeChat), orders, notify logs, system settings, API credentials.
- English code; Chinese UI labels OK.

#### Designer
- Define IA and critical flows: “fill Alipay account → receive money”, order lookup, notify failure handling.
- Provide layout/visual guidance AdminUI can implement without redesign thrash.

---

## 3. Git Rules (mandatory)

Repo: `https://github.com/lysimportant/HuaJian_Pay.git`  
Default branch: `main`

1. **Push after every completed step**  
   - Finish a meaningful unit of work → `git add` → commit → `git push origin <branch>`.  
   - Do not batch many unrelated steps without intermediate pushes if the step is already reviewable.

2. **Commit message style**  
   - English, imperative, scoped:  
     - `feat(pay): add alipay notify verify`  
     - `docs(agents): define team responsibilities`  
     - `chore(git): add gitignore and readme`

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
5. Chinese product UX OK; **code identifiers, APIs, git, paths in English**.
6. After each assigned task slice: update progress notes + commit + push.
7. Dependent work is sequential: do not park a teammate on “wait until X finishes” (timeout risk). Lead dispatches B only after A reports done.

---

## 6. Suggested Directory Layout (v0.1 scaffold)

```text
HuaJian_Pay/
  AGENTS.md
  README.md
  .gitignore
  docs/
    architecture.md
    api.md
    newapi-integration.md
  apps/                 # or services/ depending on stack decision
  packages/             # shared libs if monorepo
  scripts/
  .env.example
  task_plan.md          # Planner
  findings.md           # Planner
  progress.md           # Planner / team
```

Stack is **not frozen** until Planner publishes findings. Early preference: simple deployable backend + web admin, MySQL/SQLite, Redis optional.

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

1. Scaffold repo + this AGENTS + push + tag `v0.1.0`
2. Planner: architecture & Alipay/WeChat feasibility findings
3. PayCore: payment core (Alipay first)
4. AdminUI + Designer: console and flows
5. newapi integration doc + end-to-end verify

---

*Last updated by Lead (Aion CLI). All teammates must follow this document.*
