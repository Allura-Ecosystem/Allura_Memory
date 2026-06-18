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
      // Brain contract — shape stability against live PG/Neo4j
      "tests/integration/brain-contract.test.ts",
      // Validation tests that need live DB for trace-ref verification
      "src/lib/validation/group-governance.test.ts",
      "src/lib/validation/trace-ref.test.ts",
      // Story 12.2 — true checkpoint continuation against live PostgreSQL
      "src/lib/process-engine/checkpoint-continuation.integration.test.ts",
      // Allura Hosted — MCP gateway full round-trip (live PG/Neo4j/ruvector)
      "src/__tests__/hosted-mcp.e2e.test.ts",
      // Task B1 — 10-point acceptance gate against live PG+Neo4j (no mocks)
      "src/__tests__/acceptance-gate.e2e.test.ts",
    ],
    testTimeout: 60_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: [
      { find: "@allura/types", replacement: path.resolve(__dirname, "./packages/types/src/index.ts") },
      { find: "@allura/rbac", replacement: path.resolve(__dirname, "./packages/rbac/src/index.ts") },
      { find: "@allura/mcp-server", replacement: path.resolve(__dirname, "./packages/mcp-server/src/index.ts") },
      { find: "@", replacement: path.resolve(__dirname, "./src") },
    ],
  },
})