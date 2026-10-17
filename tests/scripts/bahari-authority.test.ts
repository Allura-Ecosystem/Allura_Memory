import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("portable Bahari authority", () => {
  it.each([".codex/agents/bahari.toml", ".claude/agents/bahari.md"])("preserves authenticated authority in %s", (path) => {
    const text = readFileSync(path, "utf8")
    expect(text).not.toMatch(/never\s+`?allura-system/i)
    expect(text).not.toMatch(/Use `user_id: "bahari-curator"`/)
    expect(text).not.toMatch(/\/(?:mnt|home)\//)
    expect(text).toContain("transport-derived identity")
    expect(text).toContain("authenticated principal permits")
    expect(text).toContain("never fabricate")
  })
})
