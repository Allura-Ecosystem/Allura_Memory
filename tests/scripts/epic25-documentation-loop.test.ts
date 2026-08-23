import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const repoRoot = resolve(__dirname, "../..")
const planning = readFileSync(
  resolve(repoRoot, "_bmad/bmm/planning/epic-25-governed-curator-review-console.md"),
  "utf8"
)
const story = readFileSync(
  resolve(repoRoot, "_bmad/bmm/stories/25-1-scope-product-truth-documentation-loop.md"),
  "utf8"
)
const reevaluation = readFileSync(
  resolve(repoRoot, "_bmad/bmm/stories/25-2a-workspace-evidence-lifecycle-foundation.md"),
  "utf8"
)

describe("Epic 25 documentation-loop reconciliation", () => {
  it("records the verified Notion canonical decision and repository evidence mirror", () => {
    expect(planning).toContain("3c41d9be-65b3-819b-96c6-c9d14a3424ea")
    expect(planning).toContain("https://app.notion.com/p/3c41d9be65b3819b96c6c9d14a3424ea?pvs=204")
    expect(planning).toMatch(/Notion is canonical for Epic 25 scope, acceptance criteria, and\s+decisions\./)
    expect(planning).toContain("The repository is the versioned implementation, test, and commit-evidence mirror.")
    expect(planning).not.toContain("docs/allura/DEVELOPMENT-LOOP.md")
  })

  it("records the green gate without rewriting Woz's historical handoff", () => {
    expect(planning).toContain("`bun run epic25:drift` exits 0")
    expect(story).toContain("## Brooks Gate Addendum")
    expect(story).toContain("Everything above this line is the builder's record")
    expect(reevaluation).toContain("`bun run epic25:drift` exits 0")
  })

  it("advances AC-6 and AC-7 only as reconciled, while retaining review status", () => {
    expect(story).toContain("- [x] The `docs/allura/DEVELOPMENT-LOOP.md` dangling reference is resolved")
    expect(story).toContain("- [x] The documentation loop is defined")
    expect(story).toContain("**Status:** Done — independent Pike/Fowler review approved 2026-08-23")
    expect(story).toContain("Story 25.1 remains `ready-for-dev`, not Done")
  })
})
