import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("admin approval actions", () => {
  const source = () => readFileSync("src/app/admin/approvals/actions.tsx", "utf8")

  it("posts explicit human rationale to the governed curator decision endpoint", () => {
    const actions = source()

    expect(actions).toContain("/api/curator/approve")
    expect(actions).toContain("rationale")
    expect(actions).toContain("Admin UI approved proposal")
    expect(actions).toContain("Admin UI rejected proposal")
  })
})
