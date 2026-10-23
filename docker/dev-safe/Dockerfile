FROM oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4

WORKDIR /app
ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package.json bun.lock ./
COPY packages ./packages
RUN bun install --frozen-lockfile
COPY . .

EXPOSE 4002
CMD ["bun", "--no-env-file", "node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "0.0.0.0", "--port", "4002"]
