/**
 * Group ID Governance Tools
 * Story 1.5: Enforce Tenant Isolation with group_ids
 *
 * Detects orphaned, misspelled, and anomalous group_ids across the system.
 */

import type { Pool } from "pg";
import { GroupIdValidationError, normalizeGroupId, validateGroupId } from "./group-id";
import { getPool } from "../postgres/connection";

/**
 * Levenshtein distance for detecting similar (potentially misspelled) group_ids
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Group ID usage statistics
 */
export interface GroupIdStats {
  group_id: string;
  event_count: number;
  earliest_event: Date | null;
  latest_event: Date | null;
  is_valid: boolean;
  is_reserved: boolean;
}

/**
 * Group ID usage across PostgreSQL (events table)
 */
export interface PostgresGroupIdReport {
  total_groups: number;
  groups: GroupIdStats[];
  invalid_groups: Array<{ group_id: string; reason: string }>;
}

/**
 * Group ID usage across graph_memories table
 */
export interface GraphGroupIdReport {
  total_groups: number;
  groups: Array<{
    group_id: string;
    insight_count: number;
    earliest_created: Date | null;
    latest_created: Date | null;
    is_valid: boolean;
    is_reserved: boolean;
  }>;
  invalid_groups: Array<{ group_id: string; reason: string }>;
}

/**
 * Combined governance report
 */
export interface GroupIdGovernanceReport {
  postgres: PostgresGroupIdReport;
  graph: GraphGroupIdReport;
  orphaned_groups: string[];
  similar_groups: Array<{ group_id_1: string; group_id_2: string; distance: number }>;
  recommendations: string[];
}

/**
 * Get group_id usage statistics from PostgreSQL events table
 */
export async function getPostgresGroupIdStats(): Promise<PostgresGroupIdReport> {
  const pool = getPool();

  const query = `
    SELECT
      group_id,
      COUNT(*) as event_count,
      MIN(created_at) as earliest_event,
      MAX(created_at) as latest_event
    FROM events
    GROUP BY group_id
    ORDER BY event_count DESC
  `;

  const result = await pool.query(query);

  const groups: GroupIdStats[] = result.rows.map((row: Record<string, unknown>) => {
    let isValid = true;

    try {
      validateGroupId(row.group_id as string);
    } catch (error) {
      if (error instanceof GroupIdValidationError) {
        isValid = false;
      }
    }

    return {
      group_id: row.group_id as string,
      event_count: parseInt(row.event_count as string, 10),
      earliest_event: row.earliest_event as Date | null,
      latest_event: row.latest_event as Date | null,
      is_valid: isValid,
      is_reserved: ["global", "system", "admin", "public"].includes(
        normalizeGroupId(row.group_id as string)
      ),
    };
  });

  const invalidGroups = groups
    .filter((g) => !g.is_valid)
    .map((g) => ({
      group_id: g.group_id,
      reason: `Invalid format: ${g.group_id}`,
    }));

  return {
    total_groups: groups.length,
    groups,
    invalid_groups: invalidGroups,
  };
}

/**
 * Get group_id usage statistics from graph_memories table
 */
export async function getGraphGroupIdStats(): Promise<GraphGroupIdReport> {
  const pool = getPool();

  const query = `
    SELECT
      group_id,
      COUNT(*) as insight_count,
      MIN(created_at) as earliest_created,
      MAX(created_at) as latest_created
    FROM graph_memories
    GROUP BY group_id
    ORDER BY insight_count DESC
  `;

  const result = await pool.query(query);

  const groups = result.rows.map((row: Record<string, unknown>) => {
    const groupId = row.group_id as string;
    let isValid = true;
    try {
      validateGroupId(groupId);
    } catch {
      isValid = false;
    }

    return {
      group_id: groupId,
      insight_count: parseInt(row.insight_count as string, 10),
      earliest_created: row.earliest_created as Date | null,
      latest_created: row.latest_created as Date | null,
      is_valid: isValid,
      is_reserved: ["global", "system", "admin", "public"].includes(
        normalizeGroupId(groupId)
      ),
    };
  });

  const invalidGroups = groups
    .filter((g) => !g.is_valid)
    .map((g) => ({
      group_id: g.group_id,
      reason: `Invalid format: ${g.group_id}`,
    }));

  return {
    total_groups: groups.length,
    groups,
    invalid_groups: invalidGroups,
  };
}

/**
 * Find potentially misspelled group_ids (similar names)
 * Uses Levenshtein distance to detect typos
 */
export function findSimilarGroupIds(
  groupIds: string[],
  maxDistance: number = 2
): Array<{ group_id_1: string; group_id_2: string; distance: number }> {
  const similar: Array<{ group_id_1: string; group_id_2: string; distance: number }> = [];

  // Sort alphabetically for consistent results
  const sorted = [...groupIds].sort();

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const distance = levenshteinDistance(sorted[i], sorted[j]);

      // Only flag as similar if:
      // - Distance is within threshold
      // - Not exactly the same (after normalization)
      // - Not reserved IDs
      if (
        distance <= maxDistance &&
        distance > 0 &&
        !["global", "system", "admin", "public"].includes(sorted[i]) &&
        !["global", "system", "admin", "public"].includes(sorted[j])
      ) {
        similar.push({
          group_id_1: sorted[i],
          group_id_2: sorted[j],
          distance,
        });
      }
    }
  }

  // Sort by distance (smallest first)
  return similar.sort((a, b) => a.distance - b.distance);
}

/**
 * Find orphaned group_ids (no recent activity)
 * An orphaned group has no events in the last N days
 */
export async function findOrphanedGroupIds(
  daysSinceActivity: number = 30
): Promise<string[]> {
  const pool = getPool();

  const query = `
    SELECT DISTINCT group_id
    FROM events
    GROUP BY group_id
    HAVING MAX(created_at) < NOW() - INTERVAL '${daysSinceActivity} days'
  `;

  const result = await pool.query(query);
  return result.rows.map((row: Record<string, unknown>) => row.group_id as string);
}

/**
 * Generate a comprehensive governance report
 */
export async function generateGroupIdGovernanceReport(
  options: {
    orphanThresholdDays?: number;
    similarMaxDistance?: number;
  } = {}
): Promise<GroupIdGovernanceReport> {
  const { orphanThresholdDays = 30, similarMaxDistance = 2 } = options;

  // Get stats from both tables
  const postgresReport = await getPostgresGroupIdStats();
  const graphReport = await getGraphGroupIdStats();

  // Find orphaned groups
  const orphanedGroups = await findOrphanedGroupIds(orphanThresholdDays);

  // Find similar group_ids (potential typos)
  const allGroupIds = [
    ...new Set([
      ...postgresReport.groups.map((g) => g.group_id),
      ...graphReport.groups.map((g) => g.group_id),
    ]),
  ];
  const similarGroups = findSimilarGroupIds(allGroupIds, similarMaxDistance);

  // Generate recommendations
  const recommendations: string[] = [];

  if (postgresReport.invalid_groups.length > 0) {
    recommendations.push(
      `Fix ${postgresReport.invalid_groups.length} invalid group_id(s) in PostgreSQL: ` +
        postgresReport.invalid_groups.map((g) => g.group_id).join(", ")
    );
  }

  if (graphReport.invalid_groups.length > 0) {
    recommendations.push(
      `Fix ${graphReport.invalid_groups.length} invalid group_id(s) in graph_memories: ` +
        graphReport.invalid_groups.map((g) => g.group_id).join(", ")
    );
  }

  if (orphanedGroups.length > 0) {
    recommendations.push(
      `Consider archiving ${orphanedGroups.length} orphaned group(s) with no activity in ${orphanThresholdDays} days: ` +
        orphanedGroups.join(", ")
    );
  }

  if (similarGroups.length > 0) {
    recommendations.push(
      `Review ${similarGroups.length} potentially misspelled group_id pair(s): ` +
        similarGroups
          .slice(0, 5)
          .map((s) => `${s.group_id_1} ↔ ${s.group_id_2} (distance: ${s.distance})`)
          .join(", ") +
        (similarGroups.length > 5 ? ` ... and ${similarGroups.length - 5} more` : "")
    );
  }

  return {
    postgres: postgresReport,
    graph: graphReport,
    orphaned_groups: orphanedGroups,
    similar_groups: similarGroups,
    recommendations,
  };
}