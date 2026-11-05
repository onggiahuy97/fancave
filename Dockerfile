# Multi-stage build: one image for the Colyseus server, one Caddy image that serves the
# client build and proxies WebSockets to the server.

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /app

# ---- dependencies + build --------------------------------------------------------
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY client/package.json client/
COPY server/package.json server/
COPY shared/package.json shared/
# Optional build secret `extra_ca`: extra root CA(s) for building behind a TLS-inspecting
# proxy (docker build --secret id=extra_ca,src=ca.pem). Not needed on a normal VPS.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm install --frozen-lockfile
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm --filter @fancave/client build \
 && pnpm --filter @fancave/server build \
 && pnpm --filter @fancave/server deploy --prod --legacy /out/server

# ---- game server -----------------------------------------------------------------
FROM node:22-alpine AS server
ENV NODE_ENV=production PORT=2567
WORKDIR /app
COPY --from=build --chown=node:node /out/server/package.json ./
COPY --from=build --chown=node:node /out/server/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server/dist ./dist
USER node
EXPOSE 2567
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:2567/health >/dev/null || exit 1
CMD ["node", "--enable-source-maps", "dist/index.cjs"]

# ---- web (static client + HTTPS + WebSocket proxy) --------------------------------
FROM caddy:2.8-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/client/dist /srv
