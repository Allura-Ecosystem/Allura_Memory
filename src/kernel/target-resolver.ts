/**
 * Kernel Target Resolver
 *
 * Maps syscall target strings ("backend:resource") to real PostgreSQL and
 * Neo4j operations.  Called by syscall_mutate / syscall_query once the
 * proof-gate and policy checks have passed.
 *
 * Supported targets
 *   pg:events        → PostgreSQL `events` table  (INSERT only — append-only)
 *   pg:memories      → PostgreSQL `memories` table
 *   neo4j:Entity     → Neo4j node write  (MERGE via writeTransaction)
 *   neo4j:Relationship → Neo4j relationship write (writeTransaction)
 *   neo4j:Query      → Neo4j read  (readTransaction)
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("server-side only");
}

import { getPool } from "@/lib/postgres/connection";
import {
  readTransaction,
  writeTransaction,
} from "@/lib/neo4j/connection";
import { validateGroupId } from "@/lib/validation/group-id";

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface TargetOperation {
  intent: "mutate" | "query";
  target: string;
  type?: "insert" | "update" | "delete_op" | "upsert" | "bulk_insert";
  data?: Record<string, unknown>;
  query?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}

export interface ResolveResult {
  success: boolean;
  affected_rows?: number;
  rows?: unknown[];
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract and validate group_id from a data or query bag.
 * Throws with a message containing "group_id" if absent or invalid.
 */
function requireGroupId(bag: Record<string, unknown> | undefined): string {
  if (!bag || !("group_id" in bag)) {
    throw new Error("group_id is required on all kernel operations");
  }
  return validateGroupId(bag["group_id"]);
}

/**
 * JSON-stringify object values so they can be stored in JSONB columns.
 */
function serializeValue(value: unknown): unknown {
  if (value !== null && typeof value === "object") {
    return JSON.stringify(value);
  }
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// POSTGRESQL HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

async function pgMutate(
  table: string,
  op: TargetOperation
): Promise<ResolveResult> {
  const type = op.type ?? "insert";

  // Append-only invariant for the events table
  if (table === "events" && (type === "update" || type === "delete_op")) {
    throw new Error(
      `pg:events is append-only — ${type} operations are not permitted`
    );
  }

  const data = op.data ?? {};
  requireGroupId(data);

  // Build a parameterized INSERT from data keys
  const keys = Object.keys(data);
  const columns = keys.join(", ");
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
  const values = keys.map((k) => serializeValue(data[k]));

  const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;

  const pool = getPool();
  const result = await pool.query(sql, values);

  return {
    success: true,
    affected_rows: result.rowCount ?? 0,
  };
}

async function pgQuery(
  table: string,
  op: TargetOperation
): Promise<ResolveResult> {
  const queryBag = op.query ?? {};
  requireGroupId(queryBag);

  const keys = Object.keys(queryBag);
  const whereClause =
    keys.length > 0
      ? "WHERE " + keys.map((k, i) => `${k} = $${i + 1}`).join(" AND ")
      : "";
  const values = keys.map((k) => queryBag[k]);

  const limit = op.limit != null ? ` LIMIT ${op.limit}` : "";
  const offset = op.offset != null ? ` OFFSET ${op.offset}` : "";

  const sql = `SELECT * FROM ${table} ${whereClause} ORDER BY created_at DESC${limit}${offset}`.trim();

  const pool = getPool();
  const result = await pool.query(sql, values);

  return {
    success: true,
    rows: result.rows,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// NEO4J HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

async function neo4jMutate(
  resource: string,
  op: TargetOperation
): Promise<ResolveResult> {
  const data = op.data ?? {};
  const groupId = requireGroupId(data);

  if (resource === "Entity" || resource === "Relationship") {
    const label = typeof data["label"] === "string" ? data["label"] : resource;
    const nodeId =
      typeof data["node_id"] === "string" ? data["node_id"] : `node-${Date.now()}`;

    // Build props bag — exclude synthetic fields consumed above
    const exclude = new Set(["label", "node_id", "group_id"]);
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (!exclude.has(k)) props[k] = v;
    }

    await writeTransaction(async (tx) => {
      await tx.run(
        `MERGE (n:${label} {node_id: $node_id, group_id: $group_id}) SET n += $props`,
        { node_id: nodeId, group_id: groupId, props }
      );
    });

    return { success: true };
  }

  throw new Error(`Unknown neo4j mutation resource: ${resource}`);
}

async function neo4jQuery(op: TargetOperation): Promise<ResolveResult> {
  const queryBag = op.query ?? {};
  requireGroupId(queryBag);

  const label =
    typeof queryBag["label"] === "string" ? queryBag["label"] : "Memory";
  const limit = op.limit ?? 25;

  // Build WHERE conditions from query bag keys (excluding label)
  const conditionKeys = Object.keys(queryBag).filter((k) => k !== "label");
  const whereClause =
    conditionKeys.length > 0
      ? "WHERE " +
        conditionKeys.map((k) => `n.${k} = $${k}`).join(" AND ") + " "
      : "";

  const params: Record<string, unknown> = { limit };
  for (const k of conditionKeys) {
    params[k] = queryBag[k];
  }

  const rows = await readTransaction(async (tx) => {
    const result = await tx.run(
      `MATCH (n:${label}) ${whereClause}RETURN n LIMIT $limit`,
      params
    );
    return result.records.map((r) => r.get("n"));
  });

  return { success: true, rows };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a TargetOperation to a real database operation.
 *
 * @param op - The operation descriptor from a syscall
 * @returns ResolveResult with success flag, affected_rows or rows
 * @throws if the target is unknown, group_id is missing, or invariants are
 *         violated (e.g. append-only)
 */
export async function resolveTarget(op: TargetOperation): Promise<ResolveResult> {
  const [prefix, resource] = op.target.split(":");

  if (prefix === "pg") {
    const table = resource;
    if (op.intent === "mutate") {
      return pgMutate(table, op);
    }
    return pgQuery(table, op);
  }

  if (prefix === "neo4j") {
    if (op.intent === "mutate") {
      return neo4jMutate(resource, op);
    }
    return neo4jQuery(op);
  }

  throw new Error(
    `Unknown target prefix "${prefix}" in target "${op.target}". Supported prefixes: pg, neo4j`
  );
}
