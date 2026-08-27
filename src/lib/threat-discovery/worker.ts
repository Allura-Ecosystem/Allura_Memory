/**
 * Scheduled discovery and alert routing (Story 26.4).
 *
 * Composes two already-shipped, in-memory-only primitives:
 *   - Story 26.3's ExposureMatcher (src/lib/exposure/matcher.ts)
 *   - Story 26.5's DraftGenerator (src/lib/mitigation/draft-generator.ts)
 * and persists the durable, tenant-routed output this story is responsible
 * for: deduplicated alerts with a real lifecycle (migration 42) and, for
 * high/critical severity, a simulated mitigation draft.
 *
 * Slice A scope (this module): given ThreatAdvisory objects, match, persist,
 * route, and report. It does NOT fetch advisories from any external source
 * (GitHub Security Advisories / OSV.dev / npm audit) -- that is a separately
 * scoped follow-up (network fetch of untrusted third-party data is its own
 * security surface, per the approved record in
 * docs/governance/2026-08-27-story-26-4-security-owner-approval.md).
 *
 * AUTHORITY (AD-57): this module only ever creates alerts and simulated,
 * non-persisted mitigation drafts. It has no code path to activate policy,
 * block a package/CI workflow, revoke a credential, lock a workspace, or
 * contain an endpoint -- those remain separately gated, human-authorized
 * workflows (Story 26.5 AC 6-7's governed-approval.ts; Story 26.6).
 */

import type { PoolClient } from "pg"
import { randomUUID } from "crypto"
import { PersistedThreatAlert as PersistedThreatAlertSchema } from "./schemas"
import type {
  AlertWithDraft,
  DiscoveryCycleResult,
  DiscoveryRetryEvidence,
  PersistedThreatAlert,
} from "./types"
import { withWorkspaceTransaction } from "../db/tenant-transaction"
import type { ResolvedWorkspaceScope } from "../db/workspace-scope"
import { createExposureMatcher, type InventoryProvider } from "../exposure/matcher"
import type { ExposureAlert, ThreatAdvisory } from "../exposure/types"
import { createDraftGenerator } from "../mitigation/draft-generator"

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

const HIGH_SEVERITY = new Set(["high", "critical"])

type Queryable = Pick<PoolClient, "query">

function toTenantScope(scope: ResolvedWorkspaceScope) {
  return { group_id: scope.tenantId, workspace_id: scope.workspaceId }
}

/**
 * Persist one in-memory ExposureAlert. Deduplicated on
 * (group_id, workspace_id, dedup_key) -- AC-5: one alert per unique
 * exposure, not one per advisory match. Returns the persisted row and
 * whether this call actually created it (vs. an already-known exposure).
 */
export async function persistAlert(
  scope: ResolvedWorkspaceScope,
  alert: ExposureAlert,
): Promise<{ row: PersistedThreatAlert; isNew: boolean }> {
  if (alert.group_id !== scope.tenantId || alert.workspace_id !== scope.workspaceId) {
    throw new Error("alert tenant scope does not match caller scope")
  }

  return withWorkspaceTransaction(scope, async (client: Queryable) => {
    const inserted = await client.query(
      `INSERT INTO threat_alerts
         (id, group_id, workspace_id, inventory_ref, artifact_ref, advisory_refs,
          match_type, confidence, severity, evidence_ids, dedup_key, lifecycle_state)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10::jsonb, $11, 'new')
       ON CONFLICT (group_id, workspace_id, dedup_key) DO NOTHING
       RETURNING *`,
      [
        randomUUID(),
        scope.tenantId,
        scope.workspaceId,
        alert.inventory_ref,
        alert.artifact_ref,
        JSON.stringify(alert.advisory_refs),
        alert.match_type,
        alert.confidence,
        alert.severity,
        JSON.stringify(alert.evidence_ids),
        alert.dedup_key,
      ],
    )

    if (inserted.rows[0]) {
      return { row: PersistedThreatAlertSchema.parse(rowToAlert(inserted.rows[0])), isNew: true }
    }

    const existing = await client.query(
      `SELECT * FROM threat_alerts WHERE group_id = $1 AND workspace_id = $2 AND dedup_key = $3`,
      [scope.tenantId, scope.workspaceId, alert.dedup_key],
    )
    const row = existing.rows[0]
    if (!row) {
      throw new Error("threat_alerts insert conflicted but no existing row was found")
    }
    return { row: PersistedThreatAlertSchema.parse(rowToAlert(row)), isNew: false }
  })
}

/**
 * Transition an alert to 'stale' when its supporting evidence has degraded.
 * 'resolved' is terminal and is never overwritten by a staleness transition.
 */
export async function markAlertStale(scope: ResolvedWorkspaceScope, alertId: string): Promise<void> {
  await withWorkspaceTransaction(scope, async (client: Queryable) => {
    await client.query(
      `UPDATE threat_alerts
       SET lifecycle_state = 'stale', updated_at = NOW()
       WHERE id = $1 AND group_id = $2 AND workspace_id = $3 AND lifecycle_state <> 'resolved'`,
      [alertId, scope.tenantId, scope.workspaceId],
    )
  })
}

function rowToAlert(row: Record<string, unknown>): unknown {
  return {
    ...row,
    advisory_refs: typeof row.advisory_refs === "string" ? JSON.parse(row.advisory_refs) : row.advisory_refs,
    evidence_ids: typeof row.evidence_ids === "string" ? JSON.parse(row.evidence_ids) : row.evidence_ids,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  }
}

/**
 * Run one discovery cycle: match every advisory against inventory, persist
 * deduplicated alerts, generate a simulated draft for newly-created
 * high/critical severity alerts, and emit heartbeat audit evidence (AC-6).
 *
 * A per-advisory match failure does not abort the cycle -- it is counted
 * and surfaced in the heartbeat rather than losing every other advisory's
 * results to one bad input.
 */
export async function runDiscoveryCycle(
  scope: ResolvedWorkspaceScope,
  inventoryProvider: InventoryProvider,
  advisories: ThreatAdvisory[],
  retryEvidence?: DiscoveryRetryEvidence,
): Promise<DiscoveryCycleResult> {
  const tenantScope = toTenantScope(scope)
  const matcher = createExposureMatcher()
  const draftGenerator = createDraftGenerator()

  const alertsCreated: PersistedThreatAlert[] = []
  const draftsGenerated: AlertWithDraft[] = []
  let alertsAlreadyKnown = 0
  let advisoriesFailed = 0

  for (const advisory of advisories) {
    let matches
    try {
      matches = matcher.matchAdvisory(tenantScope, inventoryProvider, advisory)
    } catch {
      advisoriesFailed += 1
      continue
    }

    const inMemoryAlerts = matcher.createAlerts(tenantScope, matches)

    for (const inMemoryAlert of inMemoryAlerts) {
      const { row, isNew } = await persistAlert(scope, inMemoryAlert)

      if (!isNew) {
        alertsAlreadyKnown += 1
        continue
      }

      alertsCreated.push(row)

      if (HIGH_SEVERITY.has(row.severity)) {
        const draft = draftGenerator.generateDraft(tenantScope, inMemoryAlert)
        draftsGenerated.push({ alert: row, draft })
      }
    }
  }

  const heartbeat = {
    advisories_processed: advisories.length,
    advisories_failed: advisoriesFailed,
    alerts_created: alertsCreated.length,
    alerts_already_known: alertsAlreadyKnown,
    drafts_generated: draftsGenerated.length,
    ...(retryEvidence ? { retry: retryEvidence } : {}),
  }

  await withWorkspaceTransaction(scope, async (client: Queryable) => {
    await client.query(
      `INSERT INTO events (event_type, agent_id, group_id, workspace_id, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        "THREAT_DISCOVERY_HEARTBEAT",
        "threat-discovery-worker",
        scope.tenantId,
        scope.workspaceId,
        JSON.stringify(heartbeat),
      ],
    )

    if (advisoriesFailed > 0) {
      await client.query(
        `INSERT INTO events (event_type, agent_id, group_id, workspace_id, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          "BLOCKER",
          "threat-discovery-worker",
          scope.tenantId,
          scope.workspaceId,
          JSON.stringify({ kind: "threat_discovery_advisory_failures", advisories_failed: advisoriesFailed }),
        ],
      )
    }
  })

  return { alertsCreated, alertsAlreadyKnown, draftsGenerated, heartbeat }
}
