import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const repoRoot = process.cwd()
const stewardshipPath = join(repoRoot, "docs/allura/RELEASE-STEWARDSHIP.md")
const stewardship = readFileSync(stewardshipPath, "utf8")

describe("release stewardship readiness", () => {
  it("blocks final release until mandatory evidence exists", () => {
    expect(stewardship).toContain("NOT READY FOR FINAL RELEASE")
    expect(stewardship).toContain("release gate, not a")
  })

  it("documents every Phase 6 release gate", () => {
    const gates = [
      "product-docs",
      "security-privacy",
      "install-deploy",
      "sample-data-safe",
      "ci-green",
      "final-retrospective",
      "final-brain-receipt",
    ]

    for (const gate of gates) {
      expect(stewardship).toContain(`\`${gate}\``)
    }
  })

  it("requires final release evidence and Allura Brain receipt", () => {
    expect(stewardship).toContain("Release evidence")
    expect(stewardship).toContain("group_id=allura-system")
    expect(stewardship).toContain("Brain: <memory ID>")
  })
})

