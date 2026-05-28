import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const repoRoot = process.cwd()
// DASHBOARD-CUTOVER-READINESS.md does not exist in docs/allura/; the authoritative
// copy lives at docs/archive/allura/3100-CUTOVER-AND-ROLLBACK-GATE.md (Story 5-3 fix).
const readinessPath = join(repoRoot, "docs/archive/allura/3100-CUTOVER-AND-ROLLBACK-GATE.md")
const readiness = readFileSync(readinessPath, "utf8")

describe("dashboard cutover readiness", () => {
  it("keeps 3100 protected until every cutover gate passes", () => {
    expect(readiness).toContain("NOT READY FOR `3100` CUTOVER")
    expect(readiness).toContain("must not be replaced until every gate below")
    expect(readiness).toContain("Captain approval is recorded")
  })

  it("documents all Phase 4 cutover gates from docs/goal.md", () => {
    // Gate headings as they appear in the gate document
    const gates = [
      "Gate 1: Route Parity",
      "Gate 2: Visual Parity",
      "Gate 3: Source-of-Truth Parity",
      "Gate 4: Adapter Declarations",
      "Gate 5: Auth Validation",
      "Gate 6: Smoke Tests",
      "Gate 7: Runtime Health",
      "Gate 8: Rollback Ready",
      "Gate 9: Captain Approval",
    ]

    for (const gate of gates) {
      expect(readiness).toContain(gate)
    }
  })

  it("documents canonical ports and rollback command", () => {
    // Ports appear as `localhost:NNNN` in the doc, except 3100 which also appears bare
    for (const port of ["`localhost:6420`", "`localhost:3334`", "`3100`"]) {
      expect(readiness).toContain(port)
    }

    expect(readiness).toContain("docker compose --env-file .env --env-file .env.local up -d web")
    expect(readiness).toContain("curl -f http://localhost:3100/api/health/live")
  })
})

