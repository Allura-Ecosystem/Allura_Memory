/**
 * Workspace Database Guard
 *
 * Guards database queries to ensure every query filters by group_id.
 * Provides utilities to wrap queries with tenant isolation and assert
 * group_id consistency.
 *
 * FR-5: Database layer enforcement
 * NFR-4: group_id must be present on every query
 */

import { logWorkspaceViolation } from "./audit";
import { WorkspaceViolationError } from "./errors";

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * Result of guarding a SQL query.
 */
export interface GuardedQuery {
  /** The guarded query text */
  query: string;
  /** The parameter values */
  values: unknown[];
  /** Whether a group_id filter was injected */
  filterInjected: boolean;
}

// ── Query Guards ────────────────────────────────────────────────────────────

/**
 * Check if a SQL query already contains a group_id filter.
 *
 * Heuristic: looks for WHERE clauses referencing group_id.
 *
 * @param query - SQL query text
 * @returns true if group_id filter is present
 */
export function hasGroupIdFilter(query: string): boolean {
  const normalized = query.toLowerCase().replace(/\s+/g, " ");
  // Look for group_id in WHERE or JOIN conditions
  return (
    /where.*group_id\s*=/.test(normalized) ||
    /where.*group_id\s+in\s*\(/.test(normalized) ||
    /join.*group_id\s*=/.test(normalized) ||
    /and\s+group_id\s*=/.test(normalized)
  );
}

/**
 * Inject a group_id filter into a SQL query if missing.
 *
 * WARNING: This is a best-effort heuristic. Well-written queries should
 * always include group_id filters explicitly. This guard is a safety net.
 *
 * @param query - Original SQL query
 * @param groupId - The group_id to filter by
 * @returns Guarded query with group_id filter
 */
export function guardSqlQuery(query: string, groupId: string): GuardedQuery {
  if (hasGroupIdFilter(query)) {
    return { query, values: [groupId], filterInjected: false };
  }

  // Heuristic injection: add WHERE group_id = $N or AND group_id = $N
  const normalized = query.trim().toLowerCase();

  let guardedQuery: string;
  if (normalized.includes(" where ")) {
    // Find the position after WHERE and inject AND group_id = $N
    const whereIndex = normalized.indexOf(" where ");
    const insertAfter = query.indexOf(" ", query.toLowerCase().indexOf(" where ") + 7);
    if (insertAfter > 0) {
      guardedQuery =
        query.slice(0, insertAfter) +
        ` AND group_id = $1` +
        query.slice(insertAfter);
    } else {
      guardedQuery = query + ` AND group_id = $1`;
    }
  } else {
    // No WHERE clause — append one
    guardedQuery = query + ` WHERE group_id = $1`;
  }

  return { query: guardedQuery, values: [groupId], filterInjected: true };
}

/**
 * Assert that an actual group_id matches the expected group_id.
 *
 * @param actual - The actual group_id from query results
 * @param expected - The expected group_id from the request context
 * @throws WorkspaceViolationError if they don't match
 */
export function assertGroupIdMatch(actual: string, expected: string): void {
  if (actual !== expected) {
    const error = new WorkspaceViolationError(
      "WS004",
      `Database group_id mismatch: expected "${expected}", got "${actual}"`,
      {
        groupId: expected,
        expectedGroupId: expected,
        actualGroupId: actual,
      }
    );
    logWorkspaceViolation({
      groupId: expected,
      code: "WS004",
      message: error.message,
      expectedGroupId: expected,
      actualGroupId: actual,
    }).catch(() => {
      /* silently ignore audit failure */
    });
    throw error;
  }
}

/**
 * Wrap a graph query to ensure it includes a group_id filter.
 *
 * @param query - Original Cypher query
 * @param groupId - The group_id to enforce
 * @returns Cypher query with group_id enforcement
 */
export function guardCypherQuery(query: string, groupId: string): string {
  const normalized = query.toLowerCase().replace(/\s+/g, " ");

  // Already has group_id filter?
  if (
    /\{group_id:/.test(query) ||
    /\$group_id/.test(query) ||
    /group_id\s*:\s*['"]/.test(query)
  ) {
    return query;
  }

  // Inject group_id into the first MATCH pattern that doesn't have it
  // This is a heuristic — well-written queries should already include it
  const matchRegex = /match\s*\(([^)]+)\)/i;
  const match = query.match(matchRegex);
  if (match) {
    const node = match[1];
    if (!node.includes("group_id")) {
      // Add group_id to the node label or as a WHERE clause
      if (query.toLowerCase().includes(" where ")) {
        return query.replace(
          /where/i,
          `WHERE $1.group_id = "${groupId}" AND `
        );
      }
      return query.replace(
        matchRegex,
        `MATCH ($1 {group_id: "${groupId}"})`
      );
    }
  }

  return query;
}

/**
 * Validate that a query result row has the expected group_id.
 *
 * @param row - Database row (must have group_id property)
 * @param expectedGroupId - Expected group_id
 * @param source - Source description for error messages
 * @throws WorkspaceViolationError if group_id doesn't match
 */
export function validateResultGroupId(
  row: { group_id?: string; groupId?: string },
  expectedGroupId: string,
  source: string
): void {
  const actual = row.group_id || row.groupId;
  if (!actual) {
    const error = new WorkspaceViolationError(
      "WS004",
      `Query result from ${source} is missing group_id field`,
      { groupId: expectedGroupId }
    );
    logWorkspaceViolation({
      groupId: expectedGroupId,
      code: "WS004",
      message: error.message,
    }).catch(() => {
      /* silently ignore audit failure */
    });
    throw error;
  }

  assertGroupIdMatch(actual, expectedGroupId);
}
