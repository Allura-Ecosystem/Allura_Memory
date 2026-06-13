/**
 * Vitest Configuration — Test Lane Architecture
 *
 * Every district gets its own alarm.
 *
 * Lanes:
 *   unit        — Pure logic, no DB, no Ollama, no Notion, no MCP browser
 *   curator     — Auto-Curator and proposal pipeline
 *   integration — Mocked services and contract tests (DB-backed tests with vi.mock)
 *   e2e         — Live stack tests (gated behind RUN_E2E_TESTS=true)
 *   mcp         — MCP browser/static checks
 *
 * Usage:
 *   pnpm test              → unit + curator + integration (safe non-E2E)
 *   pnpm test:unit         → unit only (fast, no external deps)
 *   pnpm test:curator      → curator only
 *   pnpm test:integration  → integration only (mocked services)
 *   pnpm test:e2e          → e2e only (requires live stack)
 *   pnpm test:mcp          — MCP browser checks
 *   pnpm test:all          → typecheck + lint + all lanes + e2e + mcp
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

    // ── Default (pnpm test) — safe non-E2E lanes ──────────────────────────
    // Excludes: E2E (needs live stack), MCP browser (needs browser), canonical-memory (flaky in parallel)
    include: [
      "src/lib/**/*.test.ts",
      "src/kernel/**/*.test.ts",
      "src/curator/**/*.test.ts",
      "src/agents/**/*.test.ts",
      "src/team-ram/orchestrator.test.ts",
      "src/team-ram/orchestration-tracing.test.ts",
      "src/team-ram/mcp-skill-executor.test.ts",
      "src/__tests__/auto-curator*.test.ts",
      "src/__tests__/curator-approve.test.ts",
      "src/__tests__/curator-reject.test.ts",
      "src/__tests__/sync-contract.test.ts",
      "src/__tests__/memory-search-ruvector.test.ts",
      "src/__tests__/notion-sync*.test.ts",
      "src/__tests__/notion-projection-sync.test.ts",
      "src/__tests__/api-degradation.test.ts",
      "src/__tests__/auth-middleware.test.ts",
      "src/__tests__/auth-roles.test.ts",
      "src/__tests__/permission-profile.test.ts",
      "src/__tests__/mission-control-route-parity.test.ts",
      "src/__tests__/cors-middleware.test.ts",
      "src/__tests__/health-metrics.test.ts",
      "src/__tests__/health-metrics-scope.test.ts",
      "src/__tests__/health-probes.test.ts",
      "src/__tests__/curator-approve-route.test.ts",
      "src/__tests__/curator-reject-route.test.ts",
      "src/__tests__/mcp-catalog.test.ts",
      "src/__tests__/mcp-streamable-http.test.ts",
      "src/__tests__/neo4j-writer-errors.test.ts",
      "src/__tests__/watchdog-sustained.test.ts",
      "src/__tests__/sentry-integration.test.ts",
      "src/__tests__/sentry-wiring.test.ts",
      "src/__tests__/contract-validation.test.ts",
      "src/__tests__/byok-key-manager.test.ts",
      "src/__tests__/generate-agent.test.ts",
      "src/__tests__/knowledge-hub-bridge.test.ts",
      "src/__tests__/parity-test.test.ts",
      "src/__tests__/schema-versioning.test.ts",
      "src/__tests__/backup-automation.test.ts",
      "src/__tests__/retrieval-gateway.test.ts",
      "src/__tests__/workspace-isolation.test.ts",
      "src/__tests__/memory-api-schemas.test.ts",
      "src/__tests__/governance-tools.test.ts",
      "src/__tests__/audit-tools.test.ts",
      "src/integrations/mcp.client.test.ts",
      "src/lib/ruvector/bridge.test.ts",
      "src/lib/ruvector/retrieval-adapter.test.ts",
      "src/lib/ruvector/embedding-service.test.ts",
      "src/lib/neo4j/connection.test.ts",
      "src/lib/postgres/connection.test.ts",
      // SDK unit tests (Story 12.3)
      "src/sdk/**/*.test.ts",
      // Server actions (Stories 16.5, 16.6)
      "src/server/**/*.test.ts",
      // Dashboard pages (Story 16.4)
      "src/__tests__/dashboard-approvals.test.ts",
      // Inspector entity views
      "src/__tests__/inspector-views.test.tsx",
      // Dashboard operational state tests (Tasks 5-8)
      "src/__tests__/dashboard-pages-5-8.test.ts",
    ],
    exclude: [
      // E2E tests — require live stack
      "src/__tests__/e2e-integration.test.ts",
      "src/__tests__/curator-pipeline.e2e.test.ts",
      "src/__tests__/ruvector-e2e.test.ts",
      "src/team-ram/e2e-smoke.test.ts",
      // canonical-memory — DB-backed integration test, flaky in parallel
      "src/__tests__/canonical-memory.test.ts",
      // DB-backed tests that need live connections — E2E lane
      "src/lib/neo4j/queries/*.test.ts",
      "src/lib/postgres/queries/*.test.ts",
      "src/lib/postgres/trace-logger.test.ts",
      // DB-backed checkpoint continuation proof — e2e lane only (Story 12.2)
      "src/lib/process-engine/checkpoint-continuation.integration.test.ts",
      // group-governance tests are E2E-gated (RUN_E2E_TESTS=true). Keep excluded from default lane.
      // They are included in the e2e lane via vitest.config.e2e.ts.
      "src/lib/validation/group-governance.test.ts",
      "src/lib/validation/trace-ref.test.ts",
      "src/lib/agents/agent-manifest.test.ts",
      // MCP browser — separate lane
      "tests/mcp/**/*.test.ts",
    ],

    // ── Timeout settings ───────────────────────────────────────────────────
    testTimeout: 15_000,
    hookTimeout: 30_000,
    teardownTimeout: 10_000,

    // ── Coverage (optional) ──────────────────────────────────────────────
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
    },
  },

  resolve: {
    alias: [
      {
        find: "@",
        replacement: path.resolve(__dirname, "./src"),
      },
      {
        find: "@mcp-docker/playwright",
        replacement: path.resolve(__dirname, "./tests/mcp/browser/__mocks__/@mcp-docker/playwright.ts"),
      },
      {
        find: "@mcp-docker/next-devtools",
        replacement: path.resolve(__dirname, "./tests/mcp/integration/__mocks__/@mcp-docker/next-devtools.ts"),
      },
    ],
  },
})
