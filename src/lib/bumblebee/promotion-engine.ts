if (typeof window !== "undefined") throw new Error("server-side only")

import { withTenantTransaction } from "@/lib/db/tenant-transaction"
import { getAppPool } from "@/lib/postgres/connection"

import type { ConformedRecord } from "./batch-conformance"
import { type BatchStoreDeps, createBatchStore } from "./batch-store"
import type { IngestLease } from "./ingest-pipeline"

// ── Public types ──────────────────────────────────────────────────────────

export type PromotionDecision = "promoted" | "held"

// Stable reason codes persisted to bumblebee_run_decisions.reason_code.
// Every code is a compile-time constant so audit logs and dashboards can
// group on a stable string without resolving runtime values.
export const PROMOTION_REASON = Object.freeze({
  promotedComplete: "PROMOTED_COMPLETE",
  heldPartial: "HELD_PARTIAL",
  heldError: "HELD_ERROR",
  heldTimeout: "HELD_TIMEOUT",
  heldMissingSummary: "HELD_MISSING_SUMMARY",
  heldFindingsOnly: "HELD_FINDINGS_ONLY",
  heldChangedRoots: "HELD_CHANGED_ROOTS",
  heldUnboundEcosystems: "HELD_UNBOUND_ECOSYSTEMS",
  heldDeepProfile: "HELD_DEEP_PROFILE",
  heldStaleGeneration: "HELD_STALE_GENERATION",
  heldContradictoryCounts: "HELD_CONTRADICTORY_COUNTS",
} as const)

// The roots the scan was issued with (from source config).  The summary's
// roots must match these exactly; any drift means the scan ran against a
// different working set than the server bound.
interface SourceRoot {
  readonly path: string
  readonly kind: string
}

export interface PromotionContext {
  readonly lease: IngestLease
  readonly batchId: string
  readonly records: readonly ConformedRecord[]
  readonly summary: ConformedRecord | undefined
  readonly sourceProfile: "baseline" | "project" | "deep"
  readonly sourceMode: "inventory" | "findings-only"
  readonly sourceEcosystems: readonly string[]
  readonly sourceRoots: readonly SourceRoot[]
}

// ── Helpers ───────────────────────────────────────────────────────────────

function payloadString(record: ConformedRecord | undefined, field: string): string {
  if (!record) return ""
  const value = record.sanitized_payload[field]
  return typeof value === "string" ? value : ""
}

function payloadBool(record: ConformedRecord | undefined, field: string): boolean {
  if (!record) return false
  const value = record.sanitized_payload[field]
  return value === true
}

function payloadCounts(record: ConformedRecord | undefined): Record<string, number> {
  if (!record) return {}
  const value = record.sanitized_payload.counts
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {}
  const result: Record<string, number> = {}
  for (const [key, raw] of Object.entries(value)) {
    result[key] = typeof raw === "number" && Number.isFinite(raw) ? raw : 0
  }
  return result
}

function payloadRoots(record: ConformedRecord | undefined): SourceRoot[] {
  if (!record) return []
  const value = record.sanitized_payload.roots
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) return null
      const path = (entry as Record<string, unknown>).path
      const kind = (entry as Record<string, unknown>).kind
      if (typeof path !== "string" || typeof kind !== "string") return null
      return { path, kind } as SourceRoot
    })
    .filter((entry): entry is SourceRoot => entry !== null)
}

// Roots comparison is by-value (path+kind) and order-independent so a scanner
// that discovers roots in a different order isn't flagged as a drift.
function rootsMatch(
  sourceRoots: readonly SourceRoot[],
  summaryRoots: readonly SourceRoot[],
): boolean {
  if (sourceRoots.length !== summaryRoots.length) return false
  const sourceKeys = new Set(sourceRoots.map((r) => `${r.path}\0${r.kind}`))
  for (const r of summaryRoots) {
    if (!sourceKeys.has(`${r.path}\0${r.kind}`)) return false
  }
  return true
}

function packageRecords(records: readonly ConformedRecord[]): ConformedRecord[] {
  return records.filter((r) => r.record_type === "package")
}

// Total package count from the summary's counts map — the sum of per-ecosystem
// counts.  This is what the scanner declares it emitted; we compare it to the
// actual package records in the batch.
function summaryPackageTotal(summary: ConformedRecord | undefined): number {
  const counts = payloadCounts(summary)
  return Object.values(counts).reduce((sum, n) => sum + n, 0)
}

// ── evaluatePromotion ─────────────────────────────────────────────────────

export function evaluatePromotion(
  ctx: PromotionContext,
): { decision: PromotionDecision; reasonCode: string } {
  // 1. Missing summary — the batch was truncated before the trailing
  //    scan_summary record.  No decision can be made; preserve current state.
  if (ctx.summary === undefined) {
    return { decision: "held", reasonCode: PROMOTION_REASON.heldMissingSummary }
  }

  const status = payloadString(ctx.summary, "status")
  const timedOut = payloadBool(ctx.summary, "timed_out")
  const errorField = payloadString(ctx.summary, "error")

  // 2. Timeout — even if status says complete, a timed_out=true flag means
  //    the scan was cut short; the inventory may be incomplete.
  if (timedOut) {
    return { decision: "held", reasonCode: PROMOTION_REASON.heldTimeout }
  }

  // 3. Error status or non-empty error field — the scanner itself reported a
  //    failure.  The batch is still durable evidence, but cannot replace
  //    current state.
  if (status === "error" || errorField.length > 0) {
    return { decision: "held", reasonCode: PROMOTION_REASON.heldError }
  }

  // 4. Partial status — the scan did not finish.
  if (status === "partial") {
    return { decision: "held", reasonCode: PROMOTION_REASON.heldPartial }
  }

  // 5. Deep profile — campaign evidence only.  Deep scans never replace the
  //    routine inventory; they are persisted for triage and correlation.
  if (ctx.sourceProfile === "deep") {
    return { decision: "held", reasonCode: PROMOTION_REASON.heldDeepProfile }
  }

  // 6. Findings-only mode — the batch contains finding records but no
  //    inventory population.  Evidence only; preserve routine package state.
  if (ctx.sourceMode === "findings-only") {
    return { decision: "held", reasonCode: PROMOTION_REASON.heldFindingsOnly }
  }

  // 7. Changed roots — the summary's roots don't match the server-bound
  //    source config.  The scanner ran against a different working set.
  const summaryRoots = payloadRoots(ctx.summary)
  if (!rootsMatch(ctx.sourceRoots, summaryRoots)) {
    return { decision: "held", reasonCode: PROMOTION_REASON.heldChangedRoots }
  }

  // 8. Unbound ecosystems — the summary references ecosystems not in the
  //    server-bound source config.  Filtered/unbound runs are evidence only.
  const counts = payloadCounts(ctx.summary)
  const summaryEcosystems = Object.keys(counts)
  const sourceEcosystemSet = new Set(ctx.sourceEcosystems)
  for (const eco of summaryEcosystems) {
    if (!sourceEcosystemSet.has(eco)) {
      return { decision: "held", reasonCode: PROMOTION_REASON.heldUnboundEcosystems }
    }
  }

  // 9. Contradictory counts — the summary claims N packages but the batch
  //    contains a different number of package records.  This catches a
  //    corrupted or tampered batch where the summary lied about totals.
  if (status === "complete") {
    const actualPackages = packageRecords(ctx.records).length
    const claimedPackages = summaryPackageTotal(ctx.summary)
    if (actualPackages !== claimedPackages) {
      return { decision: "held", reasonCode: PROMOTION_REASON.heldContradictoryCounts }
    }
    return { decision: "promoted", reasonCode: PROMOTION_REASON.promotedComplete }
  }

  // 10. Any status we don't recognise — hold with a generic reason.  This
  //     should never happen with the pinned scanner, but failing closed on
  //     unknown values is safer than promoting.
  return { decision: "held", reasonCode: PROMOTION_REASON.heldPartial }
}

// ── persistPromotion ──────────────────────────────────────────────────────

export interface PersistPromotionInput {
  readonly lease: IngestLease
  readonly batchId: string
  readonly runId: string
  readonly summaryRecordId: string
  readonly decision: PromotionDecision
  readonly reasonCode: string
}

// Inserts a new row into bumblebee_run_decisions.  The DB CHECK enforces that
// a 'promoted' decision cannot exist without a summary_record_id, but we
// validate in code first so the error message is clear instead of a raw
// Postgres constraint violation.
export async function persistPromotion(
  deps: BatchStoreDeps,
  input: PersistPromotionInput,
): Promise<void> {
  if (input.decision === "promoted" && (!input.summaryRecordId || input.summaryRecordId.length === 0)) {
    throw new Error("persistPromotion: promoted decision requires a summaryRecordId")
  }

  // Deterministic decision_id from (lease, batch) so a retried promotion
  // attempt targets the same row identity instead of minting duplicates.
  // This mirrors the mintDecisionId pattern in batch-store.ts.
  const decisionId = `dec_${input.lease.leaseId}_${input.batchId}`

  await deps.pool.query(
    `INSERT INTO bumblebee_run_decisions
       (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id,
        decision_id, run_id, summary_record_id, decision, reason_code)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      input.lease.groupId,
      input.lease.workspaceId,
      input.lease.sourceId,
      input.lease.sourceRevisionId,
      input.lease.leaseId,
      input.batchId,
      decisionId,
      input.runId,
      // Null for held decisions without a summary; the DB column is nullable
      // and the CHECK only fires for 'promoted'.
      input.summaryRecordId.length > 0 ? input.summaryRecordId : null,
      input.decision,
      input.reasonCode,
    ],
  )
}

// ── createPromotionStore ──────────────────────────────────────────────────

// Returns a bound persistPromotion function scoped via withTenantTransaction,
// mirroring the createScopedIngestStore pattern from lease-repository.ts.
// The factory opens a scoped transaction, creates a batch store with
// transactional:false (the outer transaction owns commit/rollback), reads the
// batch's records and summary from bumblebee_records, evaluates promotion,
// and if promoted, persists the promotion decision.
export async function createPromotionStore(lease: IngestLease): Promise<{
  promote: (params: { batchId: string; runId: string; summaryRecordId: string }) => Promise<{
    decision: PromotionDecision
    reasonCode: string
  }>
}> {
  const promote = async (params: {
    batchId: string
    runId: string
    summaryRecordId: string
  }): Promise<{ decision: PromotionDecision; reasonCode: string }> => {
    return withTenantTransaction(
      {
        tenantId: lease.groupId,
        workspaceId: lease.workspaceId,
        principalId: `bumblebee-promote:${lease.leaseId}`,
      },
      async (client) => {
        // transactional:false — the scoped transaction (this callback)
        // owns BEGIN/COMMIT/ROLLBACK via withTenantTransaction.
        const store = await createBatchStore({ pool: client, transactional: false })

        // Read all records for this batch from bumblebee_records.  The records
        // are append-only evidence; reading them back gives us the exact
        // persisted set to evaluate promotion against.
        const recordsResult = await client.query<{
          record_type: string
          record_id: string
          run_id: string
          sanitized_payload: unknown
          line_number: number
          line_sha256: string
          canonical_id_inputs: string
          redaction_provenance: unknown
        }>(
          `SELECT record_type, record_id, run_id, sanitized_payload, line_number,
                  line_sha256, canonical_id_inputs, redaction_provenance
           FROM bumblebee_records
           WHERE group_id=$1 AND workspace_id=$2 AND source_id=$3
             AND source_revision_id=$4 AND lease_id=$5 AND batch_id=$6`,
          [
            lease.groupId,
            lease.workspaceId,
            lease.sourceId,
            lease.sourceRevisionId,
            lease.leaseId,
            params.batchId,
          ],
        )

        const rows = recordsResult.rows
        const summaryRow = rows.find((r) => r.record_type === "scan_summary")

        // Reconstruct ConformedRecord shapes from the DB rows so
        // evaluatePromotion can inspect sanitized_payload fields.
        const summary: ConformedRecord | undefined = summaryRow
          ? {
              line_number: summaryRow.line_number,
              line_sha256: summaryRow.line_sha256,
              record_type: "scan_summary",
              record_id: summaryRow.record_id,
              run_id: summaryRow.run_id,
              sanitized_payload: summaryRow.sanitized_payload as Record<string, unknown>,
              canonical_id_inputs: summaryRow.canonical_id_inputs,
              redaction_provenance: summaryRow.redaction_provenance as { endpoint: "stripped" },
            }
          : undefined

        const records: ConformedRecord[] = rows
          .filter((r) => r.record_type !== "scan_summary")
          .map((r) => ({
            line_number: r.line_number,
            line_sha256: r.line_sha256,
            record_type: r.record_type as ConformedRecord["record_type"],
            record_id: r.record_id,
            run_id: r.run_id,
            sanitized_payload: r.sanitized_payload as Record<string, unknown>,
            canonical_id_inputs: r.canonical_id_inputs,
            redaction_provenance: r.redaction_provenance as { endpoint: "stripped" },
          }))

        const ctx: PromotionContext = {
          lease,
          batchId: params.batchId,
          records,
          summary,
          sourceProfile: lease.profile ?? "baseline",
          sourceMode: lease.mode ?? "inventory",
          sourceEcosystems: lease.ecosystems ?? [],
          sourceRoots: [], // Roots come from the source config; the caller
          // must supply them via a higher-level orchestrator that has
          // access to the source revision's bound config.  An empty array
          // means "no roots were bound" — the summary must also have no
          // roots for promotion to succeed.
        }

        const result = evaluatePromotion(ctx)

        if (result.decision === "promoted") {
          await persistPromotion(
            { pool: client, transactional: false },
            {
              lease,
              batchId: params.batchId,
              runId: params.runId,
              summaryRecordId: params.summaryRecordId,
              decision: result.decision,
              reasonCode: result.reasonCode,
            },
          )
        }

        // Mark store as used to satisfy the linter — the batch store was
        // created to share the scoped transaction with persistPromotion.
        void store

        return result
      },
      getAppPool(),
    )
  }

  return { promote }
}