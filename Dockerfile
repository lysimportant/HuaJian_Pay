# syntax=docker/dockerfile:1.7
# HuaJian_Pay multi-stage production image
# Runtime: Node API + SQLite on VOLUME /data. Secrets at runtime only.

ARG NODE_VERSION=20

FROM node:${NODE_VERSION}-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY apps/admin/package.json apps/admin/package.json
RUN mkdir -p packages \
  && pnpm install --frozen-lockfile

FROM deps AS build
COPY apps/server apps/server
COPY apps/admin apps/admin
RUN pnpm --filter @huajian/server build \
  && pnpm --filter @huajian/admin build \
  && pnpm --filter @huajian/server deploy --prod /out/server \
  && test -f /out/server/dist/index.js

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    APP_ENV=production \
    DB_DRIVER=sqlite \
    DB_DSN=/data/huajian_pay.db \
    CHANNEL_MODE=mock

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates tini \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 huajian \
  && useradd --system --uid 1001 --gid huajian --home /app --create-home huajian \
  && mkdir -p /data \
  && chown -R huajian:huajian /data

WORKDIR /app

# Deployed server package (prod deps + package.json + dist)
COPY --from=build --chown=huajian:huajian /out/server ./
# Admin SPA artifacts for extract/CDN/nginx (API does not serve these)
COPY --from=build --chown=huajian:huajian /app/apps/admin/dist ./admin-dist

USER huajian
EXPOSE 8080
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","dist/index.js"]
