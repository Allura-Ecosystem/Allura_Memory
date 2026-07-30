import {
  createInsight,
  createInsightVersion,
  type InsightInsert,
  type InsightRecord,
} from "../lib/neo4j-stub";
import { getPool } from "../../src/lib/postgres/connection";
import { type EventInsert, type EventRecord, insertEvent } from "../../src/lib/postgres/queries/insert-trace";

export interface MemoryClient {
  logEvent(event: EventInsert): Promise<EventRecord>;
  createInsight(insight: InsightInsert): Promise<InsightRecord>;
  createInsightVersion(
    insightId: string,
    content: string,
    confidence: number,
    groupId: string,
    metadata?: Record<string, unknown>,
  ): Promise<InsightRecord>;
  getLatestEventByType(groupId: string, eventType: string): Promise<EventRecord | null>;
}

export function createMemoryClient(): MemoryClient {
  return {
    logEvent: insertEvent,
    createInsight,
    createInsightVersion,
    getLatestEventByType,
  } satisfies MemoryClient;
}

async function getLatestEventByType(groupId: string, eventType: string): Promise<EventRecord | null> {
  const pool = getPool();
  const query = `
    SELECT *
    FROM events
    WHERE group_id = $1 AND event_type = $2
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const result = await pool.query<EventRecord>(query, [groupId, eventType]);
  return result.rows[0] ?? null;
}
