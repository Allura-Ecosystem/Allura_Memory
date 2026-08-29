/**
 * Live PostgreSQL CI lane.
 *
 * Keep this inventory intentionally narrow: every included test must require a
 * real PostgreSQL connection, and an empty inventory is a hard failure.
 */
import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    passWithNoTests: false,
    include: [
      "src/lib/process-engine/checkpoint-continuation.integration.test.ts",
      "src/__tests__/database-tenant-isolation.e2e.test.ts",
      "src/__tests__/curator-module-registry.live-db.test.ts",
      "src/__tests__/events-immutability.e2e.test.ts",
      "src/__tests__/pattern-proposals-append-only.e2e.test.ts",
      "src/__tests__/bumblebee-tenant-isolation.e2e.test.ts",
      "src/__tests__/bumblebee-source-authority.e2e.test.ts",
      "src/__tests__/bumblebee-scan-leases.e2e.test.ts",
      "src/__tests__/bumblebee-current-state-views.e2e.test.ts",
      "src/__tests__/view-security-invoker-hardening.e2e.test.ts",
      "src/__tests__/workspace-subgraph-authority.e2e.test.ts",
      "src/__tests__/auto-curator-workspace-authority.e2e.test.ts",
      "src/lib/db/tenant-table-inventory.test.ts",
      "src/lib/memory/proposal-semantic-projection.live-db.test.ts",
      "src/lib/graph-adapter/__tests__/adapter-live-db-e2e.test.ts",
    ],
    testTimeout: 60_000,
    hookTimeout: 30_000,
    teardownTimeout: 10_000,
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
