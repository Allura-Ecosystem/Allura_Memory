/**
 * Coherence Monitor — Orchestrator
 * Story 2.1
 *
 * Scans recent memories (default: last 24h) for a tenant and detects conflicts:
 *   - entity-attribute conflicts (same entity, different value)
 *   - temporal contradictions (later memory supersedes an earlier one)
 *   - duplicate-with-different-fact (semantically similar, differing fact)
 *
 * Detection pipeline:
 *   1. Fetch recent, non-deleted memories for the tenant from `allura_memories`.
 *   2. Use pgvector cosine distance (`<=>`) to find semantically similar
 *      pairs above a configurable threshold (default 0.85 similarity).
 *   3. For each candidate pair (similar OR same entity), run the pure
 *      detectors in src/lib/coherence/detectors.ts.
 *   4. Deduplicate against existing *active* conflicts for the same pair.
 *   5. Persist new conflicts to `coherence_conflicts` through the kernel
 *      syscall_mutate path (AD-40) — never a direct DB write.
 *
 * Invariants:
 *   - group_id is validated before any read or write.
 *   - All writes flow through `syscall_mutate({ target: "pg:coherence_conflicts" })`.
 *   - The monitor is idempotent: re-running it will not duplicate conflicts.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("coherence monitor can only be used server-side");
}

import { getPool } from "@/lib/postgres/connection";
import { syscall_mutate, type SyscallContext } from "@/kernel/syscalls";
import {
  GroupIdValidationError,
  validateGroupId,
} from "@/lib/validation/group-id";
import {
  cosineDistanceStub,
  detectConflict,
  distanceToSimilarity,
  extractFactsFromMemory,
} from "./detectors";
import type {
  ConflictDetection,
  ConflictInsertPayload,
  ConflictRow,
  ConflictType,
  MemoryRow,
  ScanDeps,
  ScanOptions,
  ScanResult,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_WINDOW_HOURS = 24;
const DEFAULT_SIMILARITY_THRESHOLD = 0.85;
const DEFAULT_LIMIT = 500;
const DEFAULT_AGENT_ID = "coherence-monitor";

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a coherence scan for a single tenant.
 *
 * @returns a summary of memories scanned, pairs compared, and conflicts
 *          inserted. Errors are collected in `errors[]` and never thrown —
 *          a scan is best-effort and must not crash the caller.
 */
export async function runCoherenceScan(
  options: ScanOptions,
  deps: ScanDeps = {}
): Promise<ScanResult> {
  const result: ScanResult = {
    scanned: 0,
    pairs_compared: 0,
    conflicts_detected: 0,
    conflicts_inserted: 0,
    errors: [],
  };

  // 1. Validate group_id
  let groupId: string;
  try {
    groupId = validateGroupId(options.group_id);
  } catch (error) {
    const message =
      error instanceof GroupIdValidationError
        ? error.message
        : `Invalid group_id: ${String(options.group_id)}`;
    result.errors.push(message);
    return result;
  }

  const windowHours = options.window_hours ?? DEFAULT_WINDOW_HOURS;
  const simThreshold = options.similarity_threshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const agentId = options.agent_id ?? DEFAULT_AGENT_ID;

  const pool = deps.pool ?? getPool();
  const mutate = deps.mutate ?? syscall_mutate;

  // 2. Fetch recent memories
  let memories: MemoryRow[];
  try {
    memories = await fetchRecentMemories(pool, groupId, windowHours, limit);
  } catch (error) {
    result.errors.push(
      `Failed to fetch memories: ${error instanceof Error ? error.message : String(error)}`
    );
    return result;
  }
  result.scanned = memories.length;
  if (memories.length < 2) return result;

  // 3. Find candidate pairs via pgvector cosine similarity (DB-side) when
  //    embeddings exist, falling back to a JS stub otherwise.
  let candidatePairs: { a: MemoryRow; b: MemoryRow; similarity: number }[];
  try {
    candidatePairs = await findCandidatePairs(
      pool,
      memories,
      groupId,
      simThreshold,
      deps.cosineDistance ?? null
    );
  } catch (error) {
    result.errors.push(
      `Failed to find candidate pairs: ${error instanceof Error ? error.message : String(error)}`
    );
    return result;
  }
  result.pairs_compared = candidatePairs.length;

  // 4. Also add entity-co-occurrence pairs (same entity mentioned in both)
  //    even when embeddings are absent or below the similarity threshold.
  const entityPairs = findEntityPairs(memories);
  const seenPairKeys = new Set(
    candidatePairs.map((p) => pairKey(p.a.id, p.b.id))
  );
  for (const p of entityPairs) {
    const key = pairKey(p.a.id, p.b.id);
    if (!seenPairKeys.has(key)) {
      candidatePairs.push({ ...p, similarity: 0 });
      seenPairKeys.add(key);
    }
  }

  // 5. Detect conflicts
  const detections: ConflictDetection[] = [];
  for (const { a, b, similarity } of candidatePairs) {
    const det = detectConflict(a, b, similarity);
    if (det) detections.push(det);
  }
  result.conflicts_detected = detections.length;
  if (detections.length === 0) return result;

  // 6. Deduplicate against existing active conflicts
  let existingKeys: Set<string>;
  try {
    existingKeys = await fetchExistingActiveConflictKeys(pool, groupId);
  } catch (error) {
    result.errors.push(
      `Failed to fetch existing conflicts: ${error instanceof Error ? error.message : String(error)}`
    );
    return result;
  }

  // 7. Persist new conflicts through the kernel
  const context: SyscallContext = {
    actor: agentId,
    group_id: groupId,
    permission_tier: "plugin",
    audit_context: { subsystem: "coherence", action: "scan" },
  };

  for (const det of detections) {
    const key = conflictKey(det.memory_id_a, det.memory_id_b, det.conflict_type);
    if (existingKeys.has(key)) continue;

    const payload: ConflictInsertPayload = {
      group_id: groupId,
      memory_id_a: det.memory_id_a,
      memory_id_b: det.memory_id_b,
      conflict_type: det.conflict_type,
      description: det.description,
      severity: det.severity,
      status: "active",
    };

    try {
      const res = await mutate(
        {
          type: "insert",
          target: "pg:coherence_conflicts",
          data: payload,
        },
        context
      );
      if (res.success) {
        result.conflicts_inserted += 1;
        existingKeys.add(key);
      } else {
        result.errors.push(
          `Kernel write failed for pair ${det.memory_id_a}/${det.memory_id_b}: ${res.error ?? "unknown"}`
        );
      }
    } catch (error) {
      result.errors.push(
        `Kernel write threw for pair ${det.memory_id_a}/${det.memory_id_b}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB QUERIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch recent, non-deleted memories for a tenant. We read from
 * `allura_memories` (the pgvector-backed store). Embeddings are pulled
 * as text and parsed client-side only when the JS fallback is used.
 */
async function fetchRecentMemories(
  pool: NonNullable<ScanDeps["pool"]>,
  groupId: string,
  windowHours: number,
  limit: number
): Promise<MemoryRow[]> {
  const sql = `
    SELECT id, group_id, content, memory_type, created_at, metadata, embedding
    FROM allura_memories
    WHERE group_id = $1
      AND deleted_at IS NULL
      AND created_at >= NOW() - ($2 || ' hours')::INTERVAL
    ORDER BY created_at DESC
    LIMIT $3
  `;
  const res = await pool.query<MemoryRow>(sql, [groupId, String(windowHours), limit]);
  return res.rows;
}

/**
 * Find candidate pairs using pgvector cosine similarity. We query the DB
 * to find, for each memory, other memories whose embedding cosine distance
 * is below (1 - threshold). When embeddings are missing or the pgvector
 * extension is unavailable, fall back to a pure-JS cosine stub.
 */
async function findCandidatePairs(
  pool: NonNullable<ScanDeps["pool"]>,
  memories: MemoryRow[],
  groupId: string,
  threshold: number,
  jsFallback: ((a: number[], b: number[]) => number) | null
): Promise<{ a: MemoryRow; b: MemoryRow; similarity: number }[]> {
  const maxDistance = 1 - threshold;
  const pairs: { a: MemoryRow; b: MemoryRow; similarity: number }[] = [];
  const seen = new Set<string>();

  // Try the pgvector path first. We use a self-join on allura_memories with
  // a cosine-distance filter. This is efficient because the table has an
  // HNSW index on the embedding column.
  const withEmbeddings = memories.filter((m) => m.embedding != null);

  if (withEmbeddings.length >= 2) {
    // pgvector path: query for each memory's nearest neighbours within the
    // distance threshold. We issue one query per memory using its id.
    for (const m of withEmbeddings) {
      try {
        const sql = `
          SELECT id, content, memory_type, created_at, metadata,
                 (embedding <=> (SELECT embedding FROM allura_memories WHERE id = $1)) AS distance
          FROM allura_memories
          WHERE group_id = $2
            AND deleted_at IS NULL
            AND id <> $1
            AND embedding IS NOT NULL
            AND (embedding <=> (SELECT embedding FROM allura_memories WHERE id = $1)) <= $3
          ORDER BY distance ASC
          LIMIT 10
        `;
        const res = await pool.query<{
          id: number;
          content: string;
          memory_type: string;
          created_at: Date | string;
          metadata: Record<string, unknown> | null;
          distance: number;
        }>(sql, [m.id, groupId, maxDistance]);

        for (const row of res.rows) {
          const other: MemoryRow = {
            id: row.id,
            group_id: groupId,
            content: row.content,
            memory_type: row.memory_type,
            created_at: row.created_at,
            metadata: row.metadata,
          };
          const key = pairKey(m.id, other.id);
          if (seen.has(key)) continue;
          seen.add(key);
          pairs.push({
            a: m,
            b: other,
            similarity: distanceToSimilarity(Number(row.distance)),
          });
        }
      } catch {
        // pgvector path failed (extension missing, column type, etc.) —
        // fall through to the JS fallback for the remaining pairs.
        break;
      }
    }
    if (pairs.length > 0) return pairs;
  }

  // JS fallback: compute cosine distance in Node for memories that carry
  // an embedding array. This is O(n^2) and only used in tests or when the
  // pgvector extension is unavailable.
  if (jsFallback) {
    for (let i = 0; i < withEmbeddings.length; i++) {
      for (let j = i + 1; j < withEmbeddings.length; j++) {
        const a = withEmbeddings[i];
        const b = withEmbeddings[j];
        const distance = jsFallback(
          a.embedding as number[],
          b.embedding as number[]
        );
        const similarity = distanceToSimilarity(distance);
        if (similarity >= threshold) {
          const key = pairKey(a.id, b.id);
          if (seen.has(key)) continue;
          seen.add(key);
          pairs.push({ a, b, similarity });
        }
      }
    }
  }

  return pairs;
}

/**
 * Find pairs that share at least one extracted entity, even when their
 * embeddings are not similar. This catches contradictions that phrasing
 * differences would otherwise mask.
 */
function findEntityPairs(
  memories: MemoryRow[]
): { a: MemoryRow; b: MemoryRow }[] {
  const pairs: { a: MemoryRow; b: MemoryRow }[] = [];
  const seen = new Set<string>();

  // Build an entity -> memory index
  const entityIndex = new Map<string, MemoryRow[]>();
  for (const m of memories) {
    const facts = extractFactsFromMemory(m);
    const entities = new Set(facts.map((f) => f.entity));
    for (const e of entities) {
      const list = entityIndex.get(e);
      if (list) list.push(m);
      else entityIndex.set(e, [m]);
    }
  }

  // Emit pairs per entity
  for (const list of entityIndex.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const key = pairKey(a.id, b.id);
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({ a, b });
      }
    }
  }
  return pairs;
}

/**
 * Fetch the set of existing active conflict keys for a tenant so we can
 * skip re-inserting the same pair.
 */
async function fetchExistingActiveConflictKeys(
  pool: NonNullable<ScanDeps["pool"]>,
  groupId: string
): Promise<Set<string>> {
  const sql = `
    SELECT memory_id_a, memory_id_b, conflict_type
    FROM coherence_conflicts
    WHERE group_id = $1 AND status = 'active'
  `;
  const res = await pool.query<{
    memory_id_a: number;
    memory_id_b: number;
    conflict_type: ConflictType;
  }>(sql, [groupId]);
  return new Set(
    res.rows.map((r) =>
      conflictKey(r.memory_id_a, r.memory_id_b, r.conflict_type)
    )
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// READ HELPERS (used by the API routes)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List active conflicts for a tenant.
 */
export async function listActiveConflicts(
  groupId: string,
  deps: { pool?: NonNullable<ScanDeps["pool"]> } = {}
): Promise<ConflictRow[]> {
  const validated = validateGroupId(groupId);
  const pool = deps.pool ?? getPool();
  const sql = `
    SELECT id, group_id, memory_id_a, memory_id_b, conflict_type,
           description, severity, status, created_at, resolved_at
    FROM coherence_conflicts
    WHERE group_id = $1 AND status = 'active'
    ORDER BY created_at DESC
  `;
  const res = await pool.query<ConflictRow>(sql, [validated]);
  return res.rows;
}

/**
 * Resolve a conflict by flipping its status. Curator-gated by the API route.
 *
 * This is the ONE permitted UPDATE on coherence_conflicts — it only flips
 * status + resolved_at and is gated by the curator role in the route handler.
 */
export async function resolveConflict(
  params: {
    conflict_id: number;
    group_id: string;
    action: "supersede" | "dismiss" | "merge";
    curator_id: string;
    rationale?: string;
  },
  deps: { pool?: NonNullable<ScanDeps["pool"]> } = {}
): Promise<{ updated: boolean; status: string }> {
  const groupId = validateGroupId(params.group_id);
  const pool = deps.pool ?? getPool();

  const statusMap: Record<typeof params.action, string> = {
    supersede: "superseded",
    dismiss: "dismissed",
    merge: "merged",
  };
  const newStatus = statusMap[params.action];

  const sql = `
    UPDATE coherence_conflicts
    SET status = $1, resolved_at = NOW()
    WHERE id = $2 AND group_id = $3 AND status = 'active'
  `;
  const res = await pool.query(sql, [newStatus, params.conflict_id, groupId]);
  return { updated: (res.rowCount ?? 0) > 0, status: newStatus };
}

// ─────────────────────────────────────────────────────────────────────────────
// KEY HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Canonical unordered pair key (smaller id first). */
function pairKey(a: number, b: number): string {
  return a <= b ? `${a}:${b}` : `${b}:${a}`;
}

/** Canonical conflict key: ordered pair + conflict_type. */
function conflictKey(
  a: number,
  b: number,
  type: ConflictType
): string {
  return `${pairKey(a, b)}::${type}`;
}

// Re-export the stub for tests
export { cosineDistanceStub };