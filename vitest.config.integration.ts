/**
 * Vitest Config — Integration Lane
 *
 * Mocked services and contract tests.
 * Tests that mock DB connections, external APIs, or service contracts.
 *
 * canonical-memory.test.ts is NOT here — it needs a live PostgreSQL/RuVector
 * connection and belongs in the E2E lane.
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
      // Search with mocked services
      "src/__tests__/memory-search-ruvector.test.ts",
      // Retrieval benchmark (FR-1.2)
      "src/__tests__/retrieval-benchmark.test.ts",
      // Notion sync (mocked Notion API)
      "src/__tests__/notion-sync*.test.ts",
      "src/__tests__/notion-projection-sync.test.ts",
      // API routes (mocked DB)
      "src/__tests__/api-degradation.test.ts",
      "src/__tests__/auth-middleware.test.ts",
      "src/__tests__/auth-roles.test.ts",
      "src/__tests__/cors-middleware.test.ts",
      "src/__tests__/mcp-catalog.test.ts",
      "src/__tests__/mcp-streamable-http.test.ts",
      "src/__tests__/neo4j-writer-errors.test.ts",
      "src/__tests__/contract-validation.test.ts",
      "src/__tests__/byok-key-manager.test.ts",
      "src/__tests__/generate-agent.test.ts",
      "src/__tests__/knowledge-hub-bridge.test.ts",
      "src/__tests__/parity-test.test.ts",
      // DB-backed tests (mocked)
      "src/lib/ruvector/bridge.test.ts",
      "src/lib/ruvector/retrieval-adapter.test.ts",
      "src/lib/neo4j/connection.test.ts",
      "src/lib/postgres/connection.test.ts",
      // group-governance and trace-ref need live DB — E2E lane
      "src/lib/agents/agent-manifest.test.ts",
      "src/integrations/mcp.client.test.ts",
      // Brain contract — shape stability test (skips gracefully when DB is down)
      "tests/integration/brain-contract.test.ts",
      // Page contract tests — verify data shape per dashboard page
      "tests/integration/search-page-contract.test.ts",
      "tests/integration/dreams-page-contract.test.ts",
      "tests/integration/approvals-page-contract.test.ts",
      "tests/integration/overview-page-contract.test.ts",
      "tests/integration/governance-page-contract.test.ts",
      "tests/integration/members-page-contract.test.ts",
      // Genesis Engine (Story 2.2) — insert trajectories → detect → verify proposal
      "tests/integration/genesis-engine.test.ts",
      // Coherence Monitor integration (Story 2.1) — mocked DB + controlPlane
      "src/__tests__/coherence-integration.test.ts",
    ],
    exclude: [
      // canonical-memory needs live DB — E2E lane
      "src/__tests__/canonical-memory.test.ts",
      // E2E tests
      "src/__tests__/e2e-integration.test.ts",
      "src/__tests__/curator-pipeline.e2e.test.ts",
      "src/__tests__/ruvector-e2e.test.ts",
      "src/team-ram/e2e-smoke.test.ts",
    ],
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
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