# Repository structure map

Canonical layout enforced by `AGENTS.md` §6. **FileManager** owns hygiene; do not add product files at repo root.

```text
HuaJian_Pay/
├── AGENTS.md                 # Team / process / Git / layout rules (root OK)
├── README.md                 # Product entry (root OK)
├── package.json              # Monorepo root scripts
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── .env.example              # Public env template only
├── .gitignore
├── .github/
│   └── workflows/            # CI (optional tooling)
├── apps/
│   ├── server/               # Payment backend (Node)
│   └── admin/                # Vue admin console
├── packages/                 # Shared libs (optional; may be empty)
├── docs/
│   ├── structure.md          # This map
│   ├── architecture.md
│   ├── api.md
│   ├── deployment.md
│   ├── newapi-integration.md
│   ├── security-checklist.md # When present
│   ├── planning/             # task_plan, findings, progress
│   ├── ux/                   # flows, IA, visual system, reviews
│   └── briefs/               # Lead task briefs
├── scripts/                  # E2E / ops (e.g. mock-e2e.mjs)
├── data/                     # Local SQLite runtime (content gitignored)
└── .tmp/<task-id>/           # Temp/diagnostics only (gitignored)
```

## Root policy

Allowed at root: monorepo/tooling entry files, `AGENTS.md`, `README.md`, lockfiles, `.env.example`, `.gitignore`, optional `.github/`.

Not allowed at root: planning notes, UX drafts, business source, logs, DBs, build output, agent temp JSON.

## Classification quick rules

| Kind | Location |
| --- | --- |
| Planning (`task_plan`, `findings`, `progress`) | `docs/planning/` |
| Product / API / ops docs | `docs/` |
| UX / visual / reviews | `docs/ux/` |
| Lead briefs | `docs/briefs/` |
| Backend / admin code | `apps/server`, `apps/admin` |
| Shared libraries | `packages/*` |
| Scripts | `scripts/` |
| Local DB | `data/` (ignored) |
| Temp | `.tmp/<task-id>/` only |

## Gitignore highlights

- Secrets: `.env`, keys/pem
- Runtime: `data/`, `*.db*`
- Build: `dist/`, `build/`, `.output/`, `.cache/`, `coverage/`, `*.tsbuildinfo`
- Temp: `.tmp*`, `tmp/`
- Accidental admin emit: `apps/admin/src/**/*.js(.map)`

## Link checklist when moving files

Update in the same commit:

- `README.md` doc index
- `AGENTS.md` layout tree if structure changes
- Any relative links inside `docs/**`
- Imports only if code paths change (prefer no root code)

Last audited: FileManager task `019f9553-2f5d-7052-833e-d0049d4fdd38`.

## Broken-link audit notes

- Planning docs live under `docs/planning/` only (not repo root).
- Prefer `docs/planning/findings.md` over bare `findings.md` in product docs.
- `docs/security-checklist.md` is optional until the security task lands.
- Root must not list `task_plan.md` / `findings.md` / `progress.md`.

Last link fix: FileManager task `019f9553-2f5d-7052-833e-d0049d4fdd38`.
