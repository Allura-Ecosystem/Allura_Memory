/**
 * Real local-process dashboard HTTP/auth contract lane.
 *
 * This inventory intentionally starts its own disposable supported PostgreSQL
 * image and local Next dev processes. It is separate from mocked integration
 * coverage and the full-stack/Ollama E2E lane.
 */
import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    include: ["tests/e2e/dashboard-http-auth.contract.test.ts"],
    passWithNoTests: false,
    testTimeout: 180_000,
    hookTimeout: 180_000,
    teardownTimeout: 30_000,
  },
  resolve: {
    alias: [{ find: "@", replacement: path.resolve(__dirname, "./src") }],
  },
})
