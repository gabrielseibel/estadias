# ─────────────────────────────────────────────────────────────────────────────
# API e worker do Radar Competitivo.
# A mesma imagem serve os dois processos: o comando decide qual papel executa.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
# openssl é exigido pelo engine do Prisma no Alpine.
RUN apk add --no-cache openssl

# ── Dependências (camada cacheada enquanto o lockfile não mudar) ─────────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=apps/api --include-workspace-root

# ── Build ────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY apps/api apps/api
RUN npm run db:generate --workspace=apps/api && npm run build --workspace=apps/api

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json package.json
COPY --from=build /app/apps/api/node_modules apps/api/node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/package.json apps/api/package.json
# O schema e as migrations acompanham a imagem para permitir `migrate deploy`.
COPY --from=build /app/apps/api/prisma apps/api/prisma

WORKDIR /app/apps/api
USER node
EXPOSE 4000
CMD ["node", "dist/src/main.js"]
