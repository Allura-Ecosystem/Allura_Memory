import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const repoRoot = process.cwd()

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8")
}

describe("Append-only version invariant policy", () => {
  it("memory_update appends an audit event before graph versioning", () => {
    const source = readRepoFile("src/mcp/canonical-tools.ts")
    const memoryUpdate = source.slice(
      source.indexOf("export async function memory_update"),
      source.indexOf("/**\n * 7. memory_promote")
    )

    expect(memoryUpdate).toContain("memory_update:insert_event")
    expect(memoryUpdate).toContain('"memory_update"')
    expect(memoryUpdate).toContain("previous_memory_id")
    expect(memoryUpdate).toContain("new_memory_id")
    expect(memoryUpdate.indexOf("memory_update:insert_event")).toBeLessThan(
      memoryUpdate.indexOf("memory_update:supersedes")
    )
  })

  it("memory_update uses graph SUPERSEDES versioning and never deletes prior versions", () => {
    const source = readRepoFile("src/mcp/canonical-tools.ts")
    const memoryUpdate = source.slice(
      source.indexOf("export async function memory_update"),
      source.indexOf("/**\n * 7. memory_promote")
    )

    expect(memoryUpdate).toContain("graphAdapter.getMemory")
    expect(memoryUpdate).toContain("workspace_id: scope.workspace_id")
    expect(memoryUpdate).toContain("graphAdapter.supersedesMemory")
    expect(memoryUpdate).toContain("prev_id")
    expect(memoryUpdate).toContain("new_id")
    expect(memoryUpdate).not.toMatch(/DELETE\s+FROM/i)
    expect(memoryUpdate).not.toMatch(/\bUPDATE\s+events\b/i)
    expect(memoryUpdate).not.toMatch(/graphAdapter\.deleteMemory\s*\(/)
  })
})
