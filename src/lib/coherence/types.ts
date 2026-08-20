/**
 * Coherence Monitor — Shared Types
 * Story 2.1
 *
 * Type definitions shared by the coherence monitor, detectors, API routes,
 * and tests. Keeping these in one place lets the pure detector functions
 * stay free of DB imports so they can be unit-tested without mocks.
 */

// Server-only guard — this module is imported by server code only, but the
// types themselves are safe to import anywhere (they are erased at compile
// time). We do NOT throw here so the unit tests can import types freely.

/** Conflict categories the monitor can detect. */
export type ConflictType =
  | "entity_attribute"
  | "temporal_contradiction"
  | "duplicate_with_different_fact";

/** Severity levels — match the DB CHECK constraint. */
export type Severity = "high" | "medium" | "low";

/** Lifecycle status of a conflict row — match the DB CHECK constraint. */
export type ConflictStatus = "active" | "superseded" | "dismissed" | "merged";

/** Curator resolution action for POST /api/coherence/resolve. */
export type ResolveAction = "supersede" | "dismiss" | "merge";

/** A single fact extracted from a memory's content. */
export interface ExtractedFact {
  /** Entity name (lower-cased, trimmed). */
  entity: string;
  /** Attribute name (e.g. "status", "version", "location"). */
  attribute: string;
  /** Raw value string as written. */
  value: string;
}

/** A memory row as read by the monitor (subset of allura_memories). */
export interface MemoryRow {
  id: number;
  group_id: string;
  content: string;
  memory_type: string;
  created_at: Date | string;
  metadata?: Record<string, unknown> | null;
  embedding?: number[] | null;
}

/** A detected conflict between two memories (in-memory, pre-persist). */
export interface ConflictDetection {
  memory_id_a: number;
  memory_id_b: number;
  conflict_type: ConflictType;
  description: string;
  severity: Severity;
}

/** Row persisted to `coherence_conflicts`. */
export interface ConflictRow {
  id: number;
  group_id: string;
  memory_id_a: number;
  memory_id_b: number;
  conflict_type: ConflictType;
  description: string;
  severity: Severity;
  status: ConflictStatus;
  created_at: Date | string;
  resolved_at: Date | string | null;
}

/** Result of a coherence scan. */
export interface ScanResult {
  scanned: number;
  pairs_compared: number;
  conflicts_detected: number;
  conflicts_inserted: number;
  errors: string[];
}

/** Options for `runCoherenceScan`. */
export interface ScanOptions {
  /** Required: tenant scope. */
  group_id: string;
  /** Scan window in hours (default 24). */
  window_hours?: number;
  /** Cosine similarity threshold above which two memories are compared (default 0.85). */
  similarity_threshold?: number;
  /** Agent ID for the controlPlane context (default "coherence-monitor"). */
  agent_id?: string;
  /** Max memories to scan per run (default 500). */
  limit?: number;
}

/** Dependencies injectable into the scan (for testing). */
export interface ScanDeps {
  /** PG pool for reading memories. If omitted, the singleton pool is used. */
  pool?: {
    query: <T = Record<string, unknown>>(
      text: string,
      params?: unknown[]
    ) => Promise<{ rows: T[]; rowCount: number | null }>;
  };
  /** ControlPlane mutate function (default: real syscall_mutate). */
  mutate?: typeof import("@/control-plane/syscalls").syscall_mutate;
  /** Stub for pgvector cosine distance — only used in tests. */
  cosineDistance?: (a: number[], b: number[]) => number;
}

/** Payload for inserting a conflict row via syscall_mutate. */
export interface ConflictInsertPayload {
  group_id: string;
  memory_id_a: number;
  memory_id_b: number;
  conflict_type: ConflictType;
  description: string;
  severity: Severity;
  status: ConflictStatus;
}