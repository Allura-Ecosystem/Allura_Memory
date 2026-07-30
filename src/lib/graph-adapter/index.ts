/**
 * Graph Adapter — Barrel Export
 *
 * Public API for the graph adapter layer.
 * Import from here: `import { IGraphAdapter, createGraphAdapter } from "@/lib/graph-adapter"`
 */

export type {
  IGraphAdapter,
  GraphMemoryNode,
  GraphSearchResult,
  DuplicateCheckResult,
  VersionLookupResult,
  CanonicalCheckResult,
  CountResult,
  GraphListResult,
  GraphGetResult,
  GraphDeleteResult,
  GraphSupersedesResult,
  GraphRestoreResult,
  GraphExportResult,
} from "./types"

export { GraphAdapterError, GraphAdapterUnavailableError } from "./types"

export { RuVectorGraphAdapter } from "./ruvector-adapter"
export { createGraphAdapter, getGraphBackend, isGraphAdapterAvailable } from "./factory"
export type { GraphBackend } from "./factory"
export { resolveAgentName, resolveProjectName, isKnownGroup, isKnownUser } from "./sync-contract-mappings"