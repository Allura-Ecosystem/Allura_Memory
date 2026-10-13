import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const migration = readFileSync(resolve(process.cwd(), "docker/postgres-init/78-focused-subgraph-read-contract.sql"), "utf8")
const recovery = readFileSync(resolve(process.cwd(), "docker/postgres-rollback/78-focused-subgraph-read-contract-recovery.sql"), "utf8")

describe("focused subgraph migration contract", () => {
  it("types or quarantines endpoints without assigning a legacy workspace", () => {
    expect(migration).toContain("endpoint_state")
    expect(migration).toContain("'ambiguous'")
    expect(migration).toContain("'orphan'")
    expect(migration).not.toMatch(/workspace_id\s*=\s*['\"](?:default|workspace-default)/i)
  })

  it("adds deferred same-scope integrity, workspace-safe identities, forced RLS, revisions, and traversal indexes", () => {
    expect(migration).toMatch(/CONSTRAINT TRIGGER[\s\S]+DEFERRABLE INITIALLY DEFERRED/)
    expect(migration).toContain("graph_structural_nodes_scope_identity_key")
    expect(migration).toContain("graph_scope_revisions")
    expect(migration).toContain("FORCE ROW LEVEL SECURITY")
    expect(migration).toContain("graph_structural_edges_scope_from_traversal_idx")
    expect(migration).toContain("focused_subgraph_revision_trigger")
    expect(migration).toContain("orphan_focused_subgraph_edges_for_endpoint")
    expect(migration).toMatch(/OLD\.group_id,OLD\.workspace_id[\s\S]+NEW\.group_id,NEW\.workspace_id/)
  })

  it("guards recovery before mutation and restores every removed legacy identity constraint", () => {
    expect(recovery).toMatch(/RAISE EXCEPTION 'focused-subgraph recovery refused/)
    expect(recovery.indexOf("RAISE EXCEPTION")).toBeLessThan(recovery.indexOf("DROP TABLE graph_scope_revisions"))
    expect(recovery).toContain("legacy primary/foreign key restoration is impossible")
    for (const constraint of [
      "graph_memories_pkey", "graph_structural_nodes_pkey", "graph_structural_edges_pkey", "graph_supersedes_pkey",
      "graph_supersedes_newer_id_group_id_fkey", "graph_supersedes_superseded_id_group_id_fkey",
    ]) expect(recovery).toContain(`ADD CONSTRAINT ${constraint}`)
  })
})
