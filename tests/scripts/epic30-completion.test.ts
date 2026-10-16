import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8")

describe("Allura Adaptive Delivery retirement boundary", () => {
  it("keeps the retired methodology out of active runtime paths", () => {
    expect(existsSync(path.join(root, "_bmad"))).toBe(false)
    expect(existsSync(path.join(root, "_bmad_output"))).toBe(false)
    expect(existsSync(path.join(root, ".bmad-loop"))).toBe(false)

    const commandNames = readdirSync(path.join(root, ".opencode/commands"))
    expect(commandNames.filter((name) => name.startsWith("bmad-")).length).toBe(0)
    expect(read(".claude/settings.json")).not.toContain(".bmad-loop")
  })

  it("preserves the legacy material as read-only history", () => {
    expect(existsSync(path.join(root, "docs/archive/bmad-legacy/retired-2026-10-15/_bmad"))).toBe(true)
    expect(existsSync(path.join(root, "docs/archive/bmad-legacy/retired-2026-10-15/_bmad_output"))).toBe(true)

    const guidelines = read("guidelines/AI-GUIDELINES.md")
    expect(guidelines).toContain("## 10. Allura Adaptive Delivery")
    expect(guidelines).toContain("read-only historical lineage")
    expect(guidelines).toContain("Notion syncs and any change to `Done` or `Approved` require action-specific human approval")
  })
})
