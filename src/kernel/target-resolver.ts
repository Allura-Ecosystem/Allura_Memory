/**
 * Kernel Target Resolver
 *
 * Maps syscall target strings ("backend:resource") to real PostgreSQL
 * operations.  Called by syscall_mutate / syscall_query once the
 * proof-gate and policy checks have passed.
 *
 * Supported targets
 *   pg:events        → PostgreSQL `events` table  (INSERT only — append-only)
 *   pg:memories      → PostgreSQL `memories` table
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("server-side only");
}

import { getPool } from "@/lib/postgres/connection";
import { validateGroupId } from "@/lib/validation/group-id";
import { assertRegisteredTenant } from "@/lib/config/tenant-existence";

// ─────────────────────────────────────────────────────────────────────────────
// TENANT VALIDATION
// ─────────────────────────────────────────────────────────────────────────────
// Story 22.1: Writes to data tables must validate that the group_id is a
// registered, active tenant. The `tenants` table itself is exempt (otherwise
// we could never register new tenants). Tables in this set are system/config
// tables that don't carry tenant-scoped memory data.
const TENANT_EXEMPT_TABLES = new Set([
  "tenants",
  "schema_versions",
]);

/**
 * Validate that the group_id is a registered tenant before allowing a write.
 * Skips validation for system/config tables (tenants, schema_versions).
 * Fail closed if the tenant is not registered.
 */
async function validateTenantForWrite(
  table: string,
  groupId: string
): Promise<void> {
  if (TENANT_EXEMPT_TABLES.has(table)) return;
  await assertRegisteredTenant(groupId);
}

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
// SECURITY: IDENTIFIER AND LABEL VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function validateIdentifier(name: string): string {
  if (!SAFE_IDENTIFIER.test(name)) {
    throw new Error(`Invalid SQL identifier: "${name}"`);
  }
  return name;
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

  // Append-only invariant for the agent_trajectories table (SONA — Story 1.3)
  if (table === "agent_trajectories" && (type === "update" || type === "delete_op")) {
    throw new Error(
      `pg:agent_trajectories is append-only — ${type} operations are not permitted`
    );
  }

  // Append-only INSERT path for pattern_proposals (Genesis — Story 2.2).
  // UPDATE (status/reviewed_at) is handled by a dedicated approve/reject path
  // through syscall_mutate, NOT through pgMutate's generic update flow.
  if (table === "pattern_proposals" && type === "delete_op") {
    throw new Error(
      `pg:pattern_proposals is append-only — delete_op is not permitted`
    );
  }

  // ── UPDATE path for pattern_proposals (HITL review gate) ───────────────────
  // The DB trigger restricts UPDATE to status / reviewed_at. We route the
  // update through syscall_mutate so it is kernel-gated (AD-40) and audit-
  // trailed. `query.id` selects the row; `data` carries the new column values.
  if (table === "pattern_proposals" && type === "update") {
    return pgUpdatePatternProposal(op);
  }

  // Append-only INSERT path for coherence_conflicts (Story 2.1).
  // The monitor writes new conflict rows through this path. Curator
  // resolution (status flip) is the ONE permitted UPDATE and is handled
  // directly by the resolve API route, NOT through pgMutate's generic
  // update flow — keeping the kernel INSERT-only invariant intact.
  if (table === "coherence_conflicts" && (type === "update" || type === "delete_op")) {
    throw new Error(
      `pg:coherence_conflicts is append-only (INSERT) — ${type} operations are not permitted through the kernel. Curator resolution uses the dedicated API route.`
    );
  }

  const data = op.data ?? {};
  const groupId = requireGroupId(data);

  // Story 22.1: Validate that the group_id is a registered, active tenant.
  // Fail closed if the tenant is not registered. Exempt system tables.
  await validateTenantForWrite(table, groupId);

  // Build a parameterized INSERT from data keys — validate all column names
  const keys = Object.keys(data).map(validateIdentifier);

  // Guard: refuse to emit malformed SQL when there are no columns to insert
  if (keys.length === 0) {
    throw new Error(
      `refusing to build INSERT with no columns — target table: ${table}. Ensure data payload carries at least group_id.`
    );
  }

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

/**
 * UPDATE handler for `pattern_proposals` (Story 2.2 HITL review gate).
 *
 * Permits UPDATE of status / reviewed_at WHERE id = $1 AND group_id = $2.
 * The DB trigger (`trg_pattern_proposals_block_update`) rejects any
 * UPDATE touching columns other than status / reviewed_at, so this handler
 * is a thin kernel-gated wrapper around a parameterised UPDATE.
 */
async function pgUpdatePatternProposal(
  op: TargetOperation
): Promise<ResolveResult> {
  const data = op.data ?? {};
  const queryBag = op.query ?? {};

  // group_id is mandatory — stamped by the kernel from proof claims.
  const groupId = requireGroupId(data);

  // Story 22.1: Validate that the group_id is a registered, active tenant.
  await validateTenantForWrite("pattern_proposals", groupId);

  // `id` must be present in the query bag.
  if (!("id" in queryBag) || queryBag["id"] === undefined) {
    throw new Error(
      "pg:pattern_proposals UPDATE requires query.id to select the row"
    );
  }

  // Validate data column names (only status / reviewed_at are permitted by
  // the DB trigger, but we also validate identifiers defensively).
  const dataKeys = Object.keys(data)
    .filter((k) => k !== "group_id") // group_id is in the WHERE, not SET
    .map(validateIdentifier);

  // Reject empty SET (no-op) defensively.
  if (dataKeys.length === 0) {
    throw new Error(
      "pg:pattern_proposals UPDATE requires at least one column to SET"
    );
  }

  // Build SET clause with parameterised placeholders.
  const setClause = dataKeys.map((k, i) => `${k} = $${i + 1}`).join(", ");
  const setValues = dataKeys.map((k) => serializeValue(data[k]));

  // WHERE clause: id AND group_id (tenant isolation).
  const whereClause = `WHERE id = $${dataKeys.length + 1} AND group_id = $${dataKeys.length + 2}`;
  const whereValues = [queryBag["id"], groupId];

  const sql = `UPDATE pattern_proposals SET ${setClause} ${whereClause}`;

  const pool = getPool();
  const result = await pool.query(sql, [...setValues, ...whereValues]);

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

  const keys = Object.keys(queryBag).map(validateIdentifier);
  const whereClause =
    keys.length > 0
      ? "WHERE " + keys.map((k, i) => `${k} = $${i + 1}`).join(" AND ")
      : "";
  const values: unknown[] = keys.map((k) => queryBag[k]);

  let paramIdx = keys.length + 1;
  let limitClause = "";
  let offsetClause = "";

  if (op.limit != null) {
    limitClause = ` LIMIT $${paramIdx++}`;
    values.push(op.limit);
  }
  if (op.offset != null) {
    offsetClause = ` OFFSET $${paramIdx++}`;
    values.push(op.offset);
  }

  const sql = `SELECT * FROM ${table} ${whereClause} ORDER BY created_at DESC${limitClause}${offsetClause}`.trim();

  const pool = getPool();
  const result = await pool.query(sql, values);

  return {
    success: true,
    rows: result.rows,
  };
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

  throw new Error(
    `Unknown target prefix "${prefix}" in target "${op.target}". Supported prefixes: pg`
  );
}
