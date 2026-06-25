/**
 * RuVector Crate Graph Adapter — Native `ruvector-graph` engine (Path B)
 *
 * Third IGraphAdapter backend, selected by GRAPH_BACKEND=ruvector-crate.
 * Wraps the ruvnet `ruvector-graph-node` NAPI binding (github.com/ruvnet/RuVector,
 * MIT) — a Rust Cypher + HNSW graph engine — instead of Neo4j or the PG-table
 * `ruvector` adapter. Same seam, same 16-method contract.
 *
 * ── Spike status (2026-06-24, Brooks) ──────────────────────────────────────
 * GO at build + load + FUNCTIONAL gate. `ruvector-graph-node` compiles from
 * source under the target toolchain (Rust 1.95, Bun 1.3.11, x86_64 Linux/glibc
 * 2.39) → libruvector_graph_node.so (5,113,328 bytes) → renamed `.node` → loads
 * under Bun via require(). A fully-awaited CRUD/query/traversal probe ran against
 * a persistent DB; results recorded in
 * docs/archive/allura/AD-50-vendor-native-addon-provenance.md.
 *
 * ── Scope: OPTION A — non-transactional, retrieval-oriented backend ─────────
 * The probe proved three HARD blockers that make this binding UNABLE to be a
 * faithful drop-in for the Neo4j SUPERSEDES model:
 *   B1  No transaction atomicity. begin()/rollback() are bookkeeping no-ops —
 *       a node created inside a tx SURVIVES rollback (verified: nodes 2→3, the
 *       rolled-back node still queryable). Multi-step writes cannot be undone.
 *   B2  Lossy property round-trip. Values come back wrapped in Rust debug
 *       formatting, e.g. stored "0.9" reads back as the literal String("0.9").
 *       Every read MUST unwrap this leak (see unwrapLeak).
 *   B3  No node-level mutation. There is NO updateNode in the binding — a node's
 *       properties cannot be changed after creation, so a prior version cannot be
 *       marked :deprecated.
 *
 * Per Sabir's decision (2026-06-24, Option A): ship the HONEST SUBSET this
 * binding actually supports — create / retrieve / traverse / edge-link — and make
 * every operation that depends on B1 (atomic SUPERSEDES) or B3 (node mutation:
 * soft-delete, restore, deprecation) throw an explicit `unsupported:` error
 * rather than fake success. Default backend stays `neo4j`; this path is opt-in.
 *
 * ── Empirically-confirmed native API (differs from the crate README) ────────
 * `GraphDatabase`: static `open(path)`; instance methods are ASYNC (Promise-
 * returning) except `querySync`, `isPersistent`, `getStoragePath`:
 *   - createNode({ id, embedding: Float32Array, labels?, properties? }) → Promise<string id>
 *   - createEdge({ from, to, description, embedding, confidence?, metadata? }) → Promise<string uuid>
 *   - query(cypher) → Promise<{ nodes, edges, stats }>   (async; returns node rows)
 *   - querySync(cypher) → { stats } only (no node rows — do not use for retrieval)
 *   - kHopNeighbors(id, k) → Promise<string[]>
 *   - searchHyperedges({ embedding, k }) → Promise<hit[]>  (EDGE vector search only)
 *   - stats() → Promise<{ totalNodes, totalEdges, avgDegree }>
 *   - begin()/commit()/rollback() exist but are NON-ATOMIC (B1) — NOT exposed here.
 *   - There is NO updateNode (B3).
 * Cypher is MATCH-by-label only (no WHERE, no property filter, no vector in
 * Cypher), and labels with a reserved-word prefix fail to parse (e.g. `Insight`
 * trips the `IN` operator) — so the node label is the safe literal "Memory" and
 * all filtering (group_id, user_id, id, deprecated) is done adapter-side in TS.
 *
 * ── Constraints this adapter MUST enforce ───────────────────────────────────
 * - G3 tenant scoping: group_id (^allura-[a-z0-9-]+$) is stored as a node
 *   property and filtered in EVERY read. The crate gives no native multi-tenant
 *   isolation; this adapter is the only enforcement point.
 * - G5 vector-first: every createNode needs an embedding at create time. The
 *   dimension is whatever the configured embedder produces (the live PG-table
 *   RuVector layer uses 1024d qwen3-embedding:8b); the crate does not constrain it.
 *
 * ADR: AD-029 (Graph Adapter Pattern) · AD-49 (ruvector-graph cutover) ·
 *      AD-50 (vendored native addon provenance + Option A verdict).
 */

import type { ConfidenceScore, GroupId, MemoryId, MemoryProvenance } from "@/lib/memory/canonical-contracts"
import type {
  CanonicalCheckResult,
  CountResult,
  DuplicateCheckResult,
  GraphDeleteResult,
  GraphExportResult,
  GraphGetResult,
  GraphListResult,
  GraphMemoryNode,
  GraphRestoreResult,
  GraphSearchResult,
  GraphSupersedesResult,
  IGraphAdapter,
  VersionLookupResult,
} from "./types"
import { GraphAdapterError, GraphAdapterUnavailableError } from "./types"

// ── Native binding surface (empirically confirmed in the 2026-06-24 spike) ────
// Typed structurally so `bun run typecheck` passes without the vendored addon
// present. The real module is loaded dynamically at runtime via require().
// IMPORTANT: shapes below match the LIVE binding, not the crate README.

/** Properties cross the boundary as a plain string→string object. */
type NativeProperties = Record<string, string>

interface NativeCreateNode {
  id: string
  embedding: Float32Array
  labels?: string[]
  properties?: NativeProperties
}

interface NativeCreateEdge {
  from: string
  to: string
  description: string
  embedding: Float32Array
  confidence?: number
  metadata?: Record<string, string>
}

/** A node row as returned by `query(...)`. Property values may carry the B2 leak. */
interface NativeNode {
  id: string
  labels?: string[]
  properties?: NativeProperties | Map<string, string>
}

interface NativeQueryResult {
  nodes?: NativeNode[]
  edges?: unknown[]
  stats?: { totalNodes?: number; totalEdges?: number; avgDegree?: number }
}

interface NativeGraphDatabase {
  createNode(node: NativeCreateNode): Promise<string>
  createEdge(edge: NativeCreateEdge): Promise<string>
  query(cypher: string, params?: Record<string, unknown>): Promise<NativeQueryResult>
  querySync(cypher: string, params?: Record<string, unknown>): NativeQueryResult
  kHopNeighbors(id: string, k: number): Promise<string[]>
  searchHyperedges(args: { embedding: Float32Array; k: number }): Promise<unknown[]>
  stats(): Promise<unknown>
  isPersistent(): boolean
  getStoragePath(): string
}

interface NativeBinding {
  GraphDatabase: { open(path: string): NativeGraphDatabase }
}

/** Embeds content to a vector — required by createNode (G5). Dimension is the embedder's. */
export type Embedder = (text: string) => Promise<Float32Array>

/** Safe node label — "Memory" avoids the reserved-word-prefix Cypher parse bug. */
const NODE_LABEL = "Memory"

/**
 * Dynamically load the vendored native addon. Kept out of the static import
 * graph so the project type-checks and the sandbox/CI build succeeds even when
 * the `.node` artifact is not present (G4: not on npm — must be vendored).
 */
function loadNativeBinding(modulePath: string): NativeBinding {
  try {
    // Bun supports require() for N-API addons. Path comes from
    // RUVECTOR_GRAPH_NODE_PATH (or the factory) — never a bare package name.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(modulePath) as Partial<NativeBinding>
    if (!mod || typeof mod.GraphDatabase?.open !== "function") {
      throw new Error(`module at ${modulePath} does not export GraphDatabase.open`)
    }
    return mod as NativeBinding
  } catch (error) {
    throw new GraphAdapterUnavailableError(
      "ruvector-crate",
      "load",
      error instanceof Error ? error : undefined
    )
  }
}

// ── B2 / property helpers ─────────────────────────────────────────────────────

/**
 * Undo the B2 property leak. The binding returns string values wrapped in Rust
 * debug formatting, e.g. `String("0.9")`. Strip the wrapper so callers get "0.9".
 * Non-leaked values pass through untouched.
 */
function unwrapLeak(value: string): string {
  const m = /^String\("([\s\S]*)"\)$/.exec(value)
  return m ? m[1] : value
}

/** Normalize a native node's properties (Map or object) into a plain record, B2-unwrapped. */
function readProps(node: NativeNode): Record<string, string> {
  const out: Record<string, string> = {}
  const raw = node.properties
  if (!raw) return out
  if (raw instanceof Map) {
    for (const [k, v] of raw.entries()) out[k] = unwrapLeak(String(v))
  } else {
    for (const [k, v] of Object.entries(raw)) out[k] = unwrapLeak(String(v))
  }
  return out
}

function parseTags(value: string | undefined): string[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map((t) => String(t)) : []
  } catch {
    return []
  }
}

function nullableString(value: string | undefined): string | null {
  return value && value !== "null" ? value : null
}

/** Reconstruct a GraphMemoryNode from a native node row (properties are stringly-typed, G5/B2). */
function nodeFromNative(node: NativeNode): GraphMemoryNode {
  const p = readProps(node)
  return {
    id: (p.id ?? node.id) as MemoryId,
    group_id: (p.group_id ?? "") as GroupId,
    user_id: nullableString(p.user_id),
    content: p.content ?? "",
    score: (p.score !== undefined ? Number(p.score) : 0) as ConfidenceScore,
    provenance: (p.provenance ?? "inferred") as MemoryProvenance,
    created_at: p.created_at ?? "",
    version: p.version !== undefined ? Number(p.version) : 1,
    tags: parseTags(p.tags),
    deprecated: p.deprecated === "true",
    deleted_at: nullableString(p.deleted_at),
    restored_at: nullableString(p.restored_at),
    schema_version: p.schema_version !== undefined ? Number(p.schema_version) : undefined,
  }
}

/** Cheap keyword relevance — node VECTOR search is unsupported (searchHyperedges is edge-only). */
function keywordScore(content: string, query: string): number {
  const haystack = content.toLowerCase()
  let score = 0
  for (const term of query.toLowerCase().split(/\s+/).filter(Boolean)) {
    let idx = haystack.indexOf(term)
    while (idx !== -1) {
      score += 1
      idx = haystack.indexOf(term, idx + term.length)
    }
  }
  return score
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export interface RuvectorCrateAdapterOptions {
  /** Filesystem path to the vendored `.node` addon. */
  modulePath: string
  /** Storage path passed to GraphDatabase.open (file or ":memory:"-style). */
  storagePath: string
  /** Produces the embedding required on every createNode (G5). Dimension is the embedder's own. */
  embed: Embedder
}

export class RuvectorCrateGraphAdapter implements IGraphAdapter {
  private readonly db: NativeGraphDatabase
  private readonly embed: Embedder

  constructor(opts: RuvectorCrateAdapterOptions) {
    const binding = loadNativeBinding(opts.modulePath)
    this.db = binding.GraphDatabase.open(opts.storagePath)
    this.embed = opts.embed
  }

  /** Validate tenant key before it ever reaches a query (G3). */
  private static assertGroupId(groupId: string): void {
    if (!/^allura-[a-z0-9-]+$/.test(groupId)) {
      throw new GraphAdapterError("ruvector-crate", "guard", `invalid group_id: ${groupId}`)
    }
  }

  /** Explicit refusal for operations this binding cannot honestly support (B1/B3). */
  private static unsupported(operation: string, reason: string): never {
    throw new GraphAdapterError("ruvector-crate", operation, `unsupported: ${reason}`)
  }

  /** Fetch all Memory rows for a tenant (canonical, non-deprecated), filtered adapter-side. */
  private async tenantNodes(groupId: GroupId): Promise<GraphMemoryNode[]> {
    const res = await this.db.query(`MATCH (n:${NODE_LABEL}) RETURN n`)
    return (res.nodes ?? [])
      .map(nodeFromNative)
      .filter((n) => n.group_id === groupId && !n.deprecated)
  }

  // ── Write Operations ────────────────────────────────────────────────────

  async createMemory(params: {
    id: MemoryId
    group_id: GroupId
    user_id: string | null
    content: string
    score: ConfidenceScore
    provenance: MemoryProvenance
    created_at: string
  }): Promise<MemoryId> {
    RuvectorCrateGraphAdapter.assertGroupId(params.group_id)
    const embedding = await this.embed(params.content) // G5: vector required at create time
    const properties: NativeProperties = {
      id: params.id,
      group_id: params.group_id,
      user_id: params.user_id ?? "null",
      content: params.content,
      score: String(params.score),
      provenance: String(params.provenance),
      created_at: params.created_at,
      version: "1",
      tags: "[]",
      deprecated: "false",
      deleted_at: "null",
      restored_at: "null",
    }
    await this.db.createNode({
      id: params.id,
      embedding,
      labels: [NODE_LABEL],
      properties,
    })
    return params.id
  }

  async checkDuplicate(params: {
    group_id: GroupId
    user_id: string | null
    content: string
  }): Promise<DuplicateCheckResult> {
    RuvectorCrateGraphAdapter.assertGroupId(params.group_id)
    const nodes = await this.tenantNodes(params.group_id)
    const dup = nodes.find(
      (n) =>
        n.content === params.content &&
        (params.user_id === null || n.user_id === params.user_id)
    )
    return { existingId: dup ? dup.id : null }
  }

  async supersedesMemory(_params: {
    prev_id: MemoryId
    new_id: MemoryId
    group_id: GroupId
    user_id: string | null
    content: string
    version: number
    created_at: string
  }): Promise<GraphSupersedesResult> {
    // B1 + B3: atomic SUPERSEDES needs real transactions (rollback is a no-op) AND
    // marking the prior node :deprecated needs updateNode (absent). Faking success
    // here would silently break the versioning invariant — refuse instead.
    return RuvectorCrateGraphAdapter.unsupported(
      "supersedesMemory",
      "atomic versioned promotion requires real transactions (B1: rollback is a no-op) " +
        "and deprecating the prior node requires updateNode (B3: absent in ruvector-graph). " +
        "Use GRAPH_BACKEND=neo4j for SUPERSEDES versioning."
    )
  }

  async softDeleteMemory(_params: {
    id: MemoryId
    group_id: GroupId
    deleted_at: string
  }): Promise<GraphDeleteResult> {
    // B3: soft-delete sets deprecated=true on the node; ruvector-graph has no updateNode.
    return RuvectorCrateGraphAdapter.unsupported(
      "softDeleteMemory",
      "soft-delete mutates the node's deprecated flag; ruvector-graph has no updateNode (B3)."
    )
  }

  async restoreMemory(_params: {
    id: MemoryId
    group_id: GroupId
    restored_at: string
  }): Promise<GraphRestoreResult> {
    // B3: restore mutates node properties (clear deprecated, set restored_at). No updateNode.
    return RuvectorCrateGraphAdapter.unsupported(
      "restoreMemory",
      "restore mutates node properties; ruvector-graph has no updateNode (B3)."
    )
  }

  // ── Read Operations ───────────────────────────────────────────────────────

  async getMemory(params: { id: MemoryId; group_id: GroupId }): Promise<GraphGetResult> {
    RuvectorCrateGraphAdapter.assertGroupId(params.group_id)
    const nodes = await this.tenantNodes(params.group_id)
    const node = nodes.find((n) => n.id === params.id) ?? null
    return { node }
  }

  async searchMemories(params: {
    query: string
    group_id: GroupId
    limit: number
  }): Promise<GraphSearchResult[]> {
    RuvectorCrateGraphAdapter.assertGroupId(params.group_id)
    // G2 / node-vector-search unsupported: embed for forward-compat, but rank by
    // adapter-side keyword score (Cypher has no WHERE/vector; searchHyperedges is edge-only).
    await this.embed(params.query)
    const nodes = await this.tenantNodes(params.group_id)
    return nodes
      .map((n) => ({ n, relevance: keywordScore(n.content, params.query) }))
      .filter((r) => r.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, params.limit)
      .map(({ n, relevance }) => ({
        id: n.id,
        content: n.content,
        score: n.score,
        provenance: n.provenance,
        created_at: n.created_at,
        usage_count: 0,
        tags: n.tags,
        relevance,
        schema_version: n.schema_version,
      }))
  }

  async listMemories(params: { group_id: GroupId; user_id: string | null }): Promise<GraphListResult> {
    RuvectorCrateGraphAdapter.assertGroupId(params.group_id)
    const nodes = (await this.tenantNodes(params.group_id)).filter(
      (n) => params.user_id === null || n.user_id === params.user_id
    )
    return { memories: nodes, total: nodes.length }
  }

  async countMemories(params: { group_id: GroupId; user_id: string | null }): Promise<CountResult> {
    const { total } = await this.listMemories(params)
    return { total }
  }

  async checkCanonical(params: { id: MemoryId; group_id: GroupId }): Promise<CanonicalCheckResult> {
    // tenantNodes already excludes deprecated; presence ⇒ canonical. (Under Option A
    // no node is ever deprecated, since soft-delete/supersede are unsupported.)
    const { node } = await this.getMemory(params)
    return { isCanonical: node !== null }
  }

  async getVersion(params: { id: MemoryId; group_id: GroupId }): Promise<VersionLookupResult> {
    const { node } = await this.getMemory(params)
    return node ? { version: node.version, exists: true } : { version: null, exists: false }
  }

  async exportMemories(params: {
    group_id: GroupId
    user_id: string | null
    offset: number
    limit: number
  }): Promise<GraphExportResult> {
    const { memories } = await this.listMemories({
      group_id: params.group_id,
      user_id: params.user_id,
    })
    return { memories: memories.slice(params.offset, params.offset + params.limit) }
  }

  async getDeprecatedMemories(params: {
    ids: string[]
    group_id: GroupId
  }): Promise<Map<string, GraphMemoryNode>> {
    RuvectorCrateGraphAdapter.assertGroupId(params.group_id)
    // Honest: scan ALL nodes (not tenantNodes, which drops deprecated) and return the
    // requested ids that are flagged deprecated. Empty under Option A by construction.
    const res = await this.db.query(`MATCH (n:${NODE_LABEL}) RETURN n`)
    const wanted = new Set(params.ids)
    const out = new Map<string, GraphMemoryNode>()
    for (const native of res.nodes ?? []) {
      const n = nodeFromNative(native)
      if (n.group_id === params.group_id && n.deprecated && wanted.has(n.id)) {
        out.set(n.id, n)
      }
    }
    return out
  }

  async linkMemoryContext(params: {
    memory_id: MemoryId
    group_id: GroupId
    agent_id: string | null
    project_id: string | null
  }): Promise<{ authored_by: boolean; relates_to: boolean }> {
    RuvectorCrateGraphAdapter.assertGroupId(params.group_id)
    const meta = { group_id: params.group_id }
    let authored_by = false
    let relates_to = false
    // Edges are first-class and append-only (createEdge). Skip silently if the
    // endpoint node isn't present — matches the Neo4j MERGE-skip contract.
    if (params.agent_id) {
      try {
        await this.db.createEdge({
          from: params.memory_id,
          to: params.agent_id,
          description: "AUTHORED_BY",
          embedding: await this.embed("AUTHORED_BY"),
          metadata: meta,
        })
        authored_by = true
      } catch {
        authored_by = false
      }
    }
    if (params.project_id) {
      try {
        await this.db.createEdge({
          from: params.memory_id,
          to: params.project_id,
          description: "RELATES_TO",
          embedding: await this.embed("RELATES_TO"),
          metadata: meta,
        })
        relates_to = true
      } catch {
        relates_to = false
      }
    }
    return { authored_by, relates_to }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async isHealthy(): Promise<boolean> {
    try {
      await this.db.stats()
      return true
    } catch {
      return false
    }
  }

  async close(): Promise<void> {
    // The native handle is dropped when GC collects it; the binding surface
    // exposes no explicit close. No-op.
    return
  }
}
