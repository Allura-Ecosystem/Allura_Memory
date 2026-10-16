import { describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { checkRepository, findRetiredReferences } from "../../scripts/check-retired-backend"

describe("retired backend regression guard", () => {
  for (const path of ["AGENTS.md", ".opencode/AGENTS.md", ".codex/agents/woz.toml",
    ".claude/rules/startup.md", "src/mcp/canonical-http-gateway.ts", "src/mcp/memory-server-canonical.ts",
    "package.json", "bun.lock", "docker-compose.yml", "config/mcp.json", "scripts/start.ts"]) {
    it(`rejects residue in ${path}`, () => {
      expect(findRetiredReferences(path, 'description: "Search Neo4j semantic memory"')).toHaveLength(1)
      expect(findRetiredReferences(path, 'description: "Search PostgreSQL/RuVector semantic memory"')).toEqual([])
    })
  }
  it("does not let historical-sounding words bypass active checks", () => {
    for (const word of ["migration", "AD-49", "deprecated", "removed", "decision"]) {
      expect(findRetiredReferences("AGENTS.md", `${word}: use neo4j-driver`)).toHaveLength(1)
    }
  })
  it("preserves archives and immutable database migrations", () => {
    for (const path of [".opencode/archive/old.md", "docs/archive/old.md", "docker/postgres-init/00-traces.sql"]) {
      expect(findRetiredReferences(path, "neo4j historical schema")).toEqual([])
    }
    expect(findRetiredReferences("docker/postgres-init/99-new.sql", "neo4j")).toHaveLength(1)
  })
  it("allows only exact classified negative assertions", () => {
    const path = "src/__tests__/audit-tools.test.ts"
    expect(findRetiredReferences(path, '  expect(response.subsystems).not.toHaveProperty("neo4j")')).toEqual([])
    expect(findRetiredReferences(path, 'const driver = "neo4j-driver"')).toHaveLength(1)
    expect(findRetiredReferences("src/mcp/audit-tools.ts", 'expect(response.subsystems).not.toHaveProperty("neo4j")')).toHaveLength(1)
  })
  it("rejects retired transport URLs and filenames", () => {
    expect(findRetiredReferences("config/mcp.json", '"url": "bolt://localhost:7687"')).toHaveLength(1)
    expect(findRetiredReferences("src/lib/neo4j/client.ts", "")).toHaveLength(1)
  })

  it("scans real root instruction symlinks and MCP descriptions red then green", () => {
    const root = mkdtempSync(join(tmpdir(), "allura-retirement-guard-"))
    try {
      execFileSync("git", ["init", "--quiet", root])
      mkdirSync(join(root, ".opencode"))
      mkdirSync(join(root, "src/mcp"), { recursive: true })
      symlinkSync(".opencode/AGENTS.md", join(root, "AGENTS.md"))
      writeFileSync(join(root, ".opencode/AGENTS.md"), "Use Neo4j for semantic memory")
      writeFileSync(join(root, "src/mcp/tools.ts"), 'description: "Neo4j search"')
      const red = checkRepository(root)
      expect(red.some((failure) => failure.startsWith("AGENTS.md:"))).toBe(true)
      expect(red.some((failure) => failure.startsWith("src/mcp/tools.ts:"))).toBe(true)
      writeFileSync(join(root, ".opencode/AGENTS.md"), "Use PostgreSQL/RuVector for semantic memory")
      writeFileSync(join(root, "src/mcp/tools.ts"), 'description: "RuVector search"')
      expect(checkRepository(root)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
