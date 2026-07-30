/**
 * Graph Adapter Factory — Backend Selection
 *
 * Selects the IGraphAdapter implementation based on GRAPH_BACKEND env var.
 *
 * GRAPH_BACKEND=ruvector       → RuVectorGraphAdapter (PostgreSQL + pgvector)
 * GRAPH_BACKEND=ruvector-crate  → RuvectorCrateGraphAdapter (native engine, opt-in)
 *
 * Neo4j has been sunset. PostgreSQL + pgvector is the sole graph backend.
 */

import type { Pool } from "pg"
import { RuVectorGraphAdapter } from "./ruvector-adapter"
import { RuvectorCrateGraphAdapter, type Embedder } from "./ruvector-crate-adapter"
import type { IGraphAdapter } from "./types"

export type GraphBackend = "ruvector" | "ruvector-crate"

/**
 * Get the configured graph backend from environment.
 * Defaults to "ruvector" (PostgreSQL + pgvector).
 *
 * "ruvector-crate" (Path B) wraps the native ruvector-graph engine and is
 * opt-in only — never the default. See docs/archive/allura/AD-49-ruvector-graph-cutover.md.
 */
export function getGraphBackend(): GraphBackend {
  const value = process.env.GRAPH_BACKEND?.toLowerCase()
  if (value === "ruvector-crate") return "ruvector-crate"
  return "ruvector"
}

/**
 * Create the appropriate graph adapter based on the configured backend.
 *
 * @param connections - Object with pg Pool and/or crate embedder
 * @returns IGraphAdapter instance
 */
export function createGraphAdapter(connections: {
  pg?: Pool
  /** @deprecated Neo4j is sunset. Ignored if provided. */
  neo4j?: unknown
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

  // ruvector (default)
  if (!connections.pg) {
    throw new Error(
      "No PostgreSQL pool provided for graph adapter. " +
      "Ensure PG connection is available."
    )
  }
  return new RuVectorGraphAdapter(connections.pg)
}

/**
 * Check if the graph adapter is available for the configured backend.
 * Returns false if required connections are missing.
 */
export function isGraphAdapterAvailable(connections: {
  pg?: Pool
  /** @deprecated Neo4j is sunset. Ignored if provided. */
  neo4j?: unknown
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
  return connections.pg != null
}