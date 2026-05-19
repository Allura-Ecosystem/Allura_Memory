import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const repoRoot = process.cwd()
const standardsPath = join(repoRoot, "docs/allura/GOVERNANCE-AUDIT-STANDARDS.md")
const standards = readFileSync(standardsPath, "utf8")

describe("governance audit standards", () => {
  it("documents every Phase 3 standard format required by docs/goal.md", () => {
    const requiredHeadings = [
      "## Evidence Comment Format",
      "## Brain Receipt Format",
      "## Waiver Format",
      "## Decision Log Format",
      "## Rollback And Supersession Format",
      "## Review Gates",
    ]

    for (const heading of requiredHeadings) {
      expect(standards).toContain(heading)
    }
  })

  it("keeps Brain receipts scoped and honest", () => {
    expect(standards).toContain("group_id: allura-system")
    expect(standards).toContain("Brain receipts are audit traces")
    expect(standards).toContain("proof remains in validation evidence")
  })

  it("requires owner, evidence, source, status, and rollback coverage", () => {
    for (const field of ["owner", "source", "status", "evidence", "rollback_or_supersession"]) {
      expect(standards).toContain(`\`${field}\``)
    }
  })

  it("records existing cost ledger and owner map evidence", () => {
    expect(standards).toContain("artifacts/cost-ledger-deferral-2026-05-17.md")
    expect(standards).toContain("OWNERS.yaml")
    expect(standards).toContain("35b1d9be-65b3-8154-8b26-ea19c288f96f")
  })
})

