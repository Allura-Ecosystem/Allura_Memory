import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const repoRoot = process.cwd()
const readinessPath = join(repoRoot, "docs/allura/DASHBOARD-CUTOVER-READINESS.md")
const readiness = readFileSync(readinessPath, "utf8")

describe("dashboard cutover readiness", () => {
  it("keeps 3100 protected until every cutover gate passes", () => {
    expect(readiness).toContain("NOT READY FOR `3100` CUTOVER")
    expect(readiness).toContain("must not be replaced until every gate below")
    expect(readiness).toContain("Captain approval is recorded")
  })

  it("documents all Phase 4 cutover gates from docs/goal.md", () => {
    const gates = [
      "route-parity",
      "visual-parity",
      "source-truth-parity",
      "adapter-declarations",
      "no-fabricated-data",
      "auth-validation",
      "smoke-tests",
      "runtime-health",
      "rollback-ready",
      "captain-approval",
    ]

    for (const gate of gates) {
      expect(readiness).toContain(`\`${gate}\``)
    }
  })

  it("documents canonical ports and rollback command", () => {
    for (const port of ["`6420`", "`3334`", "`3100`"]) {
      expect(readiness).toContain(port)
    }

    expect(readiness).toContain("docker compose --env-file .env --env-file .env.local up -d web")
    expect(readiness).toContain("curl -f http://localhost:3100/api/health/live")
  })
})

