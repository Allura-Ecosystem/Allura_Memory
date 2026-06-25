/**
 * Fake `ruvector-graph-node` native binding — faithful to the 2026-06-24 spike.
 *
 * Replicates the EXACT observed semantics of the real NAPI addon (recorded in
 * docs/archive/allura/AD-50-vendor-native-addon-provenance.md), so the
 * ruvector-crate adapter's LOGIC can be unit-tested without the vendored `.node`:
 *
 *   - async createNode({id, embedding, labels, properties}) → resolves to id string
 *   - async createEdge({from, to, description, embedding, ...})  → resolves to a uuid
 *   - async query('MATCH (n:Label) RETURN n') → { nodes, edges:[], stats }
 *   - querySync(...) → { nodes:[], edges:[], stats }   (NO node rows — stats only)
 *   - async kHopNeighbors(id, k) → string[]
 *   - async searchHyperedges({embedding, k}) → edge hits (EDGE vector search only)
 *   - async stats() → { totalNodes, totalEdges, avgDegree }
 *   - begin/commit/rollback exist but are NON-ATOMIC no-ops (B1)
 *   - NO updateNode (B3)
 *   - B2 LEAK: property values read back wrapped as the literal String("...")
 *
 * This fixture is intentionally NOT a substitute for the real-binding parity run,
 * which is workstation-gated. It validates adapter-side behavior: group_id
 * scoping (G3), B2 unwrap, keyword retrieval, traversal, and the unsupported throws.
 */

let edgeSeq = 0

class FakeGraphDatabase {
  constructor(path) {
    this._path = path
    this._nodes = new Map() // id -> { id, labels, properties:{...} }
    this._edges = [] // { id, from, to, description }
    this._txDepth = 0
  }

  static open(path) {
    return new FakeGraphDatabase(path)
  }

  isPersistent() {
    return true
  }

  getStoragePath() {
    return this._path
  }

  // ── Non-atomic transactions (B1): bookkeeping only, never undo writes ──
  async begin() {
    this._txDepth += 1
    return `tx_${this._txDepth}`
  }
  async commit() {
    return true
  }
  async rollback() {
    // Deliberately a NO-OP — matches the spike: rolled-back nodes survive.
    return true
  }

  async createNode(node) {
    const properties = { ...(node.properties || {}) }
    this._nodes.set(node.id, {
      id: node.id,
      labels: node.labels ? [...node.labels] : [],
      properties,
    })
    return node.id
  }

  async createEdge(edge) {
    if (!this._nodes.has(edge.from) || !this._nodes.has(edge.to)) {
      // Real binding requires both endpoints to exist.
      throw new Error(`createEdge: missing endpoint (${edge.from} -> ${edge.to})`)
    }
    edgeSeq += 1
    const id = `edge-${edgeSeq}`
    this._edges.push({ id, from: edge.from, to: edge.to, description: edge.description })
    return id
  }

  _statsObj() {
    let degree = 0
    for (const _ of this._edges) degree += 2
    const n = this._nodes.size
    return {
      totalNodes: n,
      totalEdges: this._edges.length,
      avgDegree: n ? degree / n : 0,
    }
  }

  // Apply the B2 leak: every string property value comes back as String("...").
  _leak(properties) {
    const out = {}
    for (const [k, v] of Object.entries(properties)) {
      out[k] = `String("${String(v)}")`
    }
    return out
  }

  _matchLabel(cypher) {
    const m = /MATCH \(n:(\w+)\) RETURN n/.exec(cypher)
    return m ? m[1] : null
  }

  async query(cypher) {
    const label = this._matchLabel(cypher)
    const nodes = []
    for (const node of this._nodes.values()) {
      if (label && !node.labels.includes(label)) continue
      nodes.push({ id: node.id, labels: [...node.labels], properties: this._leak(node.properties) })
    }
    return { nodes, edges: [], stats: this._statsObj() }
  }

  querySync() {
    // Spike: querySync returns NO node rows — stats only.
    return { nodes: [], edges: [], stats: this._statsObj() }
  }

  async kHopNeighbors(id, k) {
    const seen = new Set([id])
    let frontier = [id]
    for (let hop = 0; hop < k; hop++) {
      const next = []
      for (const e of this._edges) {
        if (frontier.includes(e.from) && !seen.has(e.to)) {
          seen.add(e.to)
          next.push(e.to)
        }
        if (frontier.includes(e.to) && !seen.has(e.from)) {
          seen.add(e.from)
          next.push(e.from)
        }
      }
      frontier = next
    }
    return Array.from(seen)
  }

  async searchHyperedges({ k }) {
    return this._edges.slice(0, k).map((e) => ({ id: e.id, score: 0, description: e.description }))
  }

  async stats() {
    return this._statsObj()
  }
}

module.exports = { GraphDatabase: FakeGraphDatabase }
