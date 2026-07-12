/**
 * Graph Adapter Factory — Feature Flag Selection (Slice C)
 *
 * Selects the IGraphAdapter implementation based on GRAPH_BACKEND env var.
 *
 * GRAPH_BACKEND=neo4j     → Neo4jGraphAdapter (legacy, default for backward compat)
 * GRAPH_BACKEND=ruvector  → RuVectorGraphAdapter (new, target)
 * GRAPH_BACKEND=neo4j + GRAPH_DUAL_READ=true → DualReadAdapter (validation wrapper)
 *
 * After Slice E (Remove Neo4j), the flags and Neo4j adapter are removed,
 * and RuVectorGraphAdapter becomes the sole implementation.
 *
 * ADR: AD-029 — Graph Adapter Pattern for Neo4j → RuVector Migration
 */

import type { Driver } from "neo4j-driver"
import type { Pool } from "pg"
import { Neo4jGraphAdapter } from "./neo4j-adapter"
import { RuVectorGraphAdapter } from "./ruvector-adapter"
import { RuvectorCrateGraphAdapter, type Embedder } from "./ruvector-crate-adapter"
import { DualReadAdapter, isDualReadEnabled, type DualReadAdapterConfig } from "./dual-read-adapter"
import type { IGraphAdapter } from "./types"

export type GraphBackend = "neo4j" | "ruvector" | "ruvector-crate"

/**
 * Get the configured graph backend from environment.
 * Defaults to "neo4j" for backward compatibility during migration.
 *
 * "ruvector-crate" (Path B) wraps the native ruvector-graph engine and is
 * opt-in only — never the default. See docs/archive/allura/AD-49-ruvector-graph-cutover.md.
 */
export function getGraphBackend(): GraphBackend {
  const value = process.env.GRAPH_BACKEND?.toLowerCase()
  if (value === "ruvector-crate") return "ruvector-crate"
  if (value === "ruvector") return "ruvector"
  if (value === "neo4j") return "neo4j"
  // Default: ruvector after cutover (Story 19.3)
  return "ruvector"
}

/**
 * Create the appropriate graph adapter based on feature flags.
 *
 * @param connections - Object with pg Pool and/or neo4j Driver
 * @returns IGraphAdapter instance
 *
 * Feature flags:
 *   GRAPH_BACKEND=neo4j|ruvector|ruvector-crate — selects backend
 *   GRAPH_DUAL_READ=true — wraps selected backend with dual-read validation
 *
 * @example
 * ```ts
 * // With Neo4j (legacy)
 * const adapter = createGraphAdapter({ neo4j: driver })
 *
 * // With RuVector (new)
 * const adapter = createGraphAdapter({ pg: pool })
 *
 * // With dual-read validation (both backends, comparison logging)
 * // Set GRAPH_BACKEND=neo4j and GRAPH_DUAL_READ=true
 * const adapter = createGraphAdapter({ pg: pool, neo4j: driver })
 * ```
 */
export function createGraphAdapter(connections: {
  pg?: Pool
  neo4j?: Driver
  /** Path B (ruvector-crate): embedder for the vector-first native engine (G5). */
  crate?: { embed: Embedder }
}): IGraphAdapter {
  const backend = getGraphBackend()

  if (backend === "ruvector-crate") {
    const modulePath = process.env.RUVECTOR_GRAPH_NODE_PATH
    const storagePath = process.env.RUVECTOR_GRAPH_STORAGE_PATH
    if (!modulePath || !storagePath || !connections.crate?.embed) {
      throw new Error(
        "GRAPH_BACKEND=ruvector-crate requires RUVECTOR_GRAPH_NODE_PATH, " +
        "RUVECTOR_GRAPH_STORAGE_PATH, and a crate.embed function. " +
        "The native addon is not on npm (G4) — vendor the built .node and set the path."
      )
    }
    return new RuvectorCrateGraphAdapter({
      modulePath,
      storagePath,
      embed: connections.crate.embed,
    })
  }

  // Determine the base adapter based on GRAPH_BACKEND
  let adapter: IGraphAdapter

  if (backend === "ruvector") {
    if (!connections.pg) {
      throw new Error(
        "GRAPH_BACKEND=ruvector but no PostgreSQL pool provided. " +
        "Ensure PG connection is available for graph adapter."
      )
    }
    adapter = new RuVectorGraphAdapter(connections.pg)
  } else {
    // neo4j (default)
    if (!connections.neo4j) {
      throw new Error(
        "GRAPH_BACKEND=neo4j but no Neo4j driver provided. " +
        "Ensure Neo4j connection is available, or set GRAPH_BACKEND=ruvector."
      )
    }
    adapter = new Neo4jGraphAdapter(connections.neo4j)
  }

  // Apply dual-read validation wrapper if enabled
  // Dual-read uses the selected backend as authoritative, wraps with RuVector for comparison
  if (isDualReadEnabled()) {
    const dualReadConfig: DualReadAdapterConfig = {
      neo4jAdapter: adapter,
      ruvectorAdapter: new RuVectorGraphAdapter(connections.pg!),
    }
    return new DualReadAdapter(dualReadConfig)
  }

  return adapter
}

/**
 * Check if the graph adapter is available for the configured backend.
 * Returns false if required connections are missing.
 */
export function isGraphAdapterAvailable(connections: {
  pg?: Pool
  neo4j?: Driver
  crate?: { embed: Embedder }
}): boolean {
  const backend = getGraphBackend()
  if (backend === "ruvector-crate") {
    return (
      connections.crate?.embed != null &&
      process.env.RUVECTOR_GRAPH_NODE_PATH != null &&
      process.env.RUVECTOR_GRAPH_STORAGE_PATH != null
    )
  }
  if (backend === "ruvector") {
    return connections.pg != null
  }
  return connections.neo4j != null
}