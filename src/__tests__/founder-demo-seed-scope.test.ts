import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Regression guard for the founder-candidate demo stack.
 *
 * Root cause: `docker/portfolio-postgres/99-portfolio-demo-workspace.sql`
 * seeds the `workspace-allura` / `allura-system` scope, but
 * `artifacts/claude-epic30/founder-candidate.compose.yml` pointed Cloudflare
 * Access at a *different* scope (`epic30-local-workspace` /
 * `allura-epic30-local`). Every dashboard read is workspace-scoped
 * (see src/lib/dashboard/read-service.ts), so the mismatch meant founder
 * testers always saw a truthful-but-empty dashboard no matter what the
 * fixture seeded.
 */
describe("founder demo scope alignment", () => {
  it("points the founder-candidate compose file at the seeded fixture scope", async () => {
    const compose = await readFile(
      join(process.cwd(), "artifacts/claude-epic30/founder-candidate.compose.yml"),
      "utf8",
    )
    expect(compose).toMatch(/ALLURA_CF_ACCESS_GROUP_ID:\s*"allura-system"/)
    expect(compose).toMatch(/ALLURA_CF_ACCESS_WORKSPACE_ID:\s*"workspace-allura"/)
  })

  it("seeds the same group_id/workspace_id the compose file authenticates founders into", async () => {
    const fixture = await readFile(
      join(process.cwd(), "docker/portfolio-postgres/99-portfolio-demo-workspace.sql"),
      "utf8",
    )
    const seed = await readFile(
      join(process.cwd(), "docker/portfolio-postgres/100-founder-demo-seed.sql"),
      "utf8",
    )

    expect(fixture).toContain("'workspace-allura'")
    expect(fixture).toContain("'allura-system'")

    // Every populated surface (work_items, events, allura_memories,
    // graph_memories, canonical_proposals) must land in that same scope —
    // never a different or unscoped workspace.
    for (const table of ["work_items", "events", "allura_memories", "graph_memories", "canonical_proposals"]) {
      expect(seed.toLowerCase(), `seed should populate ${table}`).toContain(table.toLowerCase())
    }
    expect(seed).not.toMatch(/'allura-epic30-local'|'epic30-local-workspace'/)
  })

  it("builds the founder demo seed into the disposable portfolio postgres image", async () => {
    const dockerfile = await readFile(
      join(process.cwd(), "docker/portfolio-postgres/Dockerfile"),
      "utf8",
    )
    expect(dockerfile).toMatch(/COPY\s+docker\/portfolio-postgres\/100-founder-demo-seed\.sql/)
  })
})
