/**
 * Vitest Config — E2E Lane
 *
 * Live stack tests. Requires PostgreSQL, Neo4j, Ollama, and full service stack.
 * Gated behind RUN_E2E_TESTS=true environment variable.
 * Do NOT run in CI unless the full stack is available.
 *
 * canonical-memory.test.ts lives here because it makes real DB connections.
 */
import { config } from "dotenv"
import { defineConfig } from "vitest/config"
import path from "node:path"

config()

export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    passWithNoTests: true,
    include: [
      "src/__tests__/e2e-integration.test.ts",
      "src/__tests__/curator-pipeline.e2e.test.ts",
      "src/__tests__/ruvector-e2e.test.ts",
      "src/__tests__/canonical-memory.test.ts",
      "src/team-ram/e2e-smoke.test.ts",
      // Validation tests that need live DB for trace-ref verification
      "src/lib/validation/group-governance.test.ts",
      "src/lib/validation/trace-ref.test.ts",
      // Story 12.2 — true checkpoint continuation against live PostgreSQL
      "src/lib/process-engine/checkpoint-continuation.integration.test.ts",
    ],
    testTimeout: 60_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
    ],
  },
})