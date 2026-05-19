import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const repoRoot = process.cwd()
const governancePath = join(repoRoot, "docs/allura/DOMAIN-BOARD-GOVERNANCE.md")
const governance = readFileSync(governancePath, "utf8")

describe("domain board governance", () => {
  it("keeps deferred domain boards private-first", () => {
    expect(governance).toContain("DOMAIN BOARDS DEFERRED")
    expect(governance).toContain("Private config first")
    expect(governance).toContain("board-configs/private/")
  })

  it("documents every Phase 5 candidate board", () => {
    for (const board of ["Memory Board", "Faith Meats Operations", "Lending Compliance"]) {
      expect(governance).toContain(board)
    }
  })

  it("requires owner, source, evidence, write policy, degraded behavior, tests, and Notion evidence", () => {
    const required = [
      "owner",
      "source_of_truth",
      "write_policy",
      "evidence_expectations",
      "degraded_behavior",
      "tests",
      "notion_evidence",
    ]

    for (const item of required) {
      expect(governance).toContain(item)
    }
  })

  it("blocks private domain data from sanitized examples", () => {
    for (const blocked of ["Customer names", "Real HACCP", "Private Notion URLs", "credentials"]) {
      expect(governance).toContain(blocked)
    }
  })
})

