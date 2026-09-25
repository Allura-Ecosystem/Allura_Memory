import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { parse } from "yaml"

const root = process.cwd()
const workflow = parse(readFileSync(path.resolve(root, ".github/workflows/epic-30-evidence.yml"), "utf8"))
const config = readFileSync(path.resolve(root, "vitest.config.epic30-hermetic.ts"), "utf8")
const packageJson = JSON.parse(readFileSync(path.resolve(root, "package.json"), "utf8"))

describe("Epic 30 merge-evidence wiring", () => {
  it("runs on every pull request, not only selected paths", () => {
    expect(Object.hasOwn(workflow.on, "pull_request")).toBe(true)
    expect(workflow.on.pull_request).toBeNull()
    expect(Object.hasOwn(workflow.on, "workflow_dispatch")).toBe(true)
  })

  it("requires both hermetic and confined PostgreSQL/HTTP jobs", () => {
    const hermetic = workflow.jobs["hermetic-authorization-ui"]
    const live = workflow.jobs["confined-postgres-http"]
    expect(hermetic.steps.some((step: { run?: string }) => step.run === "bun run test:epic30-hermetic")).toBe(true)
    expect(live.steps.some((step: { run?: string }) => step.run === "bun run test:epic30-live")).toBe(true)
    expect(packageJson.scripts["test:epic30-hermetic"]).toContain("bun run typecheck")
    expect(packageJson.scripts["test:epic30-hermetic"]).toContain("vitest.config.epic30-hermetic.ts")
  })

  it("fails an empty hermetic inventory and retains the authorization/UI regression files", () => {
    expect(config).toContain("passWithNoTests: false")
    for (const test of [
      "local-confinement.test.ts", "read-receipt.test.ts", "read-receipt-writer.test.ts",
      "read-service.test.ts", "connection.app-pool.test.ts", "brain-client.test.ts", "page.test.tsx",
      "my-work-workspace.test.tsx", "ci-contract.test.ts", "legacy-api-quarantine.test.ts",
      "memory-root-authority.test.ts",
      "memory-id-authority.test.ts",
      "memory-aggregate-authority.test.ts",
      "memory-trace-authority.test.ts",
      "trace-workspace-storage.test.ts",
      "trace-receipt-authority.test.ts",
      "memory-graph-authority.test.ts",
      "memory-restore-authority.test.ts",
      "memory-insight-history-authority.test.ts",
      "memory-user-deletion-authority.test.ts",
      "memory-route-owner-pool-guard.test.ts",
      "canonical-delete-lifecycle-authority.test.ts",
      "ruvector-workspace-authority.test.ts",
    ]) expect(config).toContain(test)
  })
})
