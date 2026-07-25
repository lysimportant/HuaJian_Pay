# syntax=docker/dockerfile:1.6
# HuaJian_Pay multi-stage image:
# - builds @huajian/server + @huajian/admin
# - ships production layout via `pnpm deploy --prod`
# - also keeps admin SPA dist at /app/admin-dist for compose web profile

ARG NODE_VERSION=20

# ---------- deps ----------
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /src
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/admin/package.json apps/admin/
RUN pnpm install --frozen-lockfile

# ---------- build ----------
FROM deps AS build
WORKDIR /src
COPY . .
RUN pnpm --filter @huajian/server build \
 && pnpm --filter @huajian/admin build \
 && pnpm --filter @huajian/server deploy --prod /out/server \
 && mkdir -p /out/admin-dist \
 && if [ -f apps/admin/dist/index.html ]; then cp -a apps/admin/dist/. /out/admin-dist/; fi

# ---------- runtime ----------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    DB_DRIVER=sqlite \
    DB_DSN=/data/huajian_pay.db

RUN groupadd --system --gid 10001 huajian \
 && useradd --system --uid 10001 --gid huajian --home-dir /app --shell /usr/sbin/nologin huajian \
 && mkdir -p /data /app/admin-dist \
 && chown -R huajian:huajian /app /data

COPY --from=build --chown=huajian:huajian /out/server/ ./
COPY --from=build --chown=huajian:huajian /out/admin-dist/ ./admin-dist/

USER huajian
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
