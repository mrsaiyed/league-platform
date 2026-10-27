# Live stats server. Runs on any host that runs containers: Render, Railway, Fly.io,
# Google Cloud Run (one instance), or a small VPS. Set DATABASE_URL,
# LIVE_STATS_PUBLIC_URL and LIVE_STATS_SCORER_PASSCODE on the host; see
# docs/operations/live-stats-hosting.md.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY packages packages
COPY apps/live-stats apps/live-stats
COPY examples/alhadi-school/assets/ahs-lions.png examples/alhadi-school/assets/alhadi-logo.png examples/alhadi-school/assets/
# Only used without DATABASE_URL, for the embedded database on a mounted volume.
RUN mkdir .local && chown node:node .local
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "apps/live-stats/server.ts"]
