/**
 * Inventory reconciliation (Bumblebee Guard) -- persists parsed source
 * records (currently: bun.lock via lockfile-parser.ts) into inventory_records
 * (migration 44) and ages out anything no longer present.
 *
 * This is the first real writer for the previously-in-memory-only Story
 * 26.2 inventory service. Story 26.4's discovery worker reads from this
 * table (via hydrateInventoryService) instead of an empty in-memory
 * service.
 */

import { createInventoryService, type InventoryService } from "./service"
import type { InventorySourceRecord } from "./types"
import { withWorkspaceTransaction } from "../db/tenant-transaction"
import type { ResolvedWorkspaceScope } from "../db/workspace-scope"

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

export interface ReconciliationResult {
  upserted: number
  markedStale: number
}

/**
 * Upsert every current record for one source_ref, then mark any existing
 * record for that same source_ref NOT present in the current set as
 * 'stale' -- never deleted (Story 26.2 AC-5: missing items are marked, not
 * silently omitted).
 *
 * Safety guard: an EMPTY currentRecords list is treated as "the source
 * could not be read this cycle," not "every package was removed" -- it
 * marks nothing stale rather than wrongly downgrading the entire inventory
 * on a transient parse/read failure. A source that genuinely has zero
 * packages left would need an explicit, separate signal to age out its
 * prior records; this function does not infer that from silence.
 */
export async function reconcileInventory(
  scope: ResolvedWorkspaceScope,
  sourceRef: string,
  currentRecords: readonly InventorySourceRecord[],
): Promise<ReconciliationResult> {
  if (currentRecords.length === 0) {
    return { upserted: 0, markedStale: 0 }
  }

  return withWorkspaceTransaction(scope, async (client) => {
    for (const record of currentRecords) {
      await client.query(
        `INSERT INTO inventory_records
           (id, group_id, workspace_id, artifact_type, ecosystem, package, version, hash,
            publisher, workflow_reference, source_ref, trust_state, freshness_state, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
         ON CONFLICT (group_id, workspace_id, id) DO UPDATE SET
           artifact_type = EXCLUDED.artifact_type,
           ecosystem = EXCLUDED.ecosystem,
           package = EXCLUDED.package,
           version = EXCLUDED.version,
           hash = EXCLUDED.hash,
           publisher = EXCLUDED.publisher,
           workflow_reference = EXCLUDED.workflow_reference,
           source_ref = EXCLUDED.source_ref,
           trust_state = EXCLUDED.trust_state,
           freshness_state = EXCLUDED.freshness_state,
           updated_at = NOW()`,
        [
          record.id,
          scope.tenantId,
          scope.workspaceId,
          record.artifact_type,
          record.ecosystem,
          record.package,
          record.version,
          record.hash,
          record.publisher,
          record.workflow_reference,
          record.source_ref,
          record.trust_state,
          record.freshness_state,
        ],
      )
    }

    const currentIds = currentRecords.map((r) => r.id)
    const staleResult = await client.query(
      `UPDATE inventory_records
       SET freshness_state = 'stale', updated_at = NOW()
       WHERE group_id = $1 AND workspace_id = $2 AND source_ref = $3
         AND freshness_state <> 'stale'
         AND NOT (id = ANY($4::text[]))`,
      [scope.tenantId, scope.workspaceId, sourceRef, currentIds],
    )

    return { upserted: currentRecords.length, markedStale: staleResult.rowCount ?? 0 }
  })
}

/**
 * Read all persisted inventory_records for a tenant and hydrate a fresh,
 * in-memory Story 26.2 InventoryService via ingestSources() -- the bridge
 * between this persistence layer and the existing matching primitive
 * (src/lib/exposure/matcher.ts's InventoryProvider interface), which never
 * changes: it still only ever sees an in-memory service.
 */
export async function hydrateInventoryService(scope: ResolvedWorkspaceScope): Promise<InventoryService> {
  const service = createInventoryService()

  const rows = await withWorkspaceTransaction(scope, (client) =>
    client.query<{
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
    }>(
      `SELECT id, artifact_type, ecosystem, package, version, hash, publisher, workflow_reference, source_ref, trust_state, freshness_state
       FROM inventory_records
       WHERE group_id = $1 AND workspace_id = $2`,
      [scope.tenantId, scope.workspaceId],
    ),
  )

  if (rows.rows.length > 0) {
    service.ingestSources(
      { group_id: scope.tenantId, workspace_id: scope.workspaceId },
      rows.rows as unknown as InventorySourceRecord[],
    )
  }

  return service
}
