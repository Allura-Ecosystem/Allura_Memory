# syntax=docker/dockerfile:1
# Bun-only build — npm/npx are banned (zero-trust supply chain policy)

FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3100
ENV HOSTNAME=0.0.0.0

# Install curl for the health check probe (not present in slim image)
RUN apt-get update -qq && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3100
HEALTHCHECK --interval=20s --timeout=5s --retries=10 \
  CMD curl -f http://127.0.0.1:3100/api/health/live >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
