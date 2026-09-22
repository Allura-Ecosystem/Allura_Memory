import { withTenantTransaction } from "@/lib/db/tenant-transaction"
import { getEpic30ReceiptPool } from "@/lib/postgres/connection"

import { assertSyntheticTarget, isSyntheticScope } from "./local-confinement"
import type { AuthorizedReadReceipt } from "./read-receipt"

/** Commits the content-free receipt before acknowledging a protected read. */
export async function persistSyntheticReadReceipt(
  receipt: AuthorizedReadReceipt,
): Promise<{ receiptId: string; witnessHash: string }> {
  const run = assertSyntheticTarget()
  const scope = { tenantId: receipt.tenantId, workspaceId: receipt.workspaceId, principalId: receipt.principalId }
  if (!isSyntheticScope(scope) || receipt.action !== "read_documents" ||
      receipt.decision !== "allow_candidate" || receipt.reasonCode !== "authorized" ||
      receipt.policyVersion !== "epic30-local-v2" ||
      !["viewer", "curator", "admin"].includes(receipt.actorRole) ||
      !Number.isSafeInteger(receipt.policyEpoch) || receipt.policyEpoch <= 0 ||
      !/^[a-f0-9]{64}$/.test(receipt.sessionHash) || !/^[a-f0-9]{64}$/.test(receipt.witnessHash)) {
    throw new Error("Synthetic receipt writer input refused")
  }
  const pool = getEpic30ReceiptPool()
  if (pool.options.host !== "127.0.0.1" || pool.options.port !== 5444 ||
      pool.options.database !== `allura_epic30_read_${run}` ||
      pool.options.user !== `allura_epic30_receipt_${run}` || pool.options.options) {
    throw new Error("Synthetic cached receipt pool refused")
  }
  return withTenantTransaction(scope, async (client) => {
    const identity = await client.query(`SELECT current_user, session_user,
      NOT rolsuper AND NOT rolbypassrls AS restricted,
      current_database() = $1 AS database_ok
      FROM pg_catalog.pg_roles WHERE rolname = current_user`, [`allura_epic30_read_${run}`])
    const row = identity.rows[0]
    const role = `allura_epic30_receipt_${run}`
    if (identity.rows.length !== 1 || row?.current_user !== role || row?.session_user !== role ||
        row?.restricted !== true || row?.database_ok !== true) {
      throw new Error("Synthetic receipt writer session refused")
    }
    await client.query(`INSERT INTO epic30_local.read_receipts
      (receipt_id, run_id, group_id, workspace_id, principal_id, actor_role, session_hash,
       policy_epoch, action, decision, reason_code, policy_version, witness_hash, occurred_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [
      receipt.receiptId, run, receipt.tenantId, receipt.workspaceId, receipt.principalId,
      receipt.actorRole, receipt.sessionHash, receipt.policyEpoch, receipt.action, receipt.decision,
      receipt.reasonCode, receipt.policyVersion, receipt.witnessHash, receipt.occurredAt,
    ])
    // withTenantTransaction commits before it resolves; no provisional ACK escapes.
    return { receiptId: receipt.receiptId, witnessHash: receipt.witnessHash }
  }, pool)
}
