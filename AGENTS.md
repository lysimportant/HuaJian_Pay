# HuaJian_Pay — Agents Guide

**Repository:** https://github.com/lysimportant/HuaJian_Pay.git
**Workspace:** `D:\pay\HuaJian_Pay`  
**Encoding:** UTF-8  
**Language:** English for code identifiers, APIs, paths, branch names and tags; Chinese for product copy, documentation and Git commit summaries.

---

## 1. Current Project Baseline

HuaJian_Pay is a Node.js/TypeScript payment gateway for newapi, compatible with common YiPay-style merchant requests.

Implemented baseline:

- Fastify + Drizzle ORM + SQLite backend.
- Vue 3 + Vite + Naive UI Admin console.
- YiPay-style submit/query/sign/notify flow.
- Official Alipay RSA2 pre-create and notify verification.
- WeChat Pay APIv3 Native and notify verification/decryption.
- Mock channel, deterministic E2E, Docker/deployment skeleton.
- Multi-user Admin RBAC, personal profile/password update, account CRUD.
- Light/dark/system themes, full-height responsive sidebar, route transitions, Message feedback and KPI count-up animation.

Production truth:

- SQLite is implemented; MySQL is not implemented.
- Official Alipay/WeChat credentials are required for stable production callbacks. A personal collection code is not an official callback channel.
- Fresh-seed demo account is `admin / 12345678`; production deployment must replace it with a strong unique password and rotate `APP_SECRET`/`PLATFORM_KEY`.

---

## 2. Current Team State

- **Lead (Aion CLI) is the only current team member.**
- Former BackendReviewer-Grok, PayPageUI, FileManager, E2EFixer, Coder, Planner, Backend, UI and Integrator slots have been removed. Never assume an old slot is online and never send work to a retired slot.
- Historical task ownership is audit history only; it does not represent current availability.
- If new helpers are needed, Lead must first read the live assistant catalog, propose the helper name/responsibility/assistant choice to the user, and wait for explicit approval, unless the user explicitly requests immediate creation.
- After a lineup is approved, Lead may assign, retry, pause, resume, or replace those helpers without asking for approval for every routine action.

Suggested temporary scopes when approved:

- **Backend:** `apps/server/`, schema/migrations, protocol and security tests.
- **Admin UI:** `apps/admin/`, responsive/visual/interaction QA.
- **Integrator:** root tooling, CI/Docker, E2E, documentation and repository hygiene.
- **Reviewer:** read-only-first RBAC, payment-security and UI regression review.

---

## 3. Product and Security Invariants

### 3.1 Payments

- Store money as integer cents (`amount_cents`).
- Verify signature, merchant/app identity, order number, amount, currency and payment status before marking paid.
- Order state only moves forward; callbacks and merchant notifications must be idempotent.
- Merchant async notify success is the exact plain text required by the protocol.
- Never log or return private keys, APIv3 keys, hashes, full secrets or raw sensitive credentials.

### 3.2 Admin RBAC — fail closed

Roles:

- `super_admin`: full account and system administration.
- `admin`: account management and write operations allowed by the backend permission matrix.
- `viewer`: personal profile/password and explicitly allowed read-only functions only.

Mandatory rules:

- Unknown, missing, stale or failed-to-load roles are treated as `viewer`, never as an administrator.
- Account management UI renders only after `/admin/api/me` succeeds and the returned role is exactly `admin` or `super_admin`.
- A viewer must never see account list/create/edit/delete controls.
- Frontend hiding is not authorization. Account APIs must independently return `403` for viewers.
- `/admin/api/me` and other identity-sensitive Admin responses must be non-cacheable and vary by authorization so switching accounts cannot reuse the previous administrator profile.
- Prevent deleting/disabling the current account and the final enabled administrator.
- Username, role, status and password changes must invalidate prior tokens when required.

### 3.3 Admin UI regression gates

- Desktop sidebar: fixed `232px`, full viewport height on Dashboard, Orders, Merchants and Settings; main uses all remaining width with `min-width: 0` and no accidental content max-width.
- Mobile: sidebar hidden at the agreed breakpoint; drawer/hamburger available.
- Theme control remains visible; light↔dark changes on one click; system mode remains available.
- A failed login produces one Message only.
- Button operations provide success/error Message feedback.
- KPI count-up and page transitions respect `prefers-reduced-motion`.

---

## 4. Git Rules

Default branch: `main`.

1. Complete one reviewable step → test → commit → push.
2. Use Conventional Commit type/scope with a Chinese summary, for example:
   - `fix(admin): 修复普通用户账号管理越权显示`
   - `docs(agents): 更新当前团队与权限规则`
   - `chore(repo): 清理临时文件`
3. Use annotated SemVer tags for major milestones and push the tag.
4. Never force-push `main`, amend published commits, or use `--no-verify` unless the user explicitly requires it.
5. Never commit `.env`, databases, private keys, certificates, API keys, passwords or hashes.
6. Check `git status`, `git diff` and tests before every commit; verify `HEAD == origin/main` after push.

---

## 5. Execution and Recovery Rules

- Read this file and the relevant current source before editing.
- Use incremental edits; do not overwrite another active writer.
- Preserve working artifacts on recoverable failures; resume from the last verified checkpoint.
- Network/429/5xx/timeout/provider errors use bounded retries; no retry storms.
- Keep temp files under `.tmp/<task-id>/`; never create patch scripts or message dumps in repository root.
- Stop or reassign helpers that exceed the agreed timeout or repeatedly overwrite shared files.
- Helpers report only concrete checkpoints, blockers, errors or completion; repeated ACK/idle spam is prohibited.
- Lead validates actual files, Git state and executable tests; an idle notification is not completion evidence.

### DR-10M

- Enabled by default: at most 10 successful model/provider calls in a rolling 60-second window for the whole team.
- Do not bypass the limit by spawning helpers or switching providers/accounts.

### HTR-90

- Enabled by default for model/provider/gateway requests.
- Cancel if no valid first content by 30 seconds or total duration reaches 90 seconds; preserve partial verified results and resume.

---

## 6. Repository and Root Hygiene

`D:\pay` may contain only:

- `HuaJian_Pay\` — this repository.
- `.aionrs\` — Aion runtime/skill configuration currently used by the assistant; it is not project code but must not be deleted while the Aion environment depends on it.

Repository root may contain only project/tooling entry files such as:

- `AGENTS.md`, `README.md`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`.
- `.env.example`, `.gitignore`, Docker/Compose configuration and required root TypeScript/tool configs.

Classification:

- Runtime code → `apps/*` or `packages/*`.
- Product/API/deployment/security docs → `docs/`.
- Planning → `docs/planning/`; UX → `docs/ux/`; task briefs → `docs/briefs/`.
- Scripts/tests → `scripts/` or the owning app's `scripts/` directory.
- Local DB → `data/` (ignored).
- Logs/screenshots/patches/temp DB/build diagnostics → `.tmp/<task-id>/` (ignored and removable when no process uses them).
- Generated `dist/`, coverage and caches are not source and must stay ignored.
- Do not delete `.env`, active database data, valid fixtures, dependencies required for running, or Aion runtime files merely because they are untracked/ignored.

When moving or deleting tracked files, update imports, scripts and documentation links in the same commit.

---

## 7. Required Verification

Use the smallest relevant set, then the full regression gate before release:

```powershell
pnpm typecheck
pnpm build
pnpm --filter @huajian/admin typecheck
pnpm --filter @huajian/admin build
pnpm test:admin-users
pnpm test:admin-ui-static
pnpm test:theme-toggle
pnpm test:mock-e2e
pnpm test:wechat-apiv3
```

For UI layout complaints, Lead must inspect the running UI at multiple widths and relevant routes; typecheck/build alone is not visual QA.

---

*Last updated by Lead (Aion CLI). This file is the current operating source of truth for all future helpers.*
