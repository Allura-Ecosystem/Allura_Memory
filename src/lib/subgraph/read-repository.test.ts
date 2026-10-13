import { describe, expect, it, vi } from "vitest"
import { normalizeSubgraphQuery } from "./contract"
import { FocusedSubgraphReadRepository, FocusedSubgraphRepositoryError } from "./read-repository"

const scope = { tenantId: "allura-system", workspaceId: "workspace-a" }
const observedAt = "2026-10-12T00:00:00.000Z"

function node(entity: "memory" | "structural", id: string, kind = entity === "memory" ? "Memory" : "Project", options: { version?: number; deprecated?: boolean; content?: string } = {}) {
  const content = options.content ?? `Content ${id}`
  return {
    entity_type: entity, record_id: id, record_kind: kind,
    label: entity === "memory" ? content.slice(0, 120) : `${kind} ${id}`,
    summary: entity === "memory" ? content.slice(0, 280) : `${kind} summary`, content: entity === "memory" ? content : null,
    version: entity === "memory" ? (options.version ?? 1) : null,
    deprecated: entity === "memory" ? (options.deprecated ?? false) : null,
    created_at: observedAt, updated_at: null, evidence_refs: entity === "memory" ? ["evidence:1"] : [],
  }
}

function edge(id: string, fromId: string, toId: string, relType: string, options: {
  fromKind?: "memory" | "structural"; toKind?: "memory" | "structural"; sourceTable?: "graph_structural_edges" | "graph_supersedes"
  depth?: number; direction?: "incoming" | "outgoing"; fromDistance?: number; toDistance?: number
} = {}) {
  return {
    edge_id: id, from_id: fromId, from_kind: options.fromKind ?? "structural",
    to_id: toId, to_kind: options.toKind ?? "structural", rel_type: relType, created_at: observedAt,
    source_table: options.sourceTable ?? "graph_structural_edges", edge_depth: options.depth ?? 0,
    traversal_direction: options.direction ?? "outgoing", from_distance: options.fromDistance ?? 0,
    to_distance: options.toDistance ?? 0,
  }
}

function root(entity: "memory" | "structural", id: string, rank = entity === "memory" ? 0 : 3, outputKind = entity === "memory" ? "Memory" : "Project") {
  return { entity_type: entity, record_id: id, kind_rank: rank, freshness_at: observedAt, node_key: `${entity}:${id}`, output_kind: outputKind }
}

function client(options: { ambiguous?: boolean; edges?: ReturnType<typeof edge>[]; roots?: ReturnType<typeof root>[]; nodes?: ReturnType<typeof node>[] }) {
  return { query: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("endpoint_state IN")) return { rows: [{ present: options.ambiguous ?? false }] }
    if (sql.includes("WITH requested")) {
      const kinds = params[2] as string[]; const ids = params[3] as string[]
      return { rows: (options.nodes ?? []).filter((row) => ids.some((id, index) => id === row.record_id && kinds[index] === row.entity_type)) }
    }
    if (sql.includes("WITH roots AS")) {
      const nodeKinds = params[2] as string[]
      const boundary = params[5] as string | null; const limit = params[6] as number
      return { rows: (options.roots ?? [])
        .filter((row) => nodeKinds.length === 0 || nodeKinds.includes(row.output_kind))
        .filter((row) => !boundary || row.node_key > boundary).slice(0, limit) }
    }
    if (sql.includes("WITH RECURSIVE")) {
      const includeLineage = params[5] as boolean; const boundaryRel = params[10] as string | null; const limit = params[15] as number
      return { rows: (options.edges ?? []).filter((row) => (includeLineage || row.rel_type !== "SUPERSEDES") && (!boundaryRel || row.rel_type > boundaryRel)).slice(0, limit) }
    }
    if (sql.includes("WITH node_catalog AS")) {
      const boundaryRel = params[4] as string | null; const limit = params[9] as number
      return { rows: (options.edges ?? []).filter((row) => !boundaryRel || row.rel_type > boundaryRel).slice(0, limit) }
    }
    throw new Error(`Unexpected SQL: ${sql.slice(0, 100)}`)
  }) } as never
}

describe("FocusedSubgraphReadRepository", () => {
  it("returns explicit ambiguity rather than guessing endpoint kinds", async () => {
    const repository = new FocusedSubgraphReadRepository(client({ ambiguous: true }))
    await expect(repository.read(scope, normalizeSubgraphQuery({ kind: "overview" }))).resolves.toMatchObject({ ambiguous: true, nodes: [], edges: [] })
  })

  it("keeps endpoint closure and preserves an isolated overview root", async () => {
    const repository = new FocusedSubgraphReadRepository(client({
      edges: [edge("ab", "a", "b", "RELATES_TO", { fromKind: "memory" })],
      roots: [root("memory", "a", 0), root("structural", "b"), root("structural", "isolated")],
      nodes: [node("memory", "a"), node("structural", "b"), node("structural", "isolated")],
    }))
    const page = await repository.read(scope, normalizeSubgraphQuery({ kind: "overview", nodeLimit: 3, edgeLimit: 4 }))
    expect(page.nodes.map((item) => item.key).sort()).toEqual(["memory:a", "structural:b", "structural:isolated"])
    expect(page.edges).toHaveLength(1)
  })

  it("walks depth two with optional lineage removed before traversal", async () => {
    const edges = [
      edge("ab", "a", "b", "RELATES_TO", { fromKind: "memory", depth: 1, fromDistance: 0, toDistance: 1 }),
      edge("ac", "a", "old", "SUPERSEDES", { fromKind: "memory", toKind: "memory", sourceTable: "graph_supersedes", depth: 1, fromDistance: 0, toDistance: 1 }),
      edge("bd", "b", "d", "MEMBER_OF", { depth: 2, fromDistance: 1, toDistance: 2 }),
    ]
    const nodes = [node("memory", "a", "Memory", { version: 2 }), node("memory", "old", "Memory", { deprecated: true }), node("structural", "b", "Agent"), node("structural", "d", "Team")]
    const without = await new FocusedSubgraphReadRepository(client({ edges, nodes })).read(
      scope, normalizeSubgraphQuery({ kind: "focus", focusNodeKey: "memory:a", depth: 2, includeLineage: false }),
    )
    expect(without.edges.map((item) => item.kind.name)).not.toContain("SUPERSEDES")

    const withLineage = await new FocusedSubgraphReadRepository(client({ edges, nodes })).read(
      scope, normalizeSubgraphQuery({ kind: "focus", focusNodeKey: "memory:a", depth: 2, includeLineage: true }),
    )
    expect(withLineage.inspection?.lineage).toEqual([{ newerNodeKey: "memory:a", supersededNodeKey: "memory:old", relationshipKey: "edge:graph_supersedes:ac" }])
  })

  it("applies overview root keysets beyond the response limit", async () => {
    const roots = Array.from({ length: 250 }, (_, index) => root("structural", `root-${String(index).padStart(3, "0")}`))
    const nodes = roots.map((item) => node("structural", item.record_id))
    const repository = new FocusedSubgraphReadRepository(client({ roots, nodes }))
    const query = normalizeSubgraphQuery({ kind: "overview", nodeLimit: 200 })
    const first = await repository.read(scope, query)
    const second = await repository.read(scope, query, first.boundary)
    expect(first.nodes).toHaveLength(200)
    expect(second.nodes).toHaveLength(50)
    expect(new Set([...first.nodes, ...second.nodes].map((item) => item.key)).size).toBe(250)
  })

  it("filters overview kinds before limiting so an older matching root remains reachable", async () => {
    const unrelated = Array.from({ length: 250 }, (_, index) => root(
      "structural", `agent-${String(index).padStart(3, "0")}`, 1, "Agent",
    ))
    const matching = root("structural", "older-project", 3, "Project")
    const repository = new FocusedSubgraphReadRepository(client({
      roots: [...unrelated, matching],
      nodes: [node("structural", "older-project", "Project")],
    }))
    const page = await repository.read(scope, normalizeSubgraphQuery({ kind: "overview", nodeKinds: ["Project"], nodeLimit: 1 }))
    expect(page.nodes.map((item) => item.key)).toEqual(["structural:older-project"])
  })

  it("continues beyond the former 1,000-edge working set while repeating closure", async () => {
    const edges = Array.from({ length: 1_005 }, (_, index) => edge(
      `edge-${String(index).padStart(4, "0")}`, "a", "b", `REL_${String(index).padStart(4, "0")}`,
    ))
    const repository = new FocusedSubgraphReadRepository(client({ edges, roots: [root("structural", "a"), root("structural", "b")], nodes: [node("structural", "a"), node("structural", "b")] }))
    const query = normalizeSubgraphQuery({ kind: "overview", nodeLimit: 2, edgeLimit: 400 })
    const pages = []
    let boundary = null
    do {
      const page = await repository.read(scope, query, boundary)
      pages.push(page); boundary = page.boundary
    } while (pages.at(-1)!.hasMoreEdges)
    expect(pages.map((page) => page.edges.length)).toEqual([400, 400, 205])
    expect(new Set(pages.flatMap((page) => page.edges.map((item) => item.key))).size).toBe(1_005)
  })

  it("keyset-pages a focused frontier exhaustively beyond the 401-row response lookahead", async () => {
    const edges = Array.from({ length: 1_005 }, (_, index) => edge(
      `focus-${String(index).padStart(4, "0")}`, "a", "b", `REL_${String(index).padStart(4, "0")}`,
      { depth: 1, fromDistance: 0, toDistance: 1 },
    ))
    const repository = new FocusedSubgraphReadRepository(client({
      edges,
      nodes: [node("structural", "a"), node("structural", "b")],
    }))
    const query = normalizeSubgraphQuery({ kind: "focus", focusNodeKey: "structural:a", direction: "outgoing", depth: 1, nodeLimit: 2, edgeLimit: 400 })
    const pages = []; let boundary = null
    do {
      const page = await repository.read(scope, query, boundary)
      pages.push(page); boundary = page.boundary
    } while (pages.at(-1)!.hasMoreEdges)
    expect(pages.map((page) => page.edges.length)).toEqual([400, 400, 205])
    expect(new Set(pages.flatMap((page) => page.edges.map((item) => item.key))).size).toBe(1_005)
  })

  it("fails closed when one node cannot represent an eligible edge", async () => {
    const repository = new FocusedSubgraphReadRepository(client({
      edges: [edge("ab", "a", "b", "RELATES_TO")], nodes: [node("structural", "a"), node("structural", "b")],
    }))
    await expect(repository.read(scope, normalizeSubgraphQuery({ kind: "overview", nodeLimit: 1 })))
      .rejects.toEqual(expect.objectContaining<Partial<FocusedSubgraphRepositoryError>>({ kind: "malformed" }))
  })

  it("classifies non-allowlisted labels unknown, versions aliases, and keeps overview snippets concise", async () => {
    const longContent = "x".repeat(600)
    const repository = new FocusedSubgraphReadRepository(client({
      edges: [edge("alias", "memory", "novel", "CONTRIBUTED", { fromKind: "memory" })],
      roots: [root("memory", "memory", 0), root("structural", "novel", 10)],
      nodes: [node("memory", "memory", "Memory", { content: longContent }), node("structural", "novel", "NovelKind")],
    }))
    const page = await repository.read(scope, normalizeSubgraphQuery({ kind: "overview" }))
    expect(page.nodes.find((item) => item.key === "structural:novel")?.kind).toEqual({ classification: "unknown", name: "NovelKind" })
    expect(page.nodes.find((item) => item.key === "memory:memory")?.label).toHaveLength(120)
    expect(page.nodes.find((item) => item.key === "memory:memory")?.summary).toHaveLength(280)
    expect(page.edges[0]).toMatchObject({
      kind: { classification: "canonical", name: "CONTRIBUTES_TO" },
      source: { kind: "derivation", ruleId: "relationship-alias-canonicalization", ruleVersion: 1 },
    })
  })
})
