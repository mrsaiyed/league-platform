# syntax=docker/dockerfile:1
# The platform's one image (step 2.95, record 101, T1 §1): the web app and the worker,
# built once from one commit. NOT the Al-Hadi tracker's image: that is ./Dockerfile, which
# this file never changes.
#
#   Web (the default command):  node scripts/web.mjs start --hostname 0.0.0.0
#                               listens on $PORT (3000 when unset); health /api/v1/health
#   Worker (the host's command for the worker's service):
#                               node --disable-warning=ExperimentalWarning apps/worker/src/main.ts
#
# It holds no setting and no secret: the host gives every setting when it starts it.
# Copied by name only: the root package.json (record 055) and package-lock.json, each
# workspace (each declares its own outside packages, R10), supabase/site.json (the
# tracker's project, which the database guard refuses) and supabase/migrations. Never a
# .env file: platform.Dockerfile.dockerignore lets in only these paths and shuts out every
# .env*. tests/platform-image.test.mjs holds this file to these promises; GitHub builds it
# and starts it on every push (.github/workflows/ci.yml, job "image"), publishing nothing.

FROM node:24-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/contracts/package.json packages/contracts/
COPY packages/core/package.json packages/core/
COPY packages/database/package.json packages/database/
COPY packages/emails/package.json packages/emails/
COPY packages/observability/package.json packages/observability/
COPY packages/providers/package.json packages/providers/
COPY packages/site/package.json packages/site/
COPY packages/sports/package.json packages/sports/
COPY packages/ui/package.json packages/ui/
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.base.json ./
COPY apps/web apps/web
COPY apps/worker apps/worker
COPY packages packages
COPY scripts/web.mjs scripts/web-listen.mjs scripts/
COPY supabase/site.json supabase/
COPY supabase/migrations supabase/migrations
RUN node scripts/web.mjs build && rm -rf apps/web/.next/cache

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/contracts/package.json packages/contracts/
COPY packages/core/package.json packages/core/
COPY packages/database/package.json packages/database/
COPY packages/emails/package.json packages/emails/
COPY packages/observability/package.json packages/observability/
COPY packages/providers/package.json packages/providers/
COPY packages/site/package.json packages/site/
COPY packages/sports/package.json packages/sports/
COPY packages/ui/package.json packages/ui/
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY tsconfig.base.json ./
COPY apps/web apps/web
COPY apps/worker apps/worker
COPY packages packages
COPY scripts/web.mjs scripts/web-listen.mjs scripts/
COPY supabase/site.json supabase/
COPY supabase/migrations supabase/migrations
COPY --from=build --chown=node:node /app/apps/web/.next apps/web/.next
USER node
EXPOSE 3000
CMD ["node", "scripts/web.mjs", "start", "--hostname", "0.0.0.0"]
