# AdminUI MVP Brief (Lead)

**Task:** `019f94f7-1a77-77f2-920a-a559971ce32a`  
**Status:** in_progress — UNBLOCKED  
**Date:** 2026-07-25  
**Backend tag:** v0.3.0 (`451bf6f` admin API; plan note `a85c254`)

## Sync
```powershell
Set-Location "D:\pay\HuaJian_Pay"
git pull origin main
```

## Read first
- `AGENTS.md`
- `docs/ux/ia.md`, `docs/ux/flows.md`, `docs/ux/visual-system.md`
- `docs/api.md` §6
- `apps/server/src/routes/admin.ts` (endpoint source of truth)

## Stack
- Path: `apps/admin`
- Vue 3 + Vite + TypeScript
- Naive UI preferred (Element Plus OK)
- `VITE_API_BASE=http://localhost:8080`
- Auth: `POST /admin/api/login` → Bearer token on subsequent calls

## Endpoints
- `POST /admin/api/login` `{ username, password }`
- `POST /admin/api/logout`
- `GET /admin/api/me`
- `GET /admin/api/orders`
- `GET /admin/api/orders/:tradeNo`
- `GET|PUT /admin/api/channels/alipay`
- `GET|PUT /admin/api/channels/wechat`
- `GET /admin/api/merchants` (+ create if implemented)

## Pages (Chinese labels OK)
1. Login  
2. Shell layout (sidebar per UX)  
3. Dashboard (simple)  
4. Orders list + detail (+ notify logs if API returns)  
5. Alipay channel config  
6. Merchants / API credentials (mask secrets)

## Git slices (push each)
1. `feat(admin): scaffold Vue3 Vite app`
2. `feat(admin): login and shell layout`
3. `feat(admin): orders list and detail`
4. `feat(admin): alipay channel settings`
5. `feat(admin): merchants credentials page`

No secrets. No force-push. Follow AGENTS DR-10M / HTR-90.

## Out of scope
- Rewriting payment core  
- Live WeChat pay  
- Production deploy polish  
