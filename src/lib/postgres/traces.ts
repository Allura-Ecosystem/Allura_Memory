/**
 * PostgreSQL Trace Management
 * 
 * Raw execution traces are stored in PostgreSQL with 6-12 month retention.
 * All traces are append-only and bound to group_id for multi-tenant isolation.
 */

import { getPool } from './connection';
import { withWorkspaceTransaction } from '@/lib/db/tenant-transaction';

export interface Trace {
  id: string;
  group_id: string;
  type: string;
  content: string;
  agent: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}

export interface TraceQuery {
  group_id: string;
  limit?: number;
  offset?: number;
  type?: string;
  startTime?: Date;
  endTime?: Date;
}

export interface WorkspaceTraceQuery extends TraceQuery {
  workspace_id: string;
  principal_id: string;
}

/** Protected web read: mandatory workspace scope through the restricted app role. */
export async function queryWorkspaceTraces(query: WorkspaceTraceQuery): Promise<Trace[]> {
  const { group_id, workspace_id, principal_id, limit = 50, offset = 0, type } = query;
  return withWorkspaceTransaction({ tenantId: group_id, workspaceId: workspace_id, principalId: principal_id }, async (db) => {
    const values: Array<string | number> = [group_id, workspace_id];
    const conditions = ['group_id = $1', 'workspace_id = $2'];
    if (type) { values.push(type); conditions.push(`event_type = $${values.length}`); }
    values.push(limit, offset);
    const result = await db.query(`SELECT id::text, group_id, event_type, agent_id, created_at, metadata
      FROM events WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string, group_id: row.group_id as string, type: row.event_type as string,
      content: JSON.stringify(row.metadata), agent: row.agent_id as string,
      timestamp: row.created_at as Date, metadata: (row.metadata as Record<string, unknown>) || {},
    }));
  });
}

/**
 * Query raw traces from PostgreSQL
 *
 * Queries the `events` table (the canonical append-only trace store).
 * Maps event_type → type, agent_id → agent, created_at → timestamp,
 * and serializes metadata as content for trace retrieval.
 */
export async function queryTraces(query: TraceQuery): Promise<Trace[]> {
  const { group_id, limit = 50, offset = 0, type, startTime, endTime } = query;
  const pool = getPool();

  const conditions: string[] = ['group_id = $1'];
  const values: (string | number | Date)[] = [group_id];
  let paramIndex = 2;

  if (type) {
    conditions.push(`event_type = $${paramIndex}`);
    values.push(type);
    paramIndex++;
  }

  if (startTime) {
    conditions.push(`created_at >= $${paramIndex}`);
    values.push(startTime);
    paramIndex++;
  }

  if (endTime) {
    conditions.push(`created_at <= $${paramIndex}`);
    values.push(endTime);
    paramIndex++;
  }

  values.push(limit);
  values.push(offset);

  const result = await pool.query(
    `
    SELECT 
      id::text,
      group_id,
      event_type,
      agent_id,
      created_at,
      metadata
    FROM events
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT $${paramIndex}
    OFFSET $${paramIndex + 1}
    `,
    values
  );

  return result.rows.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    group_id: row.group_id as string,
    type: row.event_type as string,
    content: JSON.stringify(row.metadata),
    agent: row.agent_id as string,
    timestamp: row.created_at as Date,
    metadata: (row.metadata as Record<string, unknown>) || {},
  }));
}

/**
 * Log a raw trace to PostgreSQL
 * Append-only - never mutates existing data
 */
export async function logTraceToPostgres(params: {
  group_id: string;
  type: 'memory' | 'decision' | 'action' | 'prompt' | 'insight';
  content: string;
  agent: string;
  metadata?: Record<string, unknown>;
}): Promise<Trace> {
  const { group_id, type, content, agent, metadata = {} } = params;

  // Enforce group_id (Allura's multi-tenant guarantee)
  if (!group_id) {
    throw new Error('group_id is required for all trace operations');
  }

  const pool = getPool();
  const result = await pool.query<Trace>(
    `
    INSERT INTO agent_traces (group_id, type, content, agent, metadata)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING 
      id::text,
      group_id,
      type,
      content,
      agent,
      timestamp,
      metadata
    `,
    [group_id, type, content, agent, JSON.stringify(metadata)]
  );

  return result.rows[0];
}

/**
 * Get trace by ID
 */
export async function getTraceById(id: string, group_id: string): Promise<Trace | null> {
  const pool = getPool();
  const result = await pool.query<Trace>(
    `
    SELECT 
      id::text,
      group_id,
      type,
      content,
      agent,
      timestamp,
      metadata
    FROM agent_traces
    WHERE id = $1::uuid AND group_id = $2
    `,
    [id, group_id]
  );

  return result.rows[0] || null;
}

/**
 * Count traces for a group
 */
export async function countTraces(group_id: string): Promise<number> {
  const pool = getPool();
  const result = await pool.query<{ count: string }>(
    `
    SELECT COUNT(*)::text as count
    FROM agent_traces
    WHERE group_id = $1
    `,
    [group_id]
  );

  return parseInt(result.rows[0].count);
}

/**
 * Delete old traces (retention policy)
 * Called by cleanup job, not directly by API
 */
export async function deleteOldTraces(group_id: string, olderThanDays: number): Promise<number> {
  const pool = getPool();
  const result = await pool.query(
    `
    DELETE FROM agent_traces
    WHERE group_id = $1
      AND timestamp < NOW() - INTERVAL '1 day' * $2
    `,
    [group_id, olderThanDays]
  );

  return result.rowCount || 0;
}
