import { withWorkspaceTransaction } from "@/lib/db/tenant-transaction"

import type { MessagingReceipt, MessagingReceiptSink } from "./restricted-messaging"

interface StoredMessagingReceipt { receipt_id: string; witness_hash: string }

function validReceipt(receipt: MessagingReceipt): boolean {
  return receipt.decision === "allow" &&
    ["discover_contact", "invite_channel", "send_message", "read_back"].includes(receipt.action) &&
    typeof receipt.resourceId === "string" && receipt.resourceId.trim() === receipt.resourceId && receipt.resourceId.length > 0 && receipt.resourceId.length <= 1000 &&
    Number.isSafeInteger(receipt.policyEpoch) && receipt.policyEpoch > 0 && /^[a-f0-9]{64}$/.test(receipt.witnessHash)
}

/** Content-free receipt writer for the unactivated restricted-messaging boundary. */
export class RestrictedMessagingReceiptWriter implements MessagingReceiptSink {
  async persist(receipt: MessagingReceipt): Promise<{ receiptId: string; witnessHash: string }> {
    if (!validReceipt(receipt)) throw new Error("Restricted messaging receipt refused")
    const scope = { tenantId: receipt.tenantId, workspaceId: receipt.workspaceId, principalId: receipt.actorId }
    return withWorkspaceTransaction(scope, async (client) => {
      const result = await client.query<StoredMessagingReceipt>(`SELECT receipt_id, witness_hash
        FROM app.record_brain_messaging_receipt($1::uuid,$2::text,$3::text,$4::bigint,$5::text)`, [
        receipt.receiptId, receipt.action, receipt.resourceId, receipt.policyEpoch, receipt.witnessHash,
      ])
      const stored = result.rows[0]
      if (!stored || stored.receipt_id !== receipt.receiptId || stored.witness_hash !== receipt.witnessHash) {
        throw new Error("Restricted messaging receipt acknowledgement refused")
      }
      return { receiptId: stored.receipt_id, witnessHash: stored.witness_hash }
    })
  }
}
