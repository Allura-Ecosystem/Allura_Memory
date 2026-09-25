import { withWorkspaceTransaction } from "@/lib/db/tenant-transaction"

import type { AuthorizedReadReceipt, ReadReceiptWriter } from "./read-receipt"

interface StoredReceipt {
  receipt_id: string
  witness_hash: string
}

function validReceipt(receipt: AuthorizedReadReceipt): boolean {
  return receipt.policyVersion === "epic30-production-v1" &&
    ["read_documents", "search_documents"].includes(receipt.action) &&
    receipt.decision === "allow_candidate" && receipt.reasonCode === "authorized" &&
    ["viewer", "curator", "admin"].includes(receipt.actorRole) &&
    /^[a-f0-9]{64}$/.test(receipt.sessionHash) && /^[a-f0-9]{64}$/.test(receipt.witnessHash) &&
    Number.isSafeInteger(receipt.policyEpoch) && receipt.policyEpoch > 0 &&
    ((receipt.action === "read_documents" && receipt.queryHash === null) ||
      (receipt.action === "search_documents" && /^[a-f0-9]{64}$/.test(receipt.queryHash ?? ""))) &&
    !Number.isNaN(new Date(receipt.occurredAt).getTime())
}

/**
 * Production-candidate receipt writer. Its only write is a transaction-local,
 * server-scoped SECURITY DEFINER procedure; it never receives owner access or
 * direct table DML. Routes must opt in separately after policy approval.
 */
export class ProductionReadReceiptWriter implements ReadReceiptWriter {
  async persist(receipt: AuthorizedReadReceipt): Promise<{ receiptId: string; witnessHash: string }> {
    if (!validReceipt(receipt)) throw new Error("Production read receipt refused")
    const scope = { tenantId: receipt.tenantId, workspaceId: receipt.workspaceId, principalId: receipt.principalId }
    return withWorkspaceTransaction(scope, async (client) => {
      const result = await client.query<StoredReceipt>(`SELECT receipt_id, witness_hash
        FROM app.record_brain_read_receipt($1::uuid,$2::text,$3::text,$4::bigint,$5::text,$6::text,$7::text,$8::timestamptz)`, [
        receipt.receiptId, receipt.action, receipt.actorRole, receipt.policyEpoch,
        receipt.sessionHash, receipt.witnessHash, receipt.queryHash, receipt.occurredAt,
      ])
      const stored = result.rows[0]
      if (!stored || stored.receipt_id !== receipt.receiptId || stored.witness_hash !== receipt.witnessHash) {
        throw new Error("Production read receipt acknowledgement refused")
      }
      return { receiptId: stored.receipt_id, witnessHash: stored.witness_hash }
    })
  }
}
