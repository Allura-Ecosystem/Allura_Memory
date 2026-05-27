/**
 * Vitest Config — Unit Lane
 *
 * Pure logic only. No database. No Ollama. No Notion. No MCP browser.
 * Pure functions, type validation, scoring, dedup, similarity, etc.
 *
 * If a test needs PostgreSQL, Neo4j, or any external service, it belongs
 * in the integration lane — NOT here.
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
      // ── Pure unit tests (no DB, no external services) ──────────────────
      // Scoring, dedup, similarity, budget, circuit breaker
      "src/lib/curator/**/*.test.ts",
      "src/lib/budget/**/*.test.ts",
      "src/lib/circuit-breaker/**/*.test.ts",
      "src/lib/dedup/**/*.test.ts",
      "src/lib/memory/config.test.ts",
      "src/lib/memory/embeddings.test.ts",
      "src/lib/memory/types.test.ts",
      "src/lib/memory/writer.test.ts",
      "src/lib/memory/relationships/*.test.ts",
      "src/lib/memory/__tests__/approval-audit.test.ts",
      "src/lib/memory/traceable-memory.test.ts",
      "src/lib/session/**/*.test.ts",
      "src/lib/validation/encoding-validator.test.ts",
      "src/lib/validation/group-id.test.ts",
      "src/lib/mcp/enforced-client.test.ts",
      "src/lib/mcp/trace-middleware.test.ts",
      "src/lib/mcp/wrapped-client.test.ts",
      "src/lib/ruvector/embedding-service.test.ts",
      // Kernel
      "src/kernel/**/*.test.ts",
      // Auto-Curator hardening
      "src/__tests__/auto-curator*.test.ts",
      // Curator pipeline
      "src/__tests__/curator-approve.test.ts",
      "src/__tests__/curator-reject.test.ts",
      // API route tests (mocked DB)
      "src/__tests__/api-degradation.test.ts",
      "src/__tests__/auth-middleware.test.ts",
      "src/__tests__/auth-roles.test.ts",
      "src/__tests__/cors-middleware.test.ts",
      "src/__tests__/graph-route.test.ts",
      "src/__tests__/health-metrics.test.ts",
      "src/__tests__/health-metrics-scope.test.ts",
      "src/__tests__/health-probes.test.ts",
      "src/__tests__/curator-approve-route.test.ts",
      "src/__tests__/curator-reject-route.test.ts",
      "src/__tests__/contract-validation.test.ts",
      "src/__tests__/sentry-integration.test.ts",
      "src/__tests__/sentry-wiring.test.ts",
      "src/__tests__/byok-key-manager.test.ts",
      "src/__tests__/watchdog-sustained.test.ts",
      // Backup automation (pure logic, mocked deps)
      "src/__tests__/backup-automation.test.ts",
      // Token compliance validation (Story 2.7)
      "src/__tests__/token-compliance.test.ts",
      // Retrieval benchmark (FR-1.2 — mocked DB/services)
      "src/__tests__/retrieval-benchmark.test.ts",
      // TraceMiddleware (Story 1.2)
      "src/__tests__/trace-middleware.test.ts",
      // Team RAM
      "src/team-ram/orchestrator.test.ts",
      "src/team-ram/orchestration-tracing.test.ts",
      "src/team-ram/mcp-skill-executor.test.ts",
      // Curator workers
      "src/curator/embedding-backfill-worker.test.ts",
      "src/curator/notion-sync.test.ts",
      "src/curator/approve-cli.test.ts",
    ],
    exclude: [
      // ── Integration tests (mocked DB/services) — use test:integration ──
      "src/__tests__/canonical-memory.test.ts",
      "src/__tests__/memory-search-ruvector.test.ts",
      "src/__tests__/notion-sync*.test.ts",
      "src/__tests__/notion-projection-sync.test.ts",
      "src/__tests__/mcp-catalog.test.ts",
      "src/__tests__/mcp-streamable-http.test.ts",
      "src/__tests__/neo4j-writer-errors.test.ts",
      "src/__tests__/generate-agent.test.ts",
      "src/__tests__/knowledge-hub-bridge.test.ts",
      "src/__tests__/parity-test.test.ts",
      "src/lib/ruvector/bridge.test.ts",
      "src/lib/ruvector/retrieval-adapter.test.ts",
      "src/lib/neo4j/connection.test.ts",
      "src/lib/postgres/connection.test.ts",
      "src/lib/neo4j/queries/*.test.ts",
      "src/lib/postgres/queries/*.test.ts",
      "src/lib/postgres/trace-logger.test.ts",
      "src/integrations/mcp.client.test.ts",
      "src/lib/validation/group-governance.test.ts",
      "src/lib/validation/trace-ref.test.ts",
      "src/lib/agents/agent-manifest.test.ts",
      "src/lib/memory/__tests__/approval-audit.test.ts",
      // ── E2E tests — use test:e2e ──
      "src/__tests__/e2e-integration.test.ts",
      "src/__tests__/curator-pipeline.e2e.test.ts",
      "src/__tests__/ruvector-e2e.test.ts",
      "src/__tests__/graph-route.e2e.test.ts",
      "src/team-ram/e2e-smoke.test.ts",
    ],
    testTimeout: 10_000,
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
    ],
  },
})
