# HuaJian_Pay

Lightweight **YiPay-style payment collection platform** for **newapi**.

## Goal

- Configure **Alipay account / credentials** and receive payments.
- Optional **WeChat Pay** when the same “receive money�?effect is achievable.
- Merchant API close to common YiPay conventions for easy newapi integration.
- Simple admin console for channels, orders, and notify logs.

## Status

Bootstrap phase. See `AGENTS.md` for team responsibilities, Git rules, and execution rules.

## Repository

https://github.com/lysimportant/HuaJian_Pay.git

## Quick notes

- Working directory: `D:\pay\HuaJian_Pay`
- Push after every completed step
- Tag major milestones (`v0.1.0`, `v0.2.0`, ...)
- Never commit secrets; use `.env.example`

## Docs

- `AGENTS.md` — team / process / Git / directory layout
- `docs/structure.md` — repository structure map
- `docs/architecture.md` — system architecture
- `docs/api.md` — merchant / admin API sketch
- `docs/deployment.md` — run & deploy (SQLite volume Docker; **MySQL not implemented**)
- `docs/newapi-integration.md` — newapi integration
- `docs/wechat-pay.md` — WeChat APIv3 deploy / certs / notify `/channels/wxpay/notify` / `type=wxpay`
- `docs/planning/` — task plan, findings, progress
- `docs/ux/` — flows, IA, visual system, reviews
- `docs/briefs/` — Lead task briefs

## Containers (skeleton)

- `Dockerfile` — multi-stage (`@huajian/server` runtime + `admin-dist` artifact)
- `docker-compose.yml` — API + named volume `/data` for SQLite; optional profile `admin-ui`
- `.dockerignore` — excludes `.env`, keys, `data/`, local `node_modules`
- `deploy/nginx-admin.conf` — optional Admin SPA + `/admin/api` reverse proxy
- See `docs/deployment.md` for env injection and Admin dual-path (CDN / nginx sidecar)

## Layout (summary)

Root holds only monorepo entry files + `AGENTS.md` / `README.md` (+ container tooling). Runtime code under `apps/`; docs under `docs/`; scripts under `scripts/`; local DB under `data/` (gitignored); temps under `.tmp/<task-id>/`.

## License

Private / TBD by owner.
