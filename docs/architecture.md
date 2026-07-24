# Architecture (draft)

> Planner will replace this draft with locked decisions after research.

## Context

- Product: HuaJian_Pay
- Upstream business: newapi
- Protocol target: YiPay-compatible merchant API where practical
- Channels: Alipay first, WeChat second

## High-level components

1. **API Gateway / HTTP server** — merchant create-order, query, notify ingress
2. **Order service** — create, pay, success, expire, idempotency
3. **Channel adapters** — Alipay, WeChat
4. **Notify worker** — signed callbacks to merchant `notify_url` with retry
5. **Admin API + Web console** — channels, orders, logs, keys
6. **Storage** — orders, merchants, channels, notify attempts

## Open decisions (Planner)

- Language/runtime and framework
- SQLite vs MySQL for MVP
- Exact Alipay product used for “fill Alipay account → receive money”
- Whether personal QR / transfer assist is needed vs official merchant APIs
- WeChat feasibility under same UX constraint

## Security baseline

- HMAC/MD5 sign verify per YiPay-style rules (exact algorithm TBD in findings)
- Amount & order status checks on notify
- Idempotent success transitions
- Secrets only in env / secret store
- Admin auth required for all console mutations
