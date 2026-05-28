import "server-only"

import { DEFAULT_GROUP_ID } from "@/lib/defaults/scope"
import { getPool } from "@/lib/postgres/connection"
import type { DashboardProjectSummary } from "@/lib/dashboard/types"

const DASHBOARD_GROUP_ID = DEFAULT_GROUP_ID || "allura-system"

export async function loadProjectSummaries(groupId: string = DASHBOARD_GROUP_ID): Promise<DashboardProjectSummary[]> {
  const pool = getPool()
  const result = await pool.query<{ project: string; event_count: string | number }>(
    `WITH scoped_events AS (
       SELECT COALESCE(
         NULLIF(btrim(metadata->>'project'), ''),
         NULLIF(btrim(metadata->>'project_id'), '')
       ) AS project
       FROM events
       WHERE group_id = $1
     )
     SELECT project, COUNT(*)::text AS event_count
     FROM scoped_events
     WHERE project IS NOT NULL
     GROUP BY project
     ORDER BY COUNT(*) DESC, project ASC`,
    [groupId]
  )

  return result.rows.map((row) => ({
    project: row.project,
    eventCount: Number(row.event_count),
  }))
}
