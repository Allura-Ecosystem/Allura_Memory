import { defineConfig } from "vitest/config"
import unit from "./vitest.config.unit"

// Exact Epic 30 preflight inventory. A missing/renamed test is a hard failure.
export default defineConfig({ ...unit, test: { ...unit.test,
  passWithNoTests: false,
  include: [
    "src/lib/digital-brain/ci-contract.test.ts",
    "src/__tests__/memory-root-authority.test.ts",
    "src/__tests__/memory-id-authority.test.ts",
    "src/__tests__/memory-aggregate-authority.test.ts",
    "src/__tests__/memory-trace-authority.test.ts",
    "src/__tests__/trace-workspace-storage.test.ts",
    "src/__tests__/memory-graph-authority.test.ts",
    "src/__tests__/memory-restore-authority.test.ts",
    "src/__tests__/memory-insight-history-authority.test.ts",
    "src/__tests__/memory-user-deletion-authority.test.ts",
    "src/__tests__/memory-route-owner-pool-guard.test.ts",
    "src/lib/digital-brain/document-links.test.ts",
    "src/lib/digital-brain/legacy-api-quarantine.test.ts",
    "src/lib/digital-brain/local-confinement.test.ts",
    "src/lib/digital-brain/migration-contract.test.ts",
    "src/lib/digital-brain/read-receipt-writer.test.ts",
    "src/lib/digital-brain/read-receipt.test.ts",
    "src/lib/digital-brain/read-service.test.ts",
    "src/lib/digital-brain/synthetic-fixture-contract.test.ts",
    "src/lib/postgres/connection.app-pool.test.ts",
    "src/lib/brain-client.test.ts",
    "src/app/dashboard/__tests__/page.test.tsx",
    "src/components/dashboard/__tests__/my-work-workspace.test.tsx",
  ],
} })
