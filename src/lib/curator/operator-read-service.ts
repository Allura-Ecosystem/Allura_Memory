/**
 * Shared curator-owned operator read boundary (Story 25.3a).
 *
 * Operator surfaces -- including Bumblebee -- consume this curator-owned
 * boundary. Every function is READ-ONLY
 * (SELECT only, no INSERT/UPDATE/DELETE anywhere in this file) and every
 * function goes through `withWorkspaceTransaction`, which sets the
 * `app.current_group_id` / `app.current_workspace_id` GUCs that the RLS
 * policies on all four underlying tables enforce.
 *
 * WHY EVERY QUERY ALSO CARRIES AN EXPLICIT `group_id = $1` PREDICATE even
 * though RLS already isolates: defence in depth. RLS is the control that must
 * hold, but a predicate that agrees with it means a future migration that
 * accidentally drops or loosens a policy degrades to "returns nothing"
 * instead of "returns another tenant's rows". The adversarial tests assert
 * the RLS layer independently, so this belt is never mistaken for the braces.
 *
 * AD-57 boundary: this module is the operator's *window*, not a control
 * surface. It cannot acknowledge an alert, approve a draft, or trigger
 * containment -- those all require the governed paths in
 * src/lib/mitigation/governed-approval.ts and
 * src/lib/containment/governed-authorization.ts, each of which needs a real
 * approval_ref through the REQ-GOV-008 gate.
 */

import { withWorkspaceTransaction } from "../db/tenant-transaction"
import type { ResolvedWorkspaceScope } from "../db/workspace-scope"

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

/** Hard cap on any single surface's page size, to bound an operator query. */
export const MAX_PAGE_SIZE = 200
const DEFAULT_PAGE_SIZE = 50

function clampLimit(limit?: number): number {
  if (limit === undefined || !Number.isFinite(limit) || limit < 1) return DEFAULT_PAGE_SIZE
  return Math.min(Math.floor(limit), MAX_PAGE_SIZE)
}

export interface SourceRow {
  id: string
  artifact_type: string
  ecosystem: string
  package: string
  version: string
  hash: string
  publisher: string
  workflow_reference: string
  source_ref: string
  trust_state: string
  freshness_state: string
  updated_at: string
}

export interface ExposureRow {
  id: string
  inventory_ref: string
  artifact_ref: string
  advisory_refs: unknown
  match_type: string
  severity: string
  lifecycle_state: string
  dedup_key: string
  created_at: string
  updated_at: string
}

export interface ReceiptRow {
  /** Which governed table this receipt came from. */
  kind: "mitigation" | "containment"
  id: string
  action: string
  actor_id: string
  actor_role: string
  rationale: string
  policy_reference: string
  approval_ref: string
  /** Containment receipts carry a real authorization chain; mitigation ones do not. */
  authorization_chain: unknown
  /** Containment: the thing acted on. Mitigation: the draft decided on. */
  subject_ref: string
  occurred_at: string
}

/** Sources surface: what supply-chain artifacts this workspace knows about. */
export async function listSources(
  scope: ResolvedWorkspaceScope,
  options: { limit?: number; artifactType?: string } = {},
): Promise<SourceRow[]> {
  const limit = clampLimit(options.limit)
  return withWorkspaceTransaction(scope, async (client) => {
    const result = await client.query<SourceRow>(
      `SELECT id, artifact_type, ecosystem, package, version, hash, publisher,
              workflow_reference, source_ref, trust_state, freshness_state, updated_at
         FROM inventory_records
        WHERE group_id = $1 AND workspace_id = $2
          AND ($3::text IS NULL OR artifact_type = $3)
        ORDER BY updated_at DESC, id
        LIMIT $4`,
      [scope.tenantId, scope.workspaceId, options.artifactType ?? null, limit],
    )
    return result.rows
  })
}

/** Exposures surface: matched threat alerts and their lifecycle. */
export async function listExposures(
  scope: ResolvedWorkspaceScope,
  options: { limit?: number; lifecycleState?: string; severity?: string } = {},
): Promise<ExposureRow[]> {
  const limit = clampLimit(options.limit)
  return withWorkspaceTransaction(scope, async (client) => {
    const result = await client.query<ExposureRow>(
      `SELECT id, inventory_ref, artifact_ref, advisory_refs, match_type, severity,
              lifecycle_state, dedup_key, created_at, updated_at
         FROM threat_alerts
        WHERE group_id = $1 AND workspace_id = $2
          AND ($3::text IS NULL OR lifecycle_state = $3)
          AND ($4::text IS NULL OR severity = $4)
        ORDER BY created_at DESC, id
        LIMIT $5`,
      [scope.tenantId, scope.workspaceId, options.lifecycleState ?? null, options.severity ?? null, limit],
    )
    return result.rows
  })
}

/**
 * Incidents surface: exposures that have progressed past `new` -- i.e. an
 * operator or the pipeline has actually engaged with them.
 *
 * "Incident" is deliberately derived from alert lifecycle rather than being a
 * separate table: inventing an `incidents` table would create a second source
 * of truth about the same event that could silently disagree with
 * `threat_alerts`.
 */
export async function listIncidents(
  scope: ResolvedWorkspaceScope,
  options: { limit?: number } = {},
): Promise<ExposureRow[]> {
  const limit = clampLimit(options.limit)
  return withWorkspaceTransaction(scope, async (client) => {
    const result = await client.query<ExposureRow>(
      `SELECT id, inventory_ref, artifact_ref, advisory_refs, match_type, severity,
              lifecycle_state, dedup_key, created_at, updated_at
         FROM threat_alerts
        WHERE group_id = $1 AND workspace_id = $2
          AND lifecycle_state <> 'new'
        ORDER BY updated_at DESC, id
        LIMIT $3`,
      [scope.tenantId, scope.workspaceId, limit],
    )
    return result.rows
  })
}

/**
 * Receipts surface: every governed decision, from BOTH receipt tables.
 *
 * These are queried separately and merged in TypeScript rather than through a
 * SQL UNION. The two tables record genuinely different things -- a mitigation
 * receipt records a DECISION about a draft (`draft_id`, approve/reject); a
 * containment receipt records an ACTION taken on real infrastructure
 * (`target_ref`, `connector`, plus an `authorization_chain` that mitigation
 * receipts have no equivalent of). A UNION would have to null-pad or
 * relabel those columns, which would quietly assert an equivalence that does
 * not exist and make the audit surface less truthful, not more convenient.
 */
export async function listReceipts(
  scope: ResolvedWorkspaceScope,
  options: { limit?: number } = {},
): Promise<ReceiptRow[]> {
  const limit = clampLimit(options.limit)

  return withWorkspaceTransaction(scope, async (client) => {
    const mitigation = await client.query(
      `SELECT id, action, actor_id, actor_role, rationale, policy_reference,
              approval_ref, draft_id, occurred_at
         FROM mitigation_receipts
        WHERE group_id = $1 AND workspace_id = $2
        ORDER BY occurred_at DESC, id
        LIMIT $3`,
      [scope.tenantId, scope.workspaceId, limit],
    )

    const containment = await client.query(
      `SELECT id, action, actor_id, actor_role, rationale, policy_reference,
              approval_ref, target_ref, connector, authorization_chain, occurred_at
         FROM containment_receipts
        WHERE group_id = $1 AND workspace_id = $2
        ORDER BY occurred_at DESC, id
        LIMIT $3`,
      [scope.tenantId, scope.workspaceId, limit],
    )

    const rows: ReceiptRow[] = [
      ...mitigation.rows.map((r) => ({
        kind: "mitigation" as const,
        id: String(r.id),
        action: String(r.action),
        actor_id: String(r.actor_id),
        actor_role: String(r.actor_role),
        rationale: String(r.rationale),
        policy_reference: String(r.policy_reference),
        approval_ref: String(r.approval_ref),
        authorization_chain: null,
        subject_ref: String(r.draft_id),
        occurred_at: toIso(r.occurred_at),
      })),
      ...containment.rows.map((r) => ({
        kind: "containment" as const,
        id: String(r.id),
        action: `${String(r.connector)}:${String(r.action)}`,
        actor_id: String(r.actor_id),
        actor_role: String(r.actor_role),
        rationale: String(r.rationale),
        policy_reference: String(r.policy_reference),
        approval_ref: String(r.approval_ref),
        authorization_chain: r.authorization_chain,
        subject_ref: String(r.target_ref),
        occurred_at: toIso(r.occurred_at),
      })),
    ]

    rows.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    return rows.slice(0, limit)
  })
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

export interface BumblebeeSummary {
  sources: number
  unpinnedActions: number
  openExposures: number
  incidents: number
  receipts: number
}

/**
 * Counts for the module's landing view using a host-owned transaction.
 * The issuer calls this before writing its immutable issuance snapshot, so an
 * available module and the exact read snapshot are committed together.
 */
export async function getBumblebeeSummaryInTransaction(
  client: import("pg").PoolClient,
  scope: ResolvedWorkspaceScope,
): Promise<BumblebeeSummary> {
    const result = await client.query<Record<string, string>>(
      `SELECT
         (SELECT COUNT(*) FROM inventory_records
           WHERE group_id = $1 AND workspace_id = $2) AS sources,
         (SELECT COUNT(*) FROM inventory_records
           WHERE group_id = $1 AND workspace_id = $2
             AND artifact_type = 'ci_workflow' AND hash = 'unpinned') AS unpinned_actions,
         (SELECT COUNT(*) FROM threat_alerts
           WHERE group_id = $1 AND workspace_id = $2
             AND lifecycle_state NOT IN ('resolved', 'stale')) AS open_exposures,
         (SELECT COUNT(*) FROM threat_alerts
           WHERE group_id = $1 AND workspace_id = $2
             AND lifecycle_state <> 'new') AS incidents,
         (SELECT
            (SELECT COUNT(*) FROM mitigation_receipts WHERE group_id = $1 AND workspace_id = $2)
          + (SELECT COUNT(*) FROM containment_receipts WHERE group_id = $1 AND workspace_id = $2)
         ) AS receipts`,
      [scope.tenantId, scope.workspaceId],
    )

    const row = result.rows[0] ?? {}
    return {
      sources: Number(row.sources ?? 0),
      unpinnedActions: Number(row.unpinned_actions ?? 0),
      openExposures: Number(row.open_exposures ?? 0),
      incidents: Number(row.incidents ?? 0),
      receipts: Number(row.receipts ?? 0),
    }
}

/** Counts for callers that do not need to couple the read to another write. */
export async function getBumblebeeSummary(scope: ResolvedWorkspaceScope): Promise<BumblebeeSummary> {
  return withWorkspaceTransaction(scope, (client) => getBumblebeeSummaryInTransaction(client, scope))
}
